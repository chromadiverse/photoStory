'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'

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

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [isDetectionReady, setIsDetectionReady] = useState(false)
  const animationFrameRef = useRef<number>(0)
  
  const [detectedShapes, setDetectedShapes] = useState<DetectedShape[]>([])
  const [bestShape, setBestShape] = useState<DetectedShape | null>(null)
  const [isShapeStable, setIsShapeStable] = useState(false)
  
  const stableFrameCount = useRef(0)
  const detectionHistory = useRef<DetectedShape[]>([])
  
  // Device detection
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'other'>('other');
  const [performanceTier, setPerformanceTier] = useState<'high' | 'medium' | 'low'>('medium');

  // Performance parameters
  const getParams = () => {
    const baseParams = {
  ios: {
    high: { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 200 },
    medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 180 },
    low: { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 18, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 150 }
  },
  android: {
    high: { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 200 },
    medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 180 },
    low: { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 18, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 150 }
  },
  other: {
    high: { DETECTION_WIDTH: 640, CONFIDENCE_THRESHOLD: 12, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 200 },
    medium: { DETECTION_WIDTH: 480, CONFIDENCE_THRESHOLD: 15, MIN_STABLE_FRAMES: 2, STABILITY_THRESHOLD: 180 },
    low: { DETECTION_WIDTH: 320, CONFIDENCE_THRESHOLD: 18, MIN_STABLE_FRAMES: 1, STABILITY_THRESHOLD: 150 }
  }
};

    return baseParams[deviceType][performanceTier];
  };

  // Detect device type and performance
  useEffect(() => {
    // Detect device type
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    if (/android/i.test(userAgent)) {
      setDeviceType('android');
    } else if (/iPad|iPhone|iPod/.test(userAgent)) {
      setDeviceType('ios');
    } else {
      setDeviceType('other');
    }
    
    // Detect performance tier
    const isHighEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency >= 6;
    const isLowEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    
    if (isHighEnd) {
      setPerformanceTier('high');
    } else if (isLowEnd) {
      setPerformanceTier('low');
    } else {
      setPerformanceTier('medium');
    }
  }, []);

 const videoConstraints = {
  width: { ideal: deviceType === 'ios' ? 1920 : 1280 },
  height: { ideal: deviceType === 'ios' ? 1080 : 720 },
  facingMode: facingMode,
  frameRate: { ideal: 24, max: 30 },
  aspectRatio: 16/9,
  // Ensure maximum brightness and exposure
  brightness: { ideal: 1.0 },
  contrast: { ideal: 1.0 },
  saturation: { ideal: 1.0 }
}

  useEffect(() => {
    const loadOpenCV = async () => {
      try {
        if (window.cv && window.cv.Mat) {
          setIsDetectionReady(true);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.async = true;
        
        document.head.appendChild(script);

        await new Promise<void>((resolve) => {
          const checkOpenCV = () => {
            if (window.cv && window.cv.Mat && typeof window.cv.imread === 'function') {
              console.log('OpenCV.js loaded successfully');
              setIsDetectionReady(true);
              resolve();
            } else {
              setTimeout(checkOpenCV, 100);
            }
          };
          checkOpenCV();
        });
      } catch (error) {
        console.error('Failed to load OpenCV.js:', error);
        setIsDetectionReady(false);
      }
    };

    loadOpenCV();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const distance = (a: Point, b: Point): number => {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  };

  const isRectangularContour = (corners: Point[], angleTolerance: number = 45): boolean => {
    if (corners.length !== 4) return false;
    
    for (let i = 0; i < 4; i++) {
      const p1 = corners[(i - 1 + 4) % 4];
      const p2 = corners[i];
      const p3 = corners[(i + 1) % 4];
      
      const v1x = p1.x - p2.x;
      const v1y = p1.y - p2.y;
      const v2x = p3.x - p2.x;
      const v2y = p3.y - p2.y;
      
      const dot = v1x * v2x + v1y * v2y;
      const cross = v1x * v2y - v1y * v2x;
      const angle = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
      
      if (Math.abs(angle - 90) > angleTolerance) return false;
    }
    
    return true;
  };

  const detectDocumentShapes = (canvas: HTMLCanvasElement): DetectedShape[] => {
    const { DETECTION_WIDTH, CONFIDENCE_THRESHOLD } = getParams();
    
    if (!window.cv || !canvas) return [];

    try {
      const src = window.cv.imread(canvas);
      const gray = new window.cv.Mat();
      const blurred = new window.cv.Mat();
      const edges = new window.cv.Mat();
      
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      
      // Apply bilateral filter for noise reduction
      window.cv.bilateralFilter(gray, blurred, 9, 75, 75);
      
      // Edge detection with performance-appropriate thresholds
    const mean = window.cv.mean(blurred);
const avgBrightness = mean[0];
const isLightBackground = avgBrightness > 127;

// Lower thresholds for light backgrounds, higher for dark
const lowThreshold = isLightBackground ? 25 : 40;
const highThreshold = isLightBackground ? 80 : 120;

window.cv.Canny(blurred, edges, lowThreshold, highThreshold, 3, true);
      
      // Morphological operations
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(3, 3));
      window.cv.morphologyEx(edges, edges, window.cv.MORPH_CLOSE, kernel);
      
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_LIST, window.cv.CHAIN_APPROX_SIMPLE);
      
      const imgArea = canvas.width * canvas.height;
      const minArea = imgArea * 0.02;
      const maxArea = imgArea * 0.98;
      
      const detectedShapes: DetectedShape[] = [];
      const candidatesByArea: { contour: any, area: number, index: number }[] = [];
      
      // Collect valid contours
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        if (area >= minArea && area <= maxArea) {
          candidatesByArea.push({ contour, area, index: i });
        } else {
          contour.delete();
        }
      }
      
      // Sort by area
      candidatesByArea.sort((a, b) => b.area - a.area);
      
      // Process top candidates
      const maxCandidates = performanceTier === 'high' ? 8 : performanceTier === 'medium' ? 6 : 4;
      
      for (let i = 0; i < Math.min(maxCandidates, candidatesByArea.length); i++) {
        const { contour, area } = candidatesByArea[i];
        const perimeter = window.cv.arcLength(contour, true);
        
        if (perimeter < (performanceTier === 'high' ? 80 : performanceTier === 'medium' ? 100 : 120)) {
          contour.delete();
          continue;
        }
        
        // Approximate contour
        const approx = new window.cv.Mat();
        const epsilon = (performanceTier === 'high' ? 0.03 : performanceTier === 'medium' ? 0.04 : 0.05) * perimeter;
        window.cv.approxPolyDP(contour, approx, epsilon, true);
        
        if (approx.rows >= 4 && approx.rows <= 8) {
          const corners: Point[] = [];
          for (let j = 0; j < approx.rows; j++) {
            corners.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            });
          }
          
          let finalCorners = corners;
          if (corners.length > 4) {
            finalCorners = findBestQuadrilateral(corners);
          }
          
          if (finalCorners.length === 4 && 
              isValidQuadrilateral(finalCorners) && 
              isRectangularContour(finalCorners, performanceTier === 'high' ? 50 : 45)) {
                
            const sortedCorners = sortCorners(finalCorners);
            const aspectRatio = calculateAspectRatio(sortedCorners);
            const confidence = calculateImprovedConfidence(
              sortedCorners, area, canvas.width, canvas.height, perimeter
            );
            
            if (confidence >= CONFIDENCE_THRESHOLD) {
              detectedShapes.push({
                corners: sortedCorners,
                area: area,
                aspectRatio: aspectRatio,
                confidence: confidence,
                type: classifyShape(sortedCorners, aspectRatio)
              });
            }
          }
        }
        
        approx.delete();
        contour.delete();
      }
      
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();
      
      return detectedShapes.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error in shape detection:', error);
      return [];
    }
  };

  const findBestQuadrilateral = (points: Point[]): Point[] => {
    if (points.length <= 4) return points;
    
    const hull = findConvexHull(points);
    if (hull.length === 4) return hull;
    
    return reduceToQuadrilateral(hull);
  };

  const findConvexHull = (points: Point[]): Point[] => {
    if (points.length < 3) return points;
    
    let leftmost = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].x < points[leftmost].x || 
          (points[i].x === points[leftmost].x && points[i].y < points[leftmost].y)) {
        leftmost = i;
      }
    }
    
    const hull: Point[] = [];
    let current = leftmost;
    
    do {
      hull.push(points[current]);
      let next = (current + 1) % points.length;
      
      for (let i = 0; i < points.length; i++) {
        const cross = crossProduct(points[current], points[i], points[next]);
        if (cross > 0 || (cross === 0 && 
            distance(points[current], points[i]) > distance(points[current], points[next]))) {
          next = i;
        }
      }
      
      current = next;
    } while (current !== leftmost && hull.length < points.length);
    
    return hull;
  };

  const crossProduct = (a: Point, b: Point, c: Point): number => {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  };

  const reduceToQuadrilateral = (points: Point[]): Point[] => {
    if (points.length <= 4) return points;
    
    const curvatures: { index: number; curvature: number }[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length];
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      
      const curvature = calculateCurvature(prev, curr, next);
      curvatures.push({ index: i, curvature });
    }
    
    curvatures.sort((a, b) => b.curvature - a.curvature);
    const selectedIndices = curvatures.slice(0, 4).map(c => c.index).sort((a, b) => a - b);
    
    return selectedIndices.map(i => points[i]);
  };

  const calculateCurvature = (prev: Point, curr: Point, next: Point): number => {
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    const cosAngle = dot / (mag1 * mag2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    
    return Math.abs(Math.PI - angle);
  };

  const isValidQuadrilateral = (corners: Point[]): boolean => {
    if (corners.length !== 4) return false;
    
    const area = calculatePolygonArea(corners);
    if (area < 500) return false;
    
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      const p3 = corners[(i + 2) % 4];
      
      const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      if (Math.abs(cross) < 50) return false;
    }
    
    return true;
  };

  const calculatePolygonArea = (corners: Point[]): number => {
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      area += corners[i].x * corners[j].y - corners[j].x * corners[i].y;
    }
    return Math.abs(area) / 2;
  };

  const calculateImprovedConfidence = (corners: Point[], area: number, canvasWidth: number, canvasHeight: number, perimeter: number): number => {
    let confidence = 20;
    
    const areaRatio = area / (canvasWidth * canvasHeight);
    if (areaRatio > 0.05 && areaRatio < 0.9) confidence += 30;
    else if (areaRatio > 0.02) confidence += 20;
    else confidence += 10;
    
    const aspectRatio = calculateAspectRatio(corners);
    if (aspectRatio > 0.3 && aspectRatio < 3.0) confidence += 25;
    else confidence += 10;
    
    const edgeLengths = [];
    for (let i = 0; i < 4; i++) {
      const curr = corners[i];
      const next = corners[(i + 1) % 4];
      edgeLengths.push(distance(curr, next));
    }
    
    const edgeVariation = Math.max(...edgeLengths) / Math.min(...edgeLengths);
    
    if (edgeVariation < 5) confidence += 20;
    else if (edgeVariation < 10) confidence += 10;
    
    const expectedPerimeter = 2 * Math.sqrt(area * aspectRatio + area / aspectRatio);
    const perimeterRatio = Math.min(perimeter / expectedPerimeter, expectedPerimeter / perimeter);
    if (perimeterRatio > 0.7) confidence += 15;
    else if (perimeterRatio > 0.5) confidence += 10;
    
    const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
    const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4;
    const frameCenterX = canvasWidth / 2;
    const frameCenterY = canvasHeight / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(centerX - frameCenterX, 2) + Math.pow(centerY - frameCenterY, 2)
    );
    const maxDistance = Math.sqrt(Math.pow(frameCenterX, 2) + Math.pow(frameCenterY, 2));
    const centerScore = (1 - distanceFromCenter / maxDistance) * 10;
    confidence += centerScore;
    
    return Math.min(confidence, 100);
  };

  const calculateAspectRatio = (corners: Point[]): number => {
    const widths = [
      distance(corners[0], corners[1]),
      distance(corners[2], corners[3])
    ];
    const heights = [
      distance(corners[1], corners[2]),
      distance(corners[3], corners[0])
    ];
    
    const avgWidth = (widths[0] + widths[1]) / 2;
    const avgHeight = (heights[0] + heights[1]) / 2;
    
    return Math.max(avgWidth / avgHeight, avgHeight / avgWidth);
  };

  const classifyShape = (corners: Point[], aspectRatio: number): 'square' | 'rectangle' | 'document' => {
    if (aspectRatio <= 1.3) {
      return 'square';
    } else if (aspectRatio <= 2.0) {
      return 'rectangle';  
    } else {
      return 'document';
    }
  };

  const sortCorners = (corners: Point[]): Point[] => {
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / corners.length;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / corners.length;
    
    const sortedByAngle = corners.map(corner => ({
      point: corner,
      angle: Math.atan2(corner.y - centerY, corner.x - centerX)
    })).sort((a, b) => a.angle - b.angle);
    
    const topLeftCandidate = sortedByAngle.reduce((min, curr) => 
      (curr.point.x + curr.point.y < min.point.x + min.point.y) ? curr : min
    );
    
    const startIndex = sortedByAngle.indexOf(topLeftCandidate);
    const reordered = [
      ...sortedByAngle.slice(startIndex),
      ...sortedByAngle.slice(0, startIndex)
    ];
    
    return reordered.map(item => item.point);
  };

  const smoothShapeWithHistory = (currentCorners: Point[]): Point[] => {
    const currentShape: DetectedShape = {
      corners: currentCorners,
      area: 0,
      aspectRatio: 0,
      confidence: 0,
      type: 'rectangle'
    };
    
    detectionHistory.current.push(currentShape);
    if (detectionHistory.current.length > (performanceTier === 'high' ? 10 : performanceTier === 'medium' ? 8 : 6)) {
      detectionHistory.current.shift();
    }
    
    if (detectionHistory.current.length < 3) {
      return currentCorners;
    }
    
    const recentDetections = detectionHistory.current.slice(-5);
    const smoothedCorners: Point[] = [];
    
    for (let i = 0; i < 4; i++) {
      let avgX = 0, avgY = 0;
      let totalWeight = 0;
      
      recentDetections.forEach((detection, index) => {
        const weight = index + 1;
        avgX += detection.corners[i].x * weight;
        avgY += detection.corners[i].y * weight;
        totalWeight += weight;
      });
      
      smoothedCorners.push({
        x: avgX / totalWeight,
        y: avgY / totalWeight
      });
    }
    
    return smoothedCorners;
  };

  const areShapesSimilar = (shape1: DetectedShape | null, shape2: DetectedShape | null): boolean => {
    const { STABILITY_THRESHOLD } = getParams();
    
    if (!shape1 || !shape2 || shape1.corners.length !== shape2.corners.length) return false;
    
    const totalDistance = shape1.corners.reduce((sum, corner, i) => {
      const dx = corner.x - shape2.corners[i].x;
      const dy = corner.y - shape2.corners[i].y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    
    const avgDistance = totalDistance / shape1.corners.length;
    return avgDistance < STABILITY_THRESHOLD;
  };

  useEffect(() => {
    if (!isDetectionReady || !hasCamera) return;

    const detectShapes = () => {
      const webcam = webcamRef.current;
      const canvas = canvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      if (!webcam || !canvas || !overlayCanvas) {
        animationFrameRef.current = requestAnimationFrame(detectShapes);
        return;
      }

      const video = webcam.video;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(detectShapes);
        return;
      }

      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { DETECTION_WIDTH } = getParams();
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasWidth = DETECTION_WIDTH;
        const canvasHeight = Math.round(canvasWidth / videoAspect);
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

        const shapes = detectDocumentShapes(canvas);
        setDetectedShapes(shapes);
        
        let currentBest = shapes[0] || null;
        
        if (currentBest) {
          const smoothedCorners = smoothShapeWithHistory(currentBest.corners);
          currentBest = { ...currentBest, corners: smoothedCorners };
        }
        
        const previousBest = bestShape;
        if (currentBest && previousBest && areShapesSimilar(currentBest, previousBest)) {
          const { MIN_STABLE_FRAMES } = getParams();
          stableFrameCount.current = Math.min(stableFrameCount.current + 1, MIN_STABLE_FRAMES * 3);
        } else {
          stableFrameCount.current = Math.max(stableFrameCount.current - 1, 0);
        }
        
        const { MIN_STABLE_FRAMES } = getParams();
        const newStability = stableFrameCount.current >= MIN_STABLE_FRAMES;
        if (newStability !== isShapeStable) {
          setIsShapeStable(newStability);
        }
        
        setBestShape(currentBest);
        drawOverlay(overlayCanvas, shapes, currentBest);
        
      } catch (error) {
        console.error('Detection error:', error);
      }

      animationFrameRef.current = requestAnimationFrame(detectShapes);
    };

    detectShapes();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDetectionReady, hasCamera, bestShape, deviceType, performanceTier]);

  const drawOverlay = (overlayCanvas: HTMLCanvasElement, shapes: DetectedShape[], bestShape: DetectedShape | null) => {
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!overlayCtx) return;

    overlayCanvas.width = canvasRef.current?.width || 0;
    overlayCanvas.height = canvasRef.current?.height || 0;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!bestShape) {
      const centerX = overlayCanvas.width / 2;
      const centerY = overlayCanvas.height / 2;
      
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      
      const guideWidth = Math.min(overlayCanvas.width * 0.9, 600);
      const guideHeight = Math.min(overlayCanvas.height * 0.7, 400);
      const guideX = (overlayCanvas.width - guideWidth) / 2;
      const guideY = (overlayCanvas.height - guideHeight) / 2;
      
      overlayCtx.strokeStyle = '#FFFFFF';
      overlayCtx.lineWidth = 3;
      overlayCtx.setLineDash([10, 10]);
      overlayCtx.strokeRect(guideX, guideY, guideWidth, guideHeight);
      overlayCtx.setLineDash([]);
      
      overlayCtx.fillStyle = '#FFFFFF';
      overlayCtx.font = 'bold 24px Arial';
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      overlayCtx.fillText(
        'Position document in frame',
        centerX,
        guideY - 40
      );
      overlayCtx.font = '18px Arial';
      overlayCtx.fillText(
        'Works with monitors, papers, books, photos',
        centerX,
        guideY + guideHeight + 40
      );
      return;
    }

    // Draw all detected shapes as potential candidates
    shapes.forEach(shape => {
      if (shape.confidence < 30) return;
      
      const corners = shape.corners;
      overlayCtx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(corners[0].x, corners[0].y);
      corners.forEach(corner => overlayCtx.lineTo(corner.x, corner.y));
      overlayCtx.closePath();
      overlayCtx.stroke();
    });

    const corners = bestShape.corners;
   const isStable = isShapeStable;
    
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    overlayCtx.globalCompositeOperation = 'destination-out';
    overlayCtx.beginPath();
    overlayCtx.moveTo(corners[0].x, corners[0].y);
    corners.forEach(corner => overlayCtx.lineTo(corner.x, corner.y));
    overlayCtx.closePath();
    overlayCtx.fill();
    
    overlayCtx.globalCompositeOperation = 'source-over';
    overlayCtx.strokeStyle = isStable ? '#00FF00' : '#00AAFF';
    overlayCtx.lineWidth = isStable ? 3 : 2;
    overlayCtx.setLineDash(isStable ? [] : [20, 15]);
    overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    overlayCtx.shadowBlur = 4;
    overlayCtx.beginPath();
    overlayCtx.moveTo(corners[0].x, corners[0].y);
    corners.forEach(corner => overlayCtx.lineTo(corner.x, corner.y));
    overlayCtx.closePath();
    overlayCtx.stroke();
    overlayCtx.setLineDash([]);
    overlayCtx.shadowBlur = 0;

    corners.forEach((corner) => {
      overlayCtx.fillStyle = isStable ? '#00FF00' : '#00AAFF';
      overlayCtx.beginPath();
      overlayCtx.arc(corner.x, corner.y, 8, 0, 2 * Math.PI);
      overlayCtx.fill();
      
      overlayCtx.fillStyle = '#FFFFFF';
      overlayCtx.beginPath();
      overlayCtx.arc(corner.x, corner.y, 4, 0, 2 * Math.PI);
      overlayCtx.fill();
    });
    
    const centerX = corners.reduce((sum, c) => sum + c.x, 0) / corners.length;
    const centerY = corners.reduce((sum, c) => sum + c.y, 0) / corners.length;
    
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    overlayCtx.fillRect(centerX - 150, centerY - 60, 300, 120);
    
    overlayCtx.fillStyle = '#FFFFFF';
    overlayCtx.font = 'bold 22px Arial';
    overlayCtx.textAlign = 'center';
    overlayCtx.fillText(
      `${bestShape.type.charAt(0).toUpperCase() + bestShape.type.slice(1)} Found`,
      centerX,
      centerY - 25
    );
    overlayCtx.font = '18px Arial';
    overlayCtx.fillText(
      isStable ? '✓ Ready to capture!' : 'Hold steady...',
      centerX,
      centerY + 5
    );
    overlayCtx.font = '16px Arial';
    overlayCtx.fillText(
      `Confidence: ${Math.round(bestShape.confidence)}%`,
      centerX,
      centerY + 35
    );
  };

  const orderCornersForDocument = (corners: Point[]): Point[] => {
    const centerX = corners.reduce((sum, p) => sum + p.x, 0) / corners.length;
    const centerY = corners.reduce((sum, p) => sum + p.y, 0) / corners.length;

    const cornersWithAngles = corners.map(corner => ({
      point: corner,
      angle: Math.atan2(corner.y - centerY, corner.x - centerX)
    }));

    cornersWithAngles.sort((a, b) => a.angle - b.angle);

    let topLeftIndex = 0;
    let minSum = cornersWithAngles[0].point.x + cornersWithAngles[0].point.y;
    
    for (let i = 1; i < cornersWithAngles.length; i++) {
      const sum = cornersWithAngles[i].point.x + cornersWithAngles[i].point.y;
      if (sum < minSum) {
        minSum = sum;
        topLeftIndex = i;
      }
    }

    const orderedCorners = [];
    for (let i = 0; i < 4; i++) {
      orderedCorners.push(cornersWithAngles[(topLeftIndex + i) % 4].point);
    }

    return orderedCorners;
  };

  const calculateOptimalOutputSize = (corners: Point[], maxWidth: number, maxHeight: number): { width: number, height: number } => {
    const topEdge = distance(corners[0], corners[1]);
    const rightEdge = distance(corners[1], corners[2]); 
    const bottomEdge = distance(corners[2], corners[3]);
    const leftEdge = distance(corners[3], corners[0]);

    const avgWidth = (topEdge + bottomEdge) / 2;
    const avgHeight = (rightEdge + leftEdge) / 2;

    const minDimension = Math.min(avgWidth, avgHeight);
    const targetMinSize = 1200;
    
    let scaleFactor = 1;
    if (minDimension < targetMinSize) {
      scaleFactor = targetMinSize / minDimension;
    }
    
    let outputWidth = Math.round(avgWidth * scaleFactor);
    let outputHeight = Math.round(avgHeight * scaleFactor);
    
    if (outputWidth > maxWidth || outputHeight > maxHeight) {
      const maxScale = Math.min(maxWidth / avgWidth, maxHeight / avgHeight);
      outputWidth = Math.round(avgWidth * maxScale);
      outputHeight = Math.round(avgHeight * maxScale);
    }

    outputWidth = Math.max(outputWidth, 800);
    outputHeight = Math.max(outputHeight, 600);

    return { width: outputWidth, height: outputHeight };
  };

  const cropAndCorrectPerspective = (imageSrc: string, corners: Point[], detectionCanvas: HTMLCanvasElement): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          if (!window.cv) {
            console.error('OpenCV not loaded');
            resolve(imageSrc);
            return;
          }

          const src = window.cv.imread(img);
          const dst = new window.cv.Mat();

          const scaleX = img.width / detectionCanvas.width;
          const scaleY = img.height / detectionCanvas.height;
          
          const scaledCorners = corners.map(corner => ({
            x: corner.x * scaleX,
            y: corner.y * scaleY
          }));

          const properlyOrderedCorners = orderCornersForDocument(scaledCorners);
          const { width: outputWidth, height: outputHeight } = calculateOptimalOutputSize(
            properlyOrderedCorners, 
            img.width, 
            img.height
          );

          const srcPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
            properlyOrderedCorners[0].x, properlyOrderedCorners[0].y,
            properlyOrderedCorners[1].x, properlyOrderedCorners[1].y,
            properlyOrderedCorners[2].x, properlyOrderedCorners[2].y,
            properlyOrderedCorners[3].x, properlyOrderedCorners[3].y
          ]);

          const dstPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
            0, 0,
            outputWidth, 0,
            outputWidth, outputHeight,
            0, outputHeight
          ]);

          const transformMatrix = window.cv.getPerspectiveTransform(srcPoints, dstPoints);

          window.cv.warpPerspective(
            src, 
            dst, 
            transformMatrix, 
            new window.cv.Size(outputWidth, outputHeight),
            window.cv.INTER_CUBIC,
            window.cv.BORDER_CONSTANT,
            new window.cv.Scalar(255, 255, 255, 255)
          );

          const outputCanvas = document.createElement('canvas');
          outputCanvas.width = outputWidth;
          outputCanvas.height = outputHeight;
          window.cv.imshow(outputCanvas, dst);

          outputCanvas.toBlob((blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = (e) => {
                resolve(e.target?.result as string);
              };
              reader.readAsDataURL(blob);
            } else {
              resolve(imageSrc);
            }
          }, 'image/jpeg', 0.98);

          src.delete();
          dst.delete();
          srcPoints.delete();
          dstPoints.delete();
          transformMatrix.delete();

        } catch (error) {
          console.error('Error in perspective correction:', error);
          resolve(imageSrc);
        }
      };
      img.src = imageSrc;
    });
  };

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return;
    
    setIsCapturing(true);
    try {
      const video = webcamRef.current.video!;
      
      console.log('Camera actual resolution:', video.videoWidth, 'x', video.videoHeight);
      
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const ctx = captureCanvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      
      const imageSrc = captureCanvas.toDataURL('image/jpeg', 0.95);

      if (imageSrc) {
        let finalImageSrc = imageSrc;
        let finalBlob: Blob;

        if (bestShape && canvasRef.current) {
          finalImageSrc = await cropAndCorrectPerspective(imageSrc, bestShape.corners, canvasRef.current);
        }

        const response = await fetch(finalImageSrc);
        finalBlob = await response.blob();
        
        const image = new Image();
        image.onload = () => {
          onImageCapture({
            src: finalImageSrc,
            blob: finalBlob,
            width: image.width,
            height: image.height
          });
        };
        image.src = finalImageSrc;
      }
    } catch (error) {
      console.error('Error capturing image:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [onImageCapture, bestShape]);

  const handleFileCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        
        const image = new Image();
        image.onload = () => {
          onImageCapture({
            src: result,
            blob: file,
            width: image.width,
            height: image.height
          });
        };
        image.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const onUserMediaError = () => {
    setHasCamera(false);
  };

  return (
<div className="relative h-full flex flex-col">
  <div className="relative flex-1 bg-black overflow-hidden">
    {hasCamera ? (
      <>
        <Webcam
          ref={webcamRef}
          audio={false}
          height="100%"
          width="100%"
          videoConstraints={videoConstraints}
          className="w-full h-full object-cover"
          onUserMediaError={onUserMediaError}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.98}
        />
        <canvas ref={canvasRef} className="hidden" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        
        {/* Status indicator - smaller */}
        <div className="absolute top-4 left-4">
          <div className="flex items-center space-x-2 bg-black bg-opacity-80 px-3 py-2 rounded-full">
            <div className={`w-3 h-3 rounded-full ${
              !isDetectionReady ? 'bg-yellow-400 animate-pulse' :
              bestShape ? (isShapeStable ? 'bg-green-400' : 'bg-blue-400 animate-pulse') : 'bg-gray-400'
            }`} />
            <span className="text-white text-sm">
              {!isDetectionReady ? 'Loading...' :
               bestShape ? (isShapeStable ? 'Ready' : 'Hold steady') : 'Looking...'}
            </span>
          </div>
        </div>
      </>
    ) : (
      <div className="flex flex-col items-center justify-center h-full bg-gray-800">
        <Camera size={64} className="mb-4 text-gray-400" />
        <p className="text-gray-400 mb-4 text-lg">Camera not available</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
        >
          Select Photo from Gallery
        </button>
      </div>
    )}
  </div>

  {/* Smaller control panel */}
  <div className="bg-black p-4">
    <div className="flex items-center justify-center space-x-8 max-w-md mx-auto">
      {/* Gallery button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-all duration-200 shadow-lg"
        title="Select from gallery"
      >
        <Square size={24} className="text-white" />
      </button>

      {/* Main capture button - stays green when document is found */}
      <button
        onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
        disabled={isCapturing || (hasCamera && !bestShape)}
        className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
          isShapeStable && bestShape
            ? 'bg-green-500 hover:bg-green-400 ring-6 ring-green-300 ring-opacity-50 scale-110 shadow-green-500/50' 
            : bestShape && hasCamera
            ? 'bg-blue-500 hover:bg-blue-400 ring-4 ring-blue-300 ring-opacity-50 scale-105 shadow-blue-500/50'
            : hasCamera
            ? 'bg-gray-600 cursor-not-allowed opacity-50'
            : 'bg-blue-600 hover:bg-blue-500 ring-4 ring-blue-300 ring-opacity-50'
        }`}
        title={
          !hasCamera ? 'Select photo' :
          !bestShape ? 'Point camera at document' :
          isShapeStable ? 'Capture now!' : 'Hold steady to capture'
        }
      >
        {isCapturing ? (
          <div className="w-8 h-8 border-4 border-white rounded-full animate-spin border-t-transparent"></div>
        ) : (
          <div className="w-12 h-12 rounded-full bg-white shadow-inner"></div>
        )}
      </button>

      {/* Camera toggle */}
      {hasCamera && (
        <button
          onClick={toggleCamera}
          className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-all duration-200 shadow-lg"
          title="Switch camera"
        >
          <RotateCcw size={24} className="text-white" />
        </button>
      )}
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
  )
}

export default CameraView