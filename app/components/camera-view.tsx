'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'
import { CapturedImage } from '../page'

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

// Tuned parameters for better document detection
const SMOOTHING_FACTOR = 0.8;
const STABILITY_THRESHOLD = 20;
const MIN_STABLE_FRAMES = 5;
const CONFIDENCE_THRESHOLD = 50;

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
  const lastBestShape = useRef<DetectedShape | null>(null)
  const smoothedShape = useRef<Point[] | null>(null)

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode
  }

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = async () => {
      try {
        if (window.cv && window.cv.Mat) {
          setIsDetectionReady(true)
          return
        }

        const script = document.createElement('script')
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js'
        script.async = true
        
        document.head.appendChild(script)

        await new Promise<void>((resolve) => {
          const checkOpenCV = () => {
            if (window.cv && window.cv.Mat && typeof window.cv.imread === 'function') {
              console.log('OpenCV.js loaded successfully')
              setIsDetectionReady(true)
              resolve()
            } else {
              setTimeout(checkOpenCV, 100)
            }
          }
          checkOpenCV()
        })
        
      } catch (error) {
        console.error('Failed to load OpenCV.js:', error)
        setIsDetectionReady(false)
      }
    }

    loadOpenCV()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Improved shape detection specifically for documents and posters
  const detectDocumentShapes = (canvas: HTMLCanvasElement): DetectedShape[] => {
    if (!window.cv || !canvas) return []

    try {
      const src = window.cv.imread(canvas)
      const gray = new window.cv.Mat()
      const blurred = new window.cv.Mat()
      const edges = new window.cv.Mat()
      
      // Convert to grayscale
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)
      
      // Apply bilateral filter to preserve edges while reducing noise
      window.cv.bilateralFilter(gray, blurred, 9, 75, 75)
      
      // Use Canny edge detection with optimized thresholds
      window.cv.Canny(blurred, edges, 50, 150, 3, true)
      
      // Dilate edges to connect broken edges of documents
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(3, 3))
      window.cv.dilate(edges, edges, kernel)
      
      // Find contours
      const contours = new window.cv.MatVector()
      const hierarchy = new window.cv.Mat()
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_LIST, window.cv.CHAIN_APPROX_SIMPLE)
      
      const detectedShapes: DetectedShape[] = []
      const minArea = canvas.width * canvas.height * 0.1 // Increased to 10% for documents
      const maxArea = canvas.width * canvas.height * 0.8
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = window.cv.contourArea(contour)
        
        if (area < minArea || area > maxArea) {
          contour.delete()
          continue
        }
        
        // Calculate contour properties for better filtering
        const perimeter = window.cv.arcLength(contour, true)
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter)
        
        // Filter by circularity to exclude round objects
        if (circularity > 0.8) {
          contour.delete()
          continue
        }
        
        // Approximate the contour
        const approx = new window.cv.Mat()
        const epsilon = 0.02 * perimeter
        window.cv.approxPolyDP(contour, approx, epsilon, true)
        
        // Look for quadrilaterals (4 corners)
        if (approx.rows === 4) {
          const corners: Point[] = []
          for (let j = 0; j < 4; j++) {
            corners.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            })
          }
          
          if (isValidQuadrilateral(corners)) {
            const sortedCorners = sortCorners(corners)
            const aspectRatio = calculateAspectRatio(sortedCorners)
            const confidence = calculateDocumentConfidence(sortedCorners, area, canvas.width, canvas.height) // Fixed: canvas.height instead of canvasHeight
            const type = classifyShape(sortedCorners, aspectRatio)
            
            if (confidence >= CONFIDENCE_THRESHOLD) {
              detectedShapes.push({
                corners: sortedCorners,
                area: area,
                aspectRatio: aspectRatio,
                confidence: confidence,
                type: type
              })
            }
          }
        }
        approx.delete()
        contour.delete()
      }
      
      // Cleanup
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      kernel.delete()
      
      return detectedShapes.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
      
    } catch (error) {
      console.error('Error in shape detection:', error)
      return []
    }
  }

  // Validate quadrilateral with proper geometric checks
  const isValidQuadrilateral = (corners: Point[]): boolean => {
    if (corners.length !== 4) return false
    
    // Check for convex quadrilateral - FIXED: Added type annotation
    const orientations: number[] = []
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i]
      const p2 = corners[(i + 1) % 4]
      const p3 = corners[(i + 2) % 4]
      
      const val = (p2.y - p1.y) * (p3.x - p2.x) - (p2.x - p1.x) * (p3.y - p2.y)
      orientations.push(val > 0 ? 1 : -1)
    }
    
    // All orientations should be the same for convex shape
    if (!orientations.every(orient => orient === orientations[0])) {
      return false
    }
    
    // Check area is reasonable (not degenerate)
    const area = Math.abs(
      (corners[0].x * (corners[1].y - corners[2].y) +
       corners[1].x * (corners[2].y - corners[0].y) +
       corners[2].x * (corners[0].y - corners[1].y)) / 2
    )
    
    return area > 1000 // Minimum area threshold
  }

  // Calculate aspect ratio properly
  const calculateAspectRatio = (corners: Point[]): number => {
    const width1 = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2))
    const width2 = Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2))
    const height1 = Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2))
    const height2 = Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2))
    
    const avgWidth = (width1 + width2) / 2
    const avgHeight = (height1 + height2) / 2
    
    return avgWidth / avgHeight
  }

  // Classify shape type
  const classifyShape = (corners: Point[], aspectRatio: number): 'square' | 'rectangle' | 'document' => {
    const ratioTolerance = 0.15
    
    if (Math.abs(aspectRatio - 1) < ratioTolerance) {
      return 'square'
    } else if (Math.abs(aspectRatio - 1.414) < ratioTolerance || // A4 ratio
               Math.abs(aspectRatio - 1.294) < ratioTolerance || // US Letter
               Math.abs(aspectRatio - 0.707) < ratioTolerance ||
               Math.abs(aspectRatio - 0.773) < ratioTolerance) {
      return 'document'
    } else {
      return 'rectangle'
    }
  }

  // Improved confidence calculation for documents - FIXED: Added canvasHeight parameter
  const calculateDocumentConfidence = (corners: Point[], area: number, canvasWidth: number, canvasHeight: number): number => {
    let confidence = 0
    
    // Area score (prefer medium to large areas for documents)
    const areaRatio = area / (canvasWidth * canvasHeight)
    if (areaRatio > 0.2 && areaRatio < 0.7) confidence += 40
    else if (areaRatio > 0.1 && areaRatio < 0.8) confidence += 30
    else confidence += 10
    
    // Aspect ratio score (common document ratios)
    const aspectRatio = calculateAspectRatio(corners)
    const commonRatios = [1, 1.414, 1.294, 0.707, 0.773, 1.5, 1.333] // Square, A4, Letter, etc.
    const closestRatio = commonRatios.reduce((prev, curr) => 
      Math.abs(curr - aspectRatio) < Math.abs(prev - aspectRatio) ? curr : prev
    )
    const ratioError = Math.abs(aspectRatio - closestRatio) / closestRatio
    if (ratioError < 0.1) confidence += 40
    else if (ratioError < 0.2) confidence += 25
    
    // Angle score (check for right angles)
    const angles = calculateAngles(corners)
    const rightAngleScore = angles.filter(angle => Math.abs(angle - 90) < 15).length * 10
    confidence += rightAngleScore
    
    // Convexity score
    if (isConvex(corners)) confidence += 10
    
    return Math.min(confidence, 100)
  }

  // Calculate angles between edges
  const calculateAngles = (corners: Point[]): number[] => {
    const angles: number[] = []
    for (let i = 0; i < 4; i++) {
      const prev = corners[(i + 3) % 4]
      const curr = corners[i]
      const next = corners[(i + 1) % 4]
      
      const v1 = { x: prev.x - curr.x, y: prev.y - curr.y }
      const v2 = { x: next.x - curr.x, y: next.y - curr.y }
      
      const dot = v1.x * v2.x + v1.y * v2.y
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)
      
      if (mag1 > 0 && mag2 > 0) {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * 180 / Math.PI
        angles.push(angle)
      }
    }
    return angles
  }

  // Check if polygon is convex
  const isConvex = (corners: Point[]): boolean => {
    if (corners.length < 4) return false
    
    let sign = 0
    for (let i = 0; i < corners.length; i++) {
      const dx1 = corners[(i + 2) % corners.length].x - corners[(i + 1) % corners.length].x
      const dy1 = corners[(i + 2) % corners.length].y - corners[(i + 1) % corners.length].y
      const dx2 = corners[i].x - corners[(i + 1) % corners.length].x
      const dy2 = corners[i].y - corners[(i + 1) % corners.length].y
      const cross = dx1 * dy2 - dy1 * dx2
      
      if (i === 0) sign = Math.sign(cross)
      else if (Math.sign(cross) !== sign) return false
    }
    return true
  }

  // Sort corners in clockwise order starting from top-left
  const sortCorners = (corners: Point[]): Point[] => {
    // Find center
    const center = {
      x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length,
      y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length
    }
    
    // Sort by angle
    const sorted = [...corners].sort((a, b) => {
      const angleA = Math.atan2(a.y - center.y, a.x - center.x)
      const angleB = Math.atan2(b.y - center.y, b.x - center.x)
      return angleA - angleB
    })
    
    // Find top-left point
    const topLeft = sorted.reduce((min, p) => (p.x + p.y < min.x + min.y) ? p : min)
    const startIndex = sorted.indexOf(topLeft)
    
    return [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)]
  }

  // Smooth corners
  const smoothShapeCorners = (currentCorners: Point[], previousCorners: Point[] | null): Point[] => {
    if (!previousCorners || currentCorners.length !== previousCorners.length) {
      return currentCorners
    }

    return currentCorners.map((corner, index) => ({
      x: previousCorners[index].x * SMOOTHING_FACTOR + corner.x * (1 - SMOOTHING_FACTOR),
      y: previousCorners[index].y * SMOOTHING_FACTOR + corner.y * (1 - SMOOTHING_FACTOR)
    }))
  }

  // Check shape similarity
  const areShapesSimilar = (shape1: DetectedShape | null, shape2: DetectedShape | null): boolean => {
    if (!shape1 || !shape2 || shape1.corners.length !== shape2.corners.length) return false
    
    const totalDistance = shape1.corners.reduce((sum, corner, i) => {
      const dx = corner.x - shape2.corners[i].x
      const dy = corner.y - shape2.corners[i].y
      return sum + Math.sqrt(dx * dx + dy * dy)
    }, 0)
    
    return totalDistance / shape1.corners.length < STABILITY_THRESHOLD
  }

  // Detection loop
  useEffect(() => {
    if (!isDetectionReady || !hasCamera) return

    const detectShapes = () => {
      const webcam = webcamRef.current
      const canvas = canvasRef.current
      const overlayCanvas = overlayCanvasRef.current

      if (!webcam || !canvas || !overlayCanvas) {
        animationFrameRef.current = requestAnimationFrame(detectShapes)
        return
      }

      const video = webcam.video
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(detectShapes)
        return
      }

      try {
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const shapes = detectDocumentShapes(canvas)
        setDetectedShapes(shapes)
        
        let currentBest = shapes[0] || null
        
        if (currentBest) {
          const smoothedCorners = smoothShapeCorners(
            currentBest.corners, 
            smoothedShape.current || currentBest.corners
          )
          smoothedShape.current = smoothedCorners
          currentBest = { ...currentBest, corners: smoothedCorners }
        } else {
          smoothedShape.current = null
        }
        
        // Stability check
        if (currentBest && lastBestShape.current && areShapesSimilar(currentBest, lastBestShape.current)) {
          stableFrameCount.current = Math.min(stableFrameCount.current + 1, MIN_STABLE_FRAMES * 2)
        } else {
          stableFrameCount.current = Math.max(stableFrameCount.current - 1, 0)
        }
        
        const newStability = stableFrameCount.current >= MIN_STABLE_FRAMES
        if (newStability !== isShapeStable) {
          setIsShapeStable(newStability)
        }
        
        setBestShape(currentBest)
        lastBestShape.current = currentBest
        drawOverlay(overlayCanvas, shapes, currentBest)
        
      } catch (error) {
        console.error('Detection error:', error)
      }

      animationFrameRef.current = requestAnimationFrame(detectShapes)
    }

    detectShapes()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isDetectionReady, hasCamera, isShapeStable])

  // Draw overlay with better visual feedback
  const drawOverlay = (overlayCanvas: HTMLCanvasElement, shapes: DetectedShape[], bestShape: DetectedShape | null) => {
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) return

    overlayCanvas.width = canvasRef.current?.width || 0
    overlayCanvas.height = canvasRef.current?.height || 0
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    if (!bestShape) {
      // Guidance for user
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      
      overlayCtx.fillStyle = '#FFFFFF'
      overlayCtx.font = 'bold 24px Arial'
      overlayCtx.textAlign = 'center'
      overlayCtx.fillText(
        'Point camera at document or photo',
        overlayCanvas.width / 2,
        overlayCanvas.height / 2 - 20
      )
      overlayCtx.font = '18px Arial'
      overlayCtx.fillText(
        'Ensure good lighting and clear edges',
        overlayCanvas.width / 2,
        overlayCanvas.height / 2 + 20
      )
      return
    }

    const corners = bestShape.corners
    const isStable = isShapeStable
    
    // Draw overlay with cutout
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    
    overlayCtx.globalCompositeOperation = 'destination-out'
    overlayCtx.beginPath()
    overlayCtx.moveTo(corners[0].x, corners[0].y)
    corners.forEach(corner => overlayCtx.lineTo(corner.x, corner.y))
    overlayCtx.closePath()
    overlayCtx.fill()
    
    // Draw outline
    overlayCtx.globalCompositeOperation = 'source-over'
    overlayCtx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
    overlayCtx.lineWidth = isStable ? 6 : 4
    overlayCtx.setLineDash(isStable ? [] : [15, 10])
    overlayCtx.beginPath()
    overlayCtx.moveTo(corners[0].x, corners[0].y)
    corners.forEach(corner => overlayCtx.lineTo(corner.x, corner.y))
    overlayCtx.closePath()
    overlayCtx.stroke()
    overlayCtx.setLineDash([])
    
    // Draw corners
    corners.forEach((corner, index) => {
      overlayCtx.fillStyle = isStable ? '#10B981' : '#3B82F6'
      overlayCtx.beginPath()
      overlayCtx.arc(corner.x, corner.y, 12, 0, 2 * Math.PI)
      overlayCtx.fill()
      
      overlayCtx.fillStyle = '#FFFFFF'
      overlayCtx.beginPath()
      overlayCtx.arc(corner.x, corner.y, 6, 0, 2 * Math.PI)
      overlayCtx.fill()
    })
    
    // Info box
    const centerX = corners.reduce((sum, c) => sum + c.x, 0) / corners.length
    const centerY = corners.reduce((sum, c) => sum + c.y, 0) / corners.length
    
    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    overlayCtx.fillRect(centerX - 120, centerY - 50, 240, 100)
    
    overlayCtx.fillStyle = '#FFFFFF'
    overlayCtx.font = 'bold 18px Arial'
    overlayCtx.textAlign = 'center'
    overlayCtx.fillText(
      `${bestShape.type.charAt(0).toUpperCase() + bestShape.type.slice(1)} Detected`,
      centerX,
      centerY - 20
    )
    overlayCtx.font = '16px Arial'
    overlayCtx.fillText(
      isStable ? 'Ready to capture!' : 'Hold steady...',
      centerX,
      centerY + 5
    )
    overlayCtx.fillText(
      `${Math.round(bestShape.confidence)}% confidence`,
      centerX,
      centerY + 30
    )
  }

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 })
      if (imageSrc) {
        const response = await fetch(imageSrc)
        const blob = await response.blob()
        
        const image = new Image()
        image.onload = () => {
          onImageCapture({
            src: imageSrc,
            blob,
            width: image.width,
            height: image.height
          })
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error('Error capturing image:', error)
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture])

  const handleFileCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        const image = new Image()
        image.onload = () => {
          onImageCapture({
            src: result,
            blob: file,
            width: image.width,
            height: image.height
          })
        }
        image.src = result
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  const onUserMediaError = () => {
    setHasCamera(false)
  }

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
              screenshotQuality={0.95}
            />
            <canvas ref={canvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
            
            {/* Status indicator */}
            <div className="absolute top-4 left-4">
              <div className="flex items-center space-x-2 bg-black bg-opacity-70 px-4 py-2 rounded-full">
                <div className={`w-3 h-3 rounded-full ${
                  !isDetectionReady ? 'bg-yellow-500 animate-pulse' :
                  bestShape ? (isShapeStable ? 'bg-green-500' : 'bg-blue-500 animate-pulse') : 'bg-gray-500'
                }`} />
                <span className="text-white text-sm">
                  {!isDetectionReady ? 'Loading...' :
                   bestShape ? (isShapeStable ? 'Ready!' : 'Adjusting...') : 'Point at document'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800">
            <Camera size={64} className="mb-4 text-gray-400" />
            <p className="text-gray-400 mb-4">Camera not available</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
            >
              Select Photo from Gallery
            </button>
          </div>
        )}
      </div>

      <div className="bg-black p-6">
        <div className="flex items-center justify-center space-x-8 max-w-md mx-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors"
          >
            <Square size={24} className="text-white" />
          </button>

          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing || !bestShape}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 disabled:opacity-50 ${
              isShapeStable && bestShape
                ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-300 scale-110' 
                : bestShape
                ? 'bg-blue-500 hover:bg-blue-400 ring-2 ring-blue-300 scale-105'
                : 'bg-gray-500'
            }`}
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-3 border-white rounded-full animate-spin border-t-transparent"></div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-white"></div>
            )}
          </button>

          {hasCamera && (
            <button
              onClick={toggleCamera}
              className="p-4 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors"
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