'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, Phone, Scan, AlertCircle } from 'lucide-react'

interface CapturedImage {
  src: string
  blob: Blob
  width: number
  height: number
}

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

declare global {
  interface Window {
    cv: any;
  }
}

interface Point {
  x: number;
  y: number;
}

interface DetectedShape {
  corners: Point[];
  area: number;
  aspectRatio: number;
  confidence: number;
  type: 'rectangle' | 'square' | 'document';
}

interface GuidanceInfo {
  distance: 'close' | 'good' | 'far' | null;
  tilt: number;
  offsetX: number;
  offsetY: number;
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const flashRef = useRef<HTMLDivElement>(null)

  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [isDetectionReady, setIsDetectionReady] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [isLowLight, setIsLowLight] = useState(false)
  const [guidance, setGuidance] = useState<GuidanceInfo>({ distance: null, tilt: 0, offsetX: 0, offsetY: 0 })
  const animationFrameRef = useRef<number>(0)

  // Use refs for values read inside the rAF loop to avoid stale closure bugs.
  // Mirror them to state only for React re-renders (UI).
  const [bestShape, setBestShape] = useState<DetectedShape | null>(null)
  const [isShapeStable, setIsShapeStable] = useState(false)
  const bestShapeRef    = useRef<DetectedShape | null>(null)
  const isShapeStableRef = useRef(false)

  const stableFrameCount = useRef(0)
  const detectionHistory = useRef<DetectedShape[]>([])
  const lastFrameTime = useRef<number>(0)

  // Device detection
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'other'>('other');
  const [performanceTier, setPerformanceTier] = useState<'high' | 'medium' | 'low'>('medium');

  // ✅ Auto-detection OFF by default
  const [isAutoDetectionEnabled, setIsAutoDetectionEnabled] = useState(false)

  const getParams = () => {
    const baseParams = {
      ios: {
        high:   { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 10, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 220 },
        medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 190 },
        low:    { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 160 }
      },
      android: {
        high:   { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 10, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 220 },
        medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 190 },
        low:    { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 160 }
      },
      other: {
        high:   { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 10, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 220 },
        medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 190 },
        low:    { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 160 }
      }
    };
    return baseParams[deviceType][performanceTier];
  };

  const playSound = useCallback((type: 'lock' | 'shutter') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'lock') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch { /* audio not available */ }
  }, []);

  const triggerFlash = useCallback(() => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);
  }, []);

  const checkLightLevel = useCallback((canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) total += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    return (total / (data.length / 4)) > 50;
  }, []);

  const calcGuidance = useCallback((shape: DetectedShape, cw: number, ch: number): GuidanceInfo => {
    const areaRatio = shape.area / (cw * ch);
    let distance: GuidanceInfo['distance'] = 'good';
    if (areaRatio < 0.15) distance = 'far';
    else if (areaRatio > 0.7) distance = 'close';
    const cx = shape.corners.reduce((s, c) => s + c.x, 0) / 4;
    const cy = shape.corners.reduce((s, c) => s + c.y, 0) / 4;
    const offsetX = (cx - cw / 2) / (cw / 2);
    const offsetY = (cy - ch / 2) / (ch / 2);
    const p1 = shape.corners[0], p2 = shape.corners[1];
    const tilt = Math.abs(Math.atan2(p2.y - p1.y, p2.x - p1.x)) * (180 / Math.PI);
    return { distance, tilt, offsetX, offsetY };
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android/i.test(ua)) setDeviceType('android');
    else if (/iPad|iPhone|iPod/.test(ua)) setDeviceType('ios');
    else setDeviceType('other');

    const cores = navigator.hardwareConcurrency;
    if (cores >= 6) setPerformanceTier('high');
    else if (cores <= 2) setPerformanceTier('low');
    else setPerformanceTier('medium');
  }, []);

  // Safety guard: if user enables auto-detect on a low-end device, force it back off
  useEffect(() => {
    if (performanceTier === 'low' && isAutoDetectionEnabled) {
      setIsAutoDetectionEnabled(false);
    }
  }, [performanceTier, isAutoDetectionEnabled]);

  const videoConstraints = {
    width:  { ideal: deviceType === 'ios' ? 1920 : 1280 },
    height: { ideal: deviceType === 'ios' ? 1080 : 720 },
    facingMode: 'environment',
    frameRate: { ideal: 24, max: 30 },
    aspectRatio: 16 / 9,
    brightness:  { ideal: 1.0 },
    contrast:    { ideal: 1.0 },
    saturation:  { ideal: 1.0 },
  }

  useEffect(() => {
    const loadOpenCV = async () => {
      try {
        if (window.cv?.Mat) { setIsDetectionReady(true); return; }
        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise<void>((resolve) => {
          const check = () => {
            if (window.cv?.Mat && typeof window.cv.imread === 'function') {
              setIsDetectionReady(true);
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
      } catch (e) {
        console.error('OpenCV load failed:', e);
        setIsDetectionReady(false);
      }
    };
    loadOpenCV();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, []);

  // ─── Shape detection helpers ─────────────────────────────────────────────

  const dist = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  const isRectangularContour = (corners: Point[], tolerance = 40): boolean => {
    if (corners.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      const p1 = corners[(i - 1 + 4) % 4];
      const p2 = corners[i];
      const p3 = corners[(i + 1) % 4];
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      const dot   = v1.x * v2.x + v1.y * v2.y;
      const cross = v1.x * v2.y - v1.y * v2.x;
      const angle = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
      if (Math.abs(angle - 90) > tolerance) return false;
    }
    return true;
  };

  const detectDocumentShapes = (canvas: HTMLCanvasElement): DetectedShape[] => {
    const { CONFIDENCE_THRESHOLD } = getParams();
    if (!window.cv || !canvas) return [];

    try {
      const src      = window.cv.imread(canvas);
      const gray     = new window.cv.Mat();
      const blurred  = new window.cv.Mat();
      const edges    = new window.cv.Mat();

      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

      // Stronger denoising for cleaner edges
      window.cv.GaussianBlur(gray, blurred, new window.cv.Size(5, 5), 0);

      // Adaptive thresholds based on scene brightness
      const mean = window.cv.mean(blurred)[0];
      const lo = mean > 127 ? 20 : 35;
      const hi = mean > 127 ? 75 : 110;
      window.cv.Canny(blurred, edges, lo, hi, 3, true);

      // Close small gaps in edges
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(4, 4));
      window.cv.dilate(edges, edges, kernel);
      window.cv.erode(edges, edges, kernel);

      const contours  = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

      const imgArea  = canvas.width * canvas.height;
      const minArea  = imgArea * 0.03;
      const maxArea  = imgArea * 0.96;

      const candidates: { contour: any; area: number }[] = [];
      for (let i = 0; i < contours.size(); i++) {
        const c    = contours.get(i);
        const area = window.cv.contourArea(c);
        if (area >= minArea && area <= maxArea) candidates.push({ contour: c, area });
        else c.delete();
      }

      candidates.sort((a, b) => b.area - a.area);

      const maxCandidates = performanceTier === 'high' ? 10 : performanceTier === 'medium' ? 7 : 5;
      const detected: DetectedShape[] = [];

      for (let i = 0; i < Math.min(maxCandidates, candidates.length); i++) {
        const { contour, area } = candidates[i];
        const perimeter = window.cv.arcLength(contour, true);
        if (perimeter < 80) { contour.delete(); continue; }

        const approx   = new window.cv.Mat();
        const epsilon  = 0.03 * perimeter;
        window.cv.approxPolyDP(contour, approx, epsilon, true);

        if (approx.rows >= 4 && approx.rows <= 8) {
          const corners: Point[] = [];
          for (let j = 0; j < approx.rows; j++) {
            corners.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }

          let final = corners.length > 4 ? findBestQuad(corners) : corners;

          if (
            final.length === 4 &&
            isValidQuad(final) &&
            isRectangularContour(final, 50)
          ) {
            const sorted      = sortCorners(final);
            const aspectRatio = calcAspectRatio(sorted);
            const confidence  = calcConfidence(sorted, area, canvas.width, canvas.height, perimeter);

            if (confidence >= CONFIDENCE_THRESHOLD) {
              detected.push({
                corners: sorted,
                area,
                aspectRatio,
                confidence,
                type: classifyShape(aspectRatio),
              });
            }
          }
        }

        approx.delete();
        contour.delete();
      }

      src.delete(); gray.delete(); blurred.delete();
      edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();

      return detected.sort((a, b) => b.confidence - a.confidence);
    } catch (e) {
      console.error('Shape detection error:', e);
      return [];
    }
  };

  // ─── Geometry helpers ────────────────────────────────────────────────────

  const findBestQuad = (points: Point[]): Point[] => {
    const hull = convexHull(points);
    return hull.length === 4 ? hull : reduceToQuad(hull);
  };

  const convexHull = (pts: Point[]): Point[] => {
    if (pts.length < 3) return pts;
    let lm = 0;
    for (let i = 1; i < pts.length; i++)
      if (pts[i].x < pts[lm].x || (pts[i].x === pts[lm].x && pts[i].y < pts[lm].y)) lm = i;
    const hull: Point[] = [];
    let cur = lm;
    do {
      hull.push(pts[cur]);
      let nxt = (cur + 1) % pts.length;
      for (let i = 0; i < pts.length; i++) {
        const cross = (pts[cur].x - pts[nxt].x) * (pts[i].y - pts[nxt].y) -
                      (pts[cur].y - pts[nxt].y) * (pts[i].x - pts[nxt].x);
        if (cross > 0 || (cross === 0 && dist(pts[cur], pts[i]) > dist(pts[cur], pts[nxt]))) nxt = i;
      }
      cur = nxt;
    } while (cur !== lm && hull.length < pts.length);
    return hull;
  };

  const reduceToQuad = (pts: Point[]): Point[] => {
    if (pts.length <= 4) return pts;
    const curvatures = pts.map((curr, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
      const v2 = { x: next.x - curr.x, y: next.y - curr.y };
      const dot  = v1.x * v2.x + v1.y * v2.y;
      const mag1 = Math.hypot(v1.x, v1.y);
      const mag2 = Math.hypot(v2.x, v2.y);
      if (!mag1 || !mag2) return { index: i, c: 0 };
      return { index: i, c: Math.abs(Math.PI - Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))))) };
    });
    return curvatures.sort((a, b) => b.c - a.c).slice(0, 4).sort((a, b) => a.index - b.index).map(x => pts[x.index]);
  };

  const isValidQuad = (corners: Point[]): boolean => {
    if (corners.length !== 4) return false;
    const area = Math.abs(corners.reduce((s, p, i) => {
      const q = corners[(i + 1) % 4];
      return s + p.x * q.y - q.x * p.y;
    }, 0)) / 2;
    if (area < 500) return false;
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i], p2 = corners[(i + 1) % 4], p3 = corners[(i + 2) % 4];
      if (Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) < 50) return false;
    }
    return true;
  };

  const calcAspectRatio = (corners: Point[]): number => {
    const w = (dist(corners[0], corners[1]) + dist(corners[2], corners[3])) / 2;
    const h = (dist(corners[1], corners[2]) + dist(corners[3], corners[0])) / 2;
    return Math.max(w / h, h / w);
  };

  const classifyShape = (ar: number): 'square' | 'rectangle' | 'document' =>
    ar <= 1.3 ? 'square' : ar <= 2.0 ? 'rectangle' : 'document';

  const calcConfidence = (corners: Point[], area: number, cw: number, ch: number, perim: number): number => {
    let score = 20;
    const ar   = area / (cw * ch);
    score += ar > 0.05 && ar < 0.9 ? 30 : ar > 0.02 ? 20 : 10;

    const ratio = calcAspectRatio(corners);
    score += ratio > 0.3 && ratio < 3.0 ? 25 : 10;

    const edges = corners.map((c, i) => dist(c, corners[(i + 1) % 4]));
    const maxEdge = Math.max(...edges), minEdge = Math.min(...edges);
    score += (maxEdge / minEdge) < 5 ? 20 : (maxEdge / minEdge) < 10 ? 10 : 0;

    const expectedPerim = 2 * Math.sqrt(area * ratio + area / ratio);
    const pr = Math.min(perim / expectedPerim, expectedPerim / perim);
    score += pr > 0.7 ? 15 : pr > 0.5 ? 10 : 0;

    const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
    const cy = corners.reduce((s, c) => s + c.y, 0) / 4;
    const maxD = Math.hypot(cw / 2, ch / 2);
    const dCenter = Math.hypot(cx - cw / 2, cy - ch / 2);
    score += (1 - dCenter / maxD) * 10;

    return Math.min(score, 100);
  };

  const sortCorners = (corners: Point[]): Point[] => {
    const cx = corners.reduce((s, p) => s + p.x, 0) / corners.length;
    const cy = corners.reduce((s, p) => s + p.y, 0) / corners.length;
    const byAngle = corners.map(p => ({ p, a: Math.atan2(p.y - cy, p.x - cx) })).sort((a, b) => a.a - b.a);
    const tlIdx = byAngle.reduce((mi, x, i) => (x.p.x + x.p.y < byAngle[mi].p.x + byAngle[mi].p.y ? i : mi), 0);
    return [...byAngle.slice(tlIdx), ...byAngle.slice(0, tlIdx)].map(x => x.p);
  };

  // ─── Smoothing / stability ────────────────────────────────────────────────

  const smoothWithHistory = (corners: Point[]): Point[] => {
    detectionHistory.current.push({ corners, area: 0, aspectRatio: 0, confidence: 0, type: 'rectangle' });
    const maxHistory = performanceTier === 'high' ? 10 : 8;
    if (detectionHistory.current.length > maxHistory) detectionHistory.current.shift();
    if (detectionHistory.current.length < 3) return corners;

    const recent = detectionHistory.current.slice(-6);
    return corners.map((_, i) => {
      let wx = 0, wy = 0, tw = 0;
      recent.forEach((d, idx) => {
        const w = idx + 1;
        wx += d.corners[i].x * w;
        wy += d.corners[i].y * w;
        tw += w;
      });
      return { x: wx / tw, y: wy / tw };
    });
  };

  const shapesMatch = (a: DetectedShape | null, b: DetectedShape | null): boolean => {
    const { STABILITY_THRESHOLD } = getParams();
    if (!a || !b || a.corners.length !== b.corners.length) return false;
    const avg = a.corners.reduce((s, c, i) => s + dist(c, b.corners[i]), 0) / a.corners.length;
    return avg < STABILITY_THRESHOLD;
  };

  // ─── Detection loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!isDetectionReady || !hasCamera || !isAutoDetectionEnabled) return;

    const loop = () => {
      const now = performance.now();
      const fps = performanceTier === 'low' ? 15 : performanceTier === 'medium' ? 20 : 30;
      if (now - lastFrameTime.current < 1000 / fps) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameTime.current = now;

      const webcam  = webcamRef.current;
      const canvas  = canvasRef.current;
      const overlay = overlayCanvasRef.current;

      if (!webcam || !canvas || !overlay) { animationFrameRef.current = requestAnimationFrame(loop); return; }
      const video = webcam.video;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) { animationFrameRef.current = requestAnimationFrame(loop); return; }

      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { DETECTION_WIDTH } = getParams();
        const aspect = video.videoWidth / video.videoHeight;
        canvas.width  = DETECTION_WIDTH;
        canvas.height = Math.round(DETECTION_WIDTH / aspect);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const shapes = detectDocumentShapes(canvas);

        const cur = shapes[0] ? { ...shapes[0], corners: smoothWithHistory(shapes[0].corners) } : null;

        // Use ref for comparison — avoids stale closure
        const { MIN_STABLE_FRAMES } = getParams();
        if (cur && bestShapeRef.current && shapesMatch(cur, bestShapeRef.current)) {
          stableFrameCount.current = Math.min(stableFrameCount.current + 1, MIN_STABLE_FRAMES * 4);
        } else {
          stableFrameCount.current = Math.max(stableFrameCount.current - 1, 0);
        }
        const stable = stableFrameCount.current >= MIN_STABLE_FRAMES;
        const wasStable = isShapeStableRef.current;

        // Keep refs in sync first (used on next frame immediately)
        bestShapeRef.current     = cur;
        isShapeStableRef.current = stable;

        // Update React state for re-renders
        setBestShape(cur);
        setIsShapeStable(stable);

        // Play lock sound when first becoming stable
        if (stable && !wasStable && cur) {
          playSound('lock');
        }

        // Update guidance if we have a shape
        if (cur && canvas) {
          setGuidance(calcGuidance(cur, canvas.width, canvas.height));
        } else {
          setGuidance({ distance: null, tilt: 0, offsetX: 0, offsetY: 0 });
        }

        // Check light level
        if (canvas) {
          setIsLowLight(!checkLightLevel(canvas));
        }

        drawOverlay(overlay, shapes, cur, stable, guidance);
      } catch (e) {
        console.error('Detection loop error:', e);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    loop();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isDetectionReady, hasCamera, isAutoDetectionEnabled, deviceType, performanceTier, playSound, calcGuidance, checkLightLevel, guidance]);

  // Clear overlay + reset detection state when auto-detect is disabled
  useEffect(() => {
    if (!isAutoDetectionEnabled) {
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
      bestShapeRef.current     = null;
      isShapeStableRef.current = false;
      setBestShape(null);
      setIsShapeStable(false);
      stableFrameCount.current = 0;
      detectionHistory.current = [];
    }
  }, [isAutoDetectionEnabled]);

  // ─── Overlay drawing ──────────────────────────────────────────────────────

  const drawOverlay = (overlay: HTMLCanvasElement, shapes: DetectedShape[], best: DetectedShape | null, stable: boolean, guidance: GuidanceInfo) => {
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width  = canvasRef.current?.width  || 0;
    overlay.height = canvasRef.current?.height || 0;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!best) {
      // Dim the scene and show a clean guide frame
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, overlay.width, overlay.height);

      const gw = Math.min(overlay.width * 0.85, 560);
      const gh = Math.min(overlay.height * 0.68, 380);
      const gx = (overlay.width  - gw) / 2;
      const gy = (overlay.height - gh) / 2;
      const cr = 12; // corner radius

      // Rounded guide rect
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.roundRect(gx, gy, gw, gh, cr);
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner accent marks
      const markLen = 28;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 3;
      const corners: [number, number, number, number][] = [
        [gx,      gy,      1,  1],
        [gx + gw, gy,     -1,  1],
        [gx + gw, gy + gh,-1, -1],
        [gx,      gy + gh, 1, -1],
      ];
      corners.forEach(([x, y, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(x + dx * markLen, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * markLen);
        ctx.stroke();
      });

      // Hint text
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font      = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hintText = guidance?.distance === 'far' ? 'Move closer' :
                       guidance?.distance === 'close' ? 'Move farther' :
                       'Align document within frame';
      ctx.fillText(hintText, overlay.width / 2, gy - 28);

      return;
    }

    const c = best.corners;

    // Dim everything outside the detected shape
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    c.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const color  = stable ? '#34D399' : '#60A5FA'; // emerald : sky blue
    const handleRadius = stable ? 11 : 8;

    // Glow effect - pulse when unstable
    ctx.shadowColor = color;
    ctx.shadowBlur  = stable ? 18 : 10 + Math.sin(Date.now() / 150) * 4;

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth   = stable ? 3 : 2.5;
    ctx.setLineDash(stable ? [] : [18, 12]);
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    c.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Corner dots — clean two-tone circles (larger when stable)
    c.forEach(p => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, handleRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, handleRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw tilt indicator if tilt is significant
    if (guidance && guidance.tilt > 8) {
      const cx = c.reduce((s, p) => s + p.x, 0) / 4;
      const cy = c.reduce((s, p) => s + p.y, 0) / 4;
      const tiltText = `Tilt: ${Math.round(guidance.tilt)} deg`;

      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = ctx.measureText(tiltText).width;
      const ph = 22, pw = tw + 20;

      ctx.fillStyle = 'rgba(251,191,36,0.9)';
      ctx.beginPath();
      ctx.roundRect(cx - pw / 2, cy + 50, pw, ph, ph / 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tiltText, cx, cy + 50 + ph / 2);
    }

    // Centre label
    const cx = c.reduce((s, p) => s + p.x, 0) / 4;
    const cy = c.reduce((s, p) => s + p.y, 0) / 4;

    if (stable) {
      // Pill background
      const label  = 'Ready to capture';
      ctx.font     = 'bold 14px system-ui, sans-serif';
      const tw     = ctx.measureText(label).width;
      const ph = 28, pw = tw + 28;

      ctx.fillStyle = 'rgba(52,211,153,0.92)';
      ctx.beginPath();
      ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    }
  };

  const enhanceEdges = (imgSrc: string): string => {
    try {
      if (!window.cv) return imgSrc;
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return imgSrc;
      img.src = imgSrc;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const src = window.cv.imread(canvas);
      const gray = new window.cv.Mat();
      const edges = new window.cv.Mat();
      const enhanced = new window.cv.Mat();
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      window.cv.GaussianBlur(gray, gray, new window.cv.Size(3, 3), 0);
      window.cv.Canny(gray, edges, 50, 150, 3, true);
      window.cv.dilate(edges, edges, new window.cv.Mat(), new window.cv.Point(-1, -1), 1);
      const rgba = new window.cv.Mat();
      window.cv.cvtColor(edges, rgba, window.cv.COLOR_GRAY2RGBA);
      const alpha = new window.cv.Mat(src.rows, src.cols, window.cv.CV_8UC1, new window.cv.Scalar(255));
      const rgbaWithAlpha = new window.cv.Mat();
      window.cv.merge([rgba, alpha], rgbaWithAlpha);
      window.cv.addWeighted(src, 0.9, rgbaWithAlpha, 0.15, 0, enhanced);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = enhanced.cols;
      outCanvas.height = enhanced.rows;
      window.cv.imshow(outCanvas, enhanced);
      src.delete(); gray.delete(); edges.delete(); enhanced.delete(); rgba.delete(); alpha.delete(); rgbaWithAlpha.delete();
      return outCanvas.toDataURL('image/jpeg', 0.95);
    } catch { return imgSrc; }
  };

  // ─── Capture ──────────────────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return;
    setIsCapturing(true);
    playSound('shutter');
    triggerFlash();
    try {
      const video = webcamRef.current.video!;
      const cap = document.createElement('canvas');
      cap.width  = video.videoWidth;
      cap.height = video.videoHeight;
      cap.getContext('2d')!.drawImage(video, 0, 0, cap.width, cap.height);
      let imgSrc = cap.toDataURL('image/jpeg', 0.95);

      let finalSrc = imgSrc;
      if (isAutoDetectionEnabled && bestShapeRef.current && canvasRef.current) {
        finalSrc = await perspectiveCorrect(imgSrc, bestShapeRef.current.corners, canvasRef.current);
        finalSrc = enhanceEdges(finalSrc);
      }

      const blob = await fetch(finalSrc).then(r => r.blob());
      const img = new Image();
      img.onload = () => onImageCapture({ src: finalSrc, blob, width: img.width, height: img.height });
      img.src = finalSrc;
    } catch (e) {
      console.error('Capture error:', e);
    } finally {
      setIsCapturing(false);
    }
  }, [onImageCapture, isAutoDetectionEnabled, playSound]);

  const orderCorners = (corners: Point[]): Point[] => {
    const cx = corners.reduce((s, p) => s + p.x, 0) / corners.length;
    const cy = corners.reduce((s, p) => s + p.y, 0) / corners.length;
    const byAngle = corners.map(p => ({ p, a: Math.atan2(p.y - cy, p.x - cx) })).sort((a, b) => a.a - b.a);
    const tlIdx = byAngle.reduce((mi, x, i) => (x.p.x + x.p.y < byAngle[mi].p.x + byAngle[mi].p.y ? i : mi), 0);
    return [...byAngle.slice(tlIdx), ...byAngle.slice(0, tlIdx)].map(x => x.p);
  };

  const calcOutputSize = (corners: Point[], maxW: number, maxH: number) => {
    const w = (dist(corners[0], corners[1]) + dist(corners[2], corners[3])) / 2;
    const h = (dist(corners[1], corners[2]) + dist(corners[3], corners[0])) / 2;
    let ow = w, oh = h;
    const minDim = Math.min(w, h);
    if (minDim < 1200) { const s = 1200 / minDim; ow *= s; oh *= s; }
    if (ow > maxW || oh > maxH) { const s = Math.min(maxW / ow, maxH / oh); ow *= s; oh *= s; }
    return { width: Math.max(Math.round(ow), 800), height: Math.max(Math.round(oh), 600) };
  };

  const perspectiveCorrect = (imgSrc: string, corners: Point[], detCanvas: HTMLCanvasElement): Promise<string> =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          if (!window.cv) { resolve(imgSrc); return; }
          const sx = img.width / detCanvas.width;
          const sy = img.height / detCanvas.height;
          const scaled  = corners.map(c => ({ x: c.x * sx, y: c.y * sy }));
          const ordered = orderCorners(scaled);
          const { width: ow, height: oh } = calcOutputSize(ordered, img.width, img.height);

          const src = window.cv.imread(img);
          const dst = new window.cv.Mat();
          const srcPts = window.cv.matFromArray(4, 1, window.cv.CV_32FC2,
            ordered.flatMap((p: Point) => [p.x, p.y]));
          const dstPts = window.cv.matFromArray(4, 1, window.cv.CV_32FC2,
            [0, 0, ow, 0, ow, oh, 0, oh]);
          const M = window.cv.getPerspectiveTransform(srcPts, dstPts);
          window.cv.warpPerspective(src, dst, M, new window.cv.Size(ow, oh),
            window.cv.INTER_CUBIC, window.cv.BORDER_CONSTANT, new window.cv.Scalar(255, 255, 255, 255));

          const out = document.createElement('canvas');
          out.width = ow; out.height = oh;
          window.cv.imshow(out, dst);
          out.toBlob(blob => {
            if (!blob) { resolve(imgSrc); return; }
            const fr = new FileReader();
            fr.onload = e => resolve(e.target?.result as string);
            fr.readAsDataURL(blob);
          }, 'image/jpeg', 0.98);

          src.delete(); dst.delete(); srcPts.delete(); dstPts.delete(); M.delete();
        } catch (e) {
          console.error('Perspective correction error:', e);
          resolve(imgSrc);
        }
      };
      img.src = imgSrc;
    });

  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = ev => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => onImageCapture({ src, blob: file, width: img.width, height: img.height });
      img.src = src;
    };
    fr.readAsDataURL(file);
  };

  // ─── Derived state ────────────────────────────────────────────────────────

  const canCapture = !isCapturing && (
    !hasCamera ||
    !isAutoDetectionEnabled ||
    !!bestShape
  );

  const captureColor =
    !isAutoDetectionEnabled && hasCamera   ? 'bg-emerald-500 hover:bg-emerald-400 ring-4 ring-emerald-300/50 shadow-emerald-500/40' :
    isShapeStable && bestShape             ? 'bg-emerald-500 hover:bg-emerald-400 ring-4 ring-emerald-300/50 shadow-emerald-500/40 scale-105' :
    bestShape                              ? 'bg-sky-500 hover:bg-sky-400 ring-4 ring-sky-300/50 shadow-sky-500/40' :
    hasCamera                              ? 'bg-zinc-600 opacity-50 cursor-not-allowed' :
                                             'bg-sky-600 hover:bg-sky-500 ring-4 ring-sky-300/50';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full flex flex-col bg-black">
      {/* Camera viewport */}
      <div className="relative flex-1 overflow-hidden">
        {hasCamera ? (
          <div className="relative w-full h-full">
            <Webcam
              ref={webcamRef}
              audio={false}
              height="100%"
              width="100%"
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
              onUserMediaError={() => setHasCamera(false)}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.98}
            />
            <canvas ref={canvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />

            {/* Top-left status pill */}
            <div className="absolute top-3 left-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-all ${
                !isAutoDetectionEnabled
                  ? 'bg-black/60 text-zinc-400'
                  : !isDetectionReady
                  ? 'bg-black/60 text-amber-400'
                  : bestShape
                  ? isShapeStable
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
                  : 'bg-black/60 text-zinc-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  !isAutoDetectionEnabled ? 'bg-zinc-500' :
                  !isDetectionReady ? 'bg-amber-400 animate-pulse' :
                  bestShape ? (isShapeStable ? 'bg-emerald-400' : 'bg-sky-400 animate-pulse') :
                  'bg-zinc-500'
                }`} />
                {!isAutoDetectionEnabled ? 'Manual mode' :
                 !isDetectionReady ? 'Loading…' :
                 bestShape ? (isShapeStable ? 'Locked in' : 'Detecting…') : 'Searching…'}
              </div>
            </div>

            {/* Low light indicator */}
            {isLowLight && isAutoDetectionEnabled && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 backdrop-blur-sm">
                <AlertCircle size={12} />
                <span>Low light</span>
              </div>
            )}

            {/* Distance indicator */}
            {guidance.distance && isAutoDetectionEnabled && !bestShape && (
              <div className={`absolute bottom-24 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full text-xs font-semibold backdrop-blur-sm transition-all ${
                guidance.distance === 'far'
                  ? 'bg-sky-500/30 border border-sky-400/50 text-sky-200'
                  : guidance.distance === 'close'
                  ? 'bg-amber-500/30 border border-amber-400/50 text-amber-200'
                  : 'bg-emerald-500/30 border border-emerald-400/50 text-emerald-200'
              }`}>
                {guidance.distance === 'far' ? 'Move closer' : guidance.distance === 'close' ? 'Move farther' : 'Good distance'}
              </div>
            )}

            {/* Flash overlay */}
            <div
              ref={flashRef}
              className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-75 ${
                showFlash ? 'opacity-90' : 'opacity-0'
              }`}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-zinc-900 gap-4">
            <Camera size={52} className="text-zinc-500" />
            <p className="text-zinc-400 text-sm">Camera unavailable</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-colors"
            >
              Select from Gallery
            </button>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="bg-zinc-950 border-t border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-sm mx-auto">

          {/* Auto-detect toggle */}
          <button
            onClick={() => setIsAutoDetectionEnabled(p => !p)}
            className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              isAutoDetectionEnabled
                ? 'bg-sky-600/30 border border-sky-500/50 text-sky-300'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-300'
            }`}
            title={isAutoDetectionEnabled ? 'Disable auto-detect' : 'Enable auto-detect'}
          >
            <Scan size={18} className={isAutoDetectionEnabled ? 'text-sky-400' : 'text-zinc-500'} />
            <span>Auto</span>
          </button>

          {/* Shutter */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={!canCapture}
            className={`w-18 h-18 w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${captureColor}`}
          >
            {isCapturing
              ? <div className="w-7 h-7 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
              : <div className="w-[46px] h-[46px] rounded-full bg-white shadow-inner" />
            }
          </button>

          {/* Gallery / native camera */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-300 transition-all"
            title="Upload or use native camera"
          >
            <Phone size={18} className="text-zinc-500" />
            <span>Upload</span>
          </button>

        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileCapture}
        className="hidden"
      />
    </div>
  );
}

export default CameraView