'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

// Define proper types for OpenCV and shape detection
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
  perimeter: number;
  aspectRatio: number;
  confidence: number;
}

// Smoothing and stabilization parameters
const SMOOTHING_FACTOR = 0.7; // Higher = more smoothing (0-1)
const STABILITY_THRESHOLD = 15; // Pixels movement allowed between frames
const MIN_STABLE_FRAMES = 8; // Frames needed for stable detection
const CONFIDENCE_THRESHOLD = 40; // Minimum confidence to consider

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
  
  // State with smoothing
  const [detectedShapes, setDetectedShapes] = useState<DetectedShape[]>([])
  const [bestShape, setBestShape] = useState<DetectedShape | null>(null)
  const [isShapeStable, setIsShapeStable] = useState(false)
  
  // Refs for smoothing and stability tracking
  const stableFrameCount = useRef(0)
  const lastBestShape = useRef<DetectedShape | null>(null)
  const smoothedShape = useRef<Point[] | null>(null)
  const shapeHistory = useRef<DetectedShape[]>([])

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
        
        const scriptPromise = new Promise((resolve, reject) => {
          script.onload = resolve
          script.onerror = reject
        })
        
        document.head.appendChild(script)
        await scriptPromise

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

  // Improved shape detection with better filtering for elderly users
  const detectAllRectangularShapes = (canvas: HTMLCanvasElement): DetectedShape[] => {
    if (!window.cv || !canvas) return []

    try {
      const src = window.cv.imread(canvas)
      const gray = new window.cv.Mat()
      const blurred = new window.cv.Mat()
      const edges = new window.cv.Mat()
      
      // Convert to grayscale
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)
      
      // Apply stronger blur to reduce noise from shaky hands
      window.cv.GaussianBlur(gray, blurred, new window.cv.Size(5, 5), 0)
      
      // Use adaptive thresholding for better edge detection in varying light
      const binary = new window.cv.Mat()
      window.cv.adaptiveThreshold(blurred, binary, 255, window.cv.ADAPTIVE_THRESH_GAUSSIAN_C, window.cv.THRESH_BINARY, 11, 2)
      
      // Use morphological operations to clean up the image
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(3, 3))
      window.cv.morphologyEx(binary, edges, window.cv.MORPH_CLOSE, kernel)
      
      // Find contours
      const contours = new window.cv.MatVector()
      const hierarchy = new window.cv.Mat()
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE)
      
      const detectedShapes: DetectedShape[] = []
      const minArea = canvas.width * canvas.height * 0.02 // Reduced to 2% for better detection
      const maxArea = canvas.width * canvas.height * 0.90 // Maximum 90% of screen
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = window.cv.contourArea(contour)
        
        // Filter by area - more lenient for elderly users
        if (area < minArea || area > maxArea) {
          contour.delete()
          continue
        }
        
        // Use more lenient epsilon for approximation (elderly might have shaky hands)
        const approx = new window.cv.Mat()
        const epsilon = 0.04 * window.cv.arcLength(contour, true) // Increased epsilon
        window.cv.approxPolyDP(contour, approx, epsilon, true)
        
        // Accept 4-6 vertices to be more forgiving
        if (approx.rows >= 4 && approx.rows <= 6) {
          const corners: Point[] = []
          for (let j = 0; j < approx.rows; j++) {
            corners.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            })
          }
          
          // More lenient validation for elderly users
          if (isValidRectangle(corners, canvas.width, canvas.height)) {
            const sortedCorners = sortCorners(corners)
            const confidence = calculateShapeConfidence(sortedCorners, area, canvas.width, canvas.height)
            
            // Only include shapes with reasonable confidence
            if (confidence >= CONFIDENCE_THRESHOLD) {
              detectedShapes.push({
                corners: sortedCorners,
                area: area,
                perimeter: window.cv.arcLength(contour, true),
                aspectRatio: calculateAspectRatio(sortedCorners),
                confidence: confidence
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
      binary.delete()
      contours.delete()
      hierarchy.delete()
      kernel.delete()
      
      // Sort by confidence and return top candidates
      return detectedShapes
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3) // Keep only top 3 candidates
      
    } catch (error) {
      console.error('Error in shape detection:', error)
      return []
    }
  }

  // More lenient rectangle validation for elderly users
  const isValidRectangle = (corners: Point[], canvasWidth: number, canvasHeight: number): boolean => {
    if (corners.length < 4) return false
    
    // Check if all corners are within reasonable canvas bounds
    for (const corner of corners) {
      if (corner.x < -50 || corner.x > canvasWidth + 50 || corner.y < -50 || corner.y > canvasHeight + 50) {
        return false
      }
    }
    
    // Calculate side lengths
    const sides: number[] = []
    for (let i = 0; i < corners.length; i++) {
      const next = (i + 1) % corners.length
      const length = Math.sqrt(
        Math.pow(corners[next].x - corners[i].x, 2) + 
        Math.pow(corners[next].y - corners[i].y, 2)
      )
      sides.push(length)
    }
    
    // More lenient tolerance for rectangle validation (40% instead of 30%)
    const tolerance = 0.4
    if (corners.length === 4) {
      const side1Ratio = Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2])
      const side2Ratio = Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3])
      return side1Ratio < tolerance && side2Ratio < tolerance
    }
    
    // For polygons with more than 4 sides, be more lenient
    return true
  }

  // Calculate aspect ratio
  const calculateAspectRatio = (corners: Point[]): number => {
    const width = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2))
    const height = Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2))
    return Math.max(width, height) / Math.min(width, height)
  }

  // Calculate confidence score with adjustments for elderly use
  const calculateShapeConfidence = (corners: Point[], area: number, canvasWidth: number, canvasHeight: number): number => {
    let confidence = 0
    
    // Area score - more lenient range
    const areaRatio = area / (canvasWidth * canvasHeight)
    if (areaRatio > 0.05 && areaRatio < 0.85) { // Wider range
      confidence += 30
    } else if (areaRatio > 0.02 && areaRatio < 0.95) { // Even wider for very small/large
      confidence += 15
    }
    
    // Aspect ratio score - accept wider range of ratios
    const aspectRatio = calculateAspectRatio(corners)
    const commonRatios = [1, 1.33, 1.5, 1.6, 1.77, 0.75, 0.67, 2, 0.5] // Added more ratios
    const closestRatio = commonRatios.reduce((prev, curr) => 
      Math.abs(curr - aspectRatio) < Math.abs(prev - aspectRatio) ? curr : prev
    )
    const ratioError = Math.abs(aspectRatio - closestRatio) / closestRatio
    if (ratioError < 0.3) confidence += 25 // Increased tolerance
    
    // Position score - less penalty for off-center shapes
    const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / corners.length
    const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / corners.length
    const distanceFromCenter = Math.sqrt(
      Math.pow(centerX - canvasWidth / 2, 2) + Math.pow(centerY - canvasHeight / 2, 2)
    )
    const maxDistance = Math.sqrt(Math.pow(canvasWidth / 2, 2) + Math.pow(canvasHeight / 2, 2))
    confidence += (1 - distanceFromCenter / maxDistance) * 15 // Reduced weight
    
    // Regularity score - more lenient angle checking
    const angles = calculateCornerAngles(corners)
    const angleScore = angles.filter(angle => Math.abs(angle - 90) < 25).length * (25 / corners.length) // Increased tolerance
    confidence += angleScore
    
    return Math.min(confidence, 100)
  }

  // Calculate corner angles
  const calculateCornerAngles = (corners: Point[]): number[] => {
    const angles: number[] = []
    for (let i = 0; i < corners.length; i++) {
      const prev = corners[(i + corners.length - 1) % corners.length]
      const curr = corners[i]
      const next = corners[(i + 1) % corners.length]
      
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

  // Sort corners in clockwise order
  const sortCorners = (corners: Point[]): Point[] => {
    if (!corners || corners.length < 3) return corners
    
    // Find center point
    const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / corners.length
    const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / corners.length
    
    // Sort by angle from center
    return corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX)
      const angleB = Math.atan2(b.y - centerY, b.x - centerX)
      return angleA - angleB
    })
  }

  // Smooth shape corners using exponential smoothing
  const smoothShapeCorners = (currentCorners: Point[], previousCorners: Point[] | null): Point[] => {
    if (!previousCorners || currentCorners.length !== previousCorners.length) {
      return currentCorners
    }

    return currentCorners.map((corner, index) => {
      const prevCorner = previousCorners[index]
      return {
        x: prevCorner.x * SMOOTHING_FACTOR + corner.x * (1 - SMOOTHING_FACTOR),
        y: prevCorner.y * SMOOTHING_FACTOR + corner.y * (1 - SMOOTHING_FACTOR)
      }
    })
  }

  // Improved shape similarity check with hysteresis
  const areShapesSimilar = (shape1: DetectedShape | null, shape2: DetectedShape | null): boolean => {
    if (!shape1 || !shape2) return false
    if (shape1.corners.length !== shape2.corners.length) return false
    
    let totalDistance = 0
    for (let i = 0; i < shape1.corners.length; i++) {
      const dx = Math.abs(shape1.corners[i].x - shape2.corners[i].x)
      const dy = Math.abs(shape1.corners[i].y - shape2.corners[i].y)
      totalDistance += Math.sqrt(dx * dx + dy * dy)
    }
    
    const avgDistance = totalDistance / shape1.corners.length
    return avgDistance < STABILITY_THRESHOLD
  }

  // Detection loop with improved smoothing
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
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Detect all rectangular shapes
        const shapes = detectAllRectangularShapes(canvas)
        setDetectedShapes(shapes)
        
        // Select best shape and apply smoothing
        let currentBest = shapes.length > 0 ? shapes[0] : null
        
        if (currentBest) {
          // Apply smoothing to reduce jumpiness
          const smoothedCorners = smoothShapeCorners(
            currentBest.corners, 
            smoothedShape.current || currentBest.corners
          )
          smoothedShape.current = smoothedCorners
          
          // Create smoothed shape
          currentBest = {
            ...currentBest,
            corners: smoothedCorners
          }
        } else {
          smoothedShape.current = null
        }
        
        // Stability checking with hysteresis
        if (currentBest && lastBestShape.current && areShapesSimilar(currentBest, lastBestShape.current)) {
          stableFrameCount.current = Math.min(stableFrameCount.current + 1, MIN_STABLE_FRAMES * 2)
        } else {
          stableFrameCount.current = Math.max(stableFrameCount.current - 2, 0)
        }
        
        // Update stability state
        const newStability = stableFrameCount.current >= MIN_STABLE_FRAMES
        if (newStability !== isShapeStable) {
          setIsShapeStable(newStability)
        }
        
        // Update best shape
        setBestShape(currentBest)
        lastBestShape.current = currentBest
        
        // Draw overlay
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

  // Simplified overlay drawing for better performance
  const drawOverlay = (overlayCanvas: HTMLCanvasElement, shapes: DetectedShape[], bestShape: DetectedShape | null) => {
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) return

    overlayCanvas.width = canvasRef.current?.width || 0
    overlayCanvas.height = canvasRef.current?.height || 0
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    if (shapes.length === 0) {
      // Simple scanning indicator
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      
      overlayCtx.fillStyle = '#FFFFFF'
      overlayCtx.font = 'bold 20px Arial'
      overlayCtx.textAlign = 'center'
      overlayCtx.fillText(
        'Point camera at document or photo',
        overlayCanvas.width / 2,
        overlayCanvas.height / 2
      )
      return
    }

    // Draw only the best shape to reduce visual clutter
    if (bestShape) {
      const corners = bestShape.corners
      const isStable = isShapeStable
      
      // Draw semi-transparent overlay
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      
      // Cut out the detected shape area
      overlayCtx.globalCompositeOperation = 'destination-out'
      overlayCtx.beginPath()
      overlayCtx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) {
        overlayCtx.lineTo(corners[i].x, corners[i].y)
      }
      overlayCtx.closePath()
      overlayCtx.fill()
      
      // Draw border
      overlayCtx.globalCompositeOperation = 'source-over'
      overlayCtx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
      overlayCtx.lineWidth = isStable ? 6 : 4
      overlayCtx.setLineDash(isStable ? [] : [10, 5])
      overlayCtx.beginPath()
      overlayCtx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) {
        overlayCtx.lineTo(corners[i].x, corners[i].y)
      }
      overlayCtx.closePath()
      overlayCtx.stroke()
      overlayCtx.setLineDash([])
      
      // Simple corner markers
      corners.forEach((corner) => {
        overlayCtx.fillStyle = isStable ? '#10B981' : '#3B82F6'
        overlayCtx.beginPath()
        overlayCtx.arc(corner.x, corner.y, 8, 0, 2 * Math.PI)
        overlayCtx.fill()
      })
      
      // Status text
      const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / corners.length
      const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / corners.length
      
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      overlayCtx.fillRect(centerX - 100, centerY - 40, 200, 80)
      
      overlayCtx.fillStyle = '#FFFFFF'
      overlayCtx.font = 'bold 16px Arial'
      overlayCtx.textAlign = 'center'
      overlayCtx.fillText(
        isStable ? 'Perfect! Ready to capture' : 'Hold steady...',
        centerX,
        centerY - 10
      )
      overlayCtx.font = '14px Arial'
      overlayCtx.fillText(
        `${Math.round(bestShape.confidence)}% confidence`,
        centerX,
        centerY + 15
      )
    }
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
      {/* Camera Feed */}
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

        {/* Simplified status indicator */}
        {hasCamera && (
          <div className="absolute top-4 left-4">
            <div className="flex items-center space-x-2 bg-black bg-opacity-70 px-4 py-2 rounded-full">
              <div className={`w-3 h-3 rounded-full ${
                !isDetectionReady ? 'bg-yellow-500' :
                bestShape ? (isShapeStable ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-500'
              }`} />
              <span className="text-white text-sm">
                {!isDetectionReady ? 'Loading...' :
                 bestShape ? (isShapeStable ? 'Ready!' : 'Detected') : 'Scanning...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Controls */}
      <div className="bg-black p-6">
        <div className="flex items-center justify-center space-x-8 max-w-md mx-auto">
          {/* File Input Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors"
          >
            <Square size={24} className="text-white" />
          </button>

          {/* Capture Button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing || !bestShape}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 disabled:opacity-50 ${
              isShapeStable && bestShape
                ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-300' 
                : bestShape
                ? 'bg-blue-500 hover:bg-blue-400'
                : 'bg-gray-500'
            }`}
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-3 border-white rounded-full animate-spin border-t-transparent"></div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-white"></div>
            )}
          </button>

          {/* Camera Switch */}
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

      {/* Hidden file input */}
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