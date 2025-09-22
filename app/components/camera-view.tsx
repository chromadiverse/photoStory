// First, add OpenCV.js to your public folder or CDN
// Download opencv.js from: https://docs.opencv.org/4.x/opencv.js
// Place it in public/opencv.js

// app/components/CameraView.tsx
'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Grid3X3, Scan, AlertTriangle } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

interface DetectedCorners {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
  bottomRight: { x: number; y: number }
  confidence: number
}

// Declare OpenCV global
declare global {
  interface Window {
    cv: any
  }
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [showGrid, setShowGrid] = useState(true)
  const [showFrameDetection, setShowFrameDetection] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [detectedFrame, setDetectedFrame] = useState<DetectedCorners | null>(null)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [opencvReady, setOpencvReady] = useState(false)
  const [detectionQuality, setDetectionQuality] = useState<'poor' | 'good' | 'excellent'>('poor')

  // High quality video constraints
  const videoConstraints = {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    facingMode: facingMode,
    aspectRatio: { ideal: 16/9 }
  }

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = () => {
      const script = document.createElement('script')
      script.src = '/opencv.js' // Make sure to add opencv.js to your public folder
      script.async = true
      script.onload = () => {
        if (window.cv) {
          window.cv.onRuntimeInitialized = () => {
            console.log('OpenCV.js loaded successfully')
            setOpencvReady(true)
          }
        }
      }
      script.onerror = () => {
        console.error('Failed to load OpenCV.js')
        // Fallback to basic detection
        setOpencvReady(false)
      }
      document.head.appendChild(script)
    }

    if (!window.cv) {
      loadOpenCV()
    } else if (window.cv.Mat) {
      setOpencvReady(true)
    }

    return () => {
      // Cleanup if needed
    }
  }, [])

  // Advanced document detection using OpenCV
  const detectDocumentOpenCV = useCallback((canvas: HTMLCanvasElement): DetectedCorners | null => {
    if (!window.cv || !opencvReady) return null

    try {
      const cv = window.cv
      
      // Create OpenCV Mat from canvas
      const src = cv.imread(canvas)
      const gray = new cv.Mat()
      const blur = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      
      // Apply Gaussian blur to reduce noise
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
      
      // Apply adaptive threshold for better edge detection
      const thresh = new cv.Mat()
      cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)
      
      // Find edges using Canny
      cv.Canny(thresh, edges, 50, 150, 3, false)
      
      // Morphological operations to close gaps
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)
      
      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      
      let bestContour = null
      let bestScore = 0
      
      // Analyze contours to find the best rectangular shape
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)
        const perimeter = cv.arcLength(contour, true)
        
        // Skip contours that are too small
        const minArea = (canvas.width * canvas.height) * 0.05 // At least 5% of image
        if (area < minArea) {
          contour.delete()
          continue
        }
        
        // Approximate contour to polygon
        const approx = new cv.Mat()
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)
        
        // We want 4 corners for a rectangle
        if (approx.rows === 4) {
          const aspectRatio = getAspectRatio(approx)
          const rectangularity = getRectangularity(approx, area)
          const size = area / (canvas.width * canvas.height)
          
          // Score based on multiple factors
          let score = 0
          
          // Size score (prefer medium to large rectangles)
          if (size > 0.1 && size < 0.8) score += 30
          
          // Aspect ratio score (prefer reasonable aspect ratios)
          if (aspectRatio > 0.3 && aspectRatio < 3.0) score += 25
          
          // Rectangularity score (how close to a perfect rectangle)
          score += rectangularity * 25
          
          // Convexity score
          const hull = new cv.Mat()
          cv.convexHull(contour, hull)
          const hullArea = cv.contourArea(hull)
          const convexity = area / hullArea
          score += convexity * 20
          
          if (score > bestScore) {
            bestScore = score
            if (bestContour) bestContour.delete()
            bestContour = approx.clone()
          }
          
          hull.delete()
        }
        
        approx.delete()
        contour.delete()
      }
      
      // Clean up
      src.delete()
      gray.delete()
      blur.delete()
      thresh.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      kernel.delete()
      
      if (bestContour && bestScore > 40) {
        const corners = extractCorners(bestContour)
        bestContour.delete()
        
        if (corners) {
          // Determine quality based on score
          let quality: 'poor' | 'good' | 'excellent' = 'poor'
          if (bestScore > 80) quality = 'excellent'
          else if (bestScore > 60) quality = 'good'
          
          setDetectionQuality(quality)
          
          return {
            ...corners,
            confidence: bestScore / 100
          }
        }
      }
      
      if (bestContour) bestContour.delete()
      return null
      
    } catch (error) {
      console.error('OpenCV detection error:', error)
      return null
    }
  }, [opencvReady])

  // Extract corner coordinates from OpenCV contour
  const extractCorners = (contour: any): Omit<DetectedCorners, 'confidence'> | null => {
    if (!contour || contour.rows !== 4) return null

    const points = []
    for (let i = 0; i < 4; i++) {
      const point = contour.data32S.slice(i * 2, i * 2 + 2)
      points.push({ x: point[0], y: point[1] })
    }

    // Sort points to identify corners
    // Top-left: smallest x+y
    // Top-right: largest x, smallest y
    // Bottom-left: smallest x, largest y  
    // Bottom-right: largest x+y
    
    points.sort((a, b) => (a.x + a.y) - (b.x + b.y))
    const topLeft = points[0]
    const bottomRight = points[3]
    
    const remaining = [points[1], points[2]]
    remaining.sort((a, b) => a.x - b.x)
    
    const topRight = remaining.find(p => p.y < (topLeft.y + bottomRight.y) / 2) || remaining[1]
    const bottomLeft = remaining.find(p => p.y > (topLeft.y + bottomRight.y) / 2) || remaining[0]

    return {
      topLeft,
      topRight,
      bottomLeft,
      bottomRight
    }
  }

  // Calculate aspect ratio of a quadrilateral
  const getAspectRatio = (contour: any): number => {
    if (contour.rows !== 4) return 0

    const points = []
    for (let i = 0; i < 4; i++) {
      const point = contour.data32S.slice(i * 2, i * 2 + 2)
      points.push({ x: point[0], y: point[1] })
    }

    // Calculate average width and height
    const widths = [
      Math.abs(points[1].x - points[0].x),
      Math.abs(points[2].x - points[3].x)
    ]
    const heights = [
      Math.abs(points[3].y - points[0].y),
      Math.abs(points[2].y - points[1].y)
    ]

    const avgWidth = (widths[0] + widths[1]) / 2
    const avgHeight = (heights[0] + heights[1]) / 2

    return avgWidth / avgHeight
  }

  // Calculate how rectangular a shape is (0-1)
  const getRectangularity = (contour: any, area: number): number => {
    if (contour.rows !== 4) return 0

    const points = []
    for (let i = 0; i < 4; i++) {
      const point = contour.data32S.slice(i * 2, i * 2 + 2)
      points.push({ x: point[0], y: point[1] })
    }

    // Calculate bounding rectangle area
    const minX = Math.min(...points.map(p => p.x))
    const maxX = Math.max(...points.map(p => p.x))
    const minY = Math.min(...points.map(p => p.y))
    const maxY = Math.max(...points.map(p => p.y))
    
    const boundingArea = (maxX - minX) * (maxY - minY)
    
    return area / boundingArea
  }

  // Frame detection loop
  const processFrameDetection = useCallback(() => {
    if (!webcamRef.current || !canvasRef.current || !showFrameDetection) {
      animationRef.current = requestAnimationFrame(processFrameDetection)
      return
    }

    const video = webcamRef.current.video
    if (!video || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(processFrameDetection)
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match video (but smaller for processing speed)
    const scale = 0.5 // Process at half resolution for speed
    canvas.width = video.videoWidth * scale
    canvas.height = video.videoHeight * scale
    
    setVideoSize({ width: video.videoWidth, height: video.videoHeight })

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Detect document using OpenCV
    const detected = detectDocumentOpenCV(canvas)
    
    // Scale coordinates back to full resolution
    if (detected) {
      const scaledDetected = {
        topLeft: { x: detected.topLeft.x / scale, y: detected.topLeft.y / scale },
        topRight: { x: detected.topRight.x / scale, y: detected.topRight.y / scale },
        bottomLeft: { x: detected.bottomLeft.x / scale, y: detected.bottomLeft.y / scale },
        bottomRight: { x: detected.bottomRight.x / scale, y: detected.bottomRight.y / scale },
        confidence: detected.confidence
      }
      setDetectedFrame(scaledDetected)
    } else {
      setDetectedFrame(null)
      setDetectionQuality('poor')
    }

    // Continue the loop (reduce frequency to avoid performance issues)
    setTimeout(() => {
      animationRef.current = requestAnimationFrame(processFrameDetection)
    }, 100) // Process every 100ms instead of every frame
  }, [showFrameDetection, detectDocumentOpenCV])

  // Start frame detection when component mounts
  useEffect(() => {
    if (showFrameDetection && hasCamera && opencvReady) {
      animationRef.current = requestAnimationFrame(processFrameDetection)
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [showFrameDetection, hasCamera, opencvReady, processFrameDetection])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
    try {
      const video = webcamRef.current.video
      if (!video) return

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = video.videoWidth || 1920
      canvas.height = video.videoHeight || 1080

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob((blob) => {
        if (blob) {
          const imageSrc = canvas.toDataURL('image/jpeg', 0.95)
          
          onImageCapture({
            src: imageSrc,
            blob,
            width: canvas.width,
            height: canvas.height
          })
        }
      }, 'image/jpeg', 0.95)
      
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

  // Convert video coordinates to display coordinates
  const scaleCoordinates = useCallback((corners: DetectedCorners): DetectedCorners => {
    const video = webcamRef.current?.video
    const container = video?.parentElement
    if (!video || !container) return corners

    const containerRect = container.getBoundingClientRect()
    const videoRect = video.getBoundingClientRect()
    
    const scaleX = videoRect.width / video.videoWidth
    const scaleY = videoRect.height / video.videoHeight

    return {
      topLeft: { x: corners.topLeft.x * scaleX, y: corners.topLeft.y * scaleY },
      topRight: { x: corners.topRight.x * scaleX, y: corners.topRight.y * scaleY },
      bottomLeft: { x: corners.bottomLeft.x * scaleX, y: corners.bottomLeft.y * scaleY },
      bottomRight: { x: corners.bottomRight.x * scaleX, y: corners.bottomRight.y * scaleY },
      confidence: corners.confidence
    }
  }, [])

  const displayCorners = detectedFrame ? scaleCoordinates(detectedFrame) : null

  const getQualityColor = () => {
    switch (detectionQuality) {
      case 'excellent': return '#00ff00'
      case 'good': return '#ffff00'
      case 'poor': return '#ff6600'
      default: return '#ff0000'
    }
  }

  const getQualityText = () => {
    switch (detectionQuality) {
      case 'excellent': return '📄 Excellent Frame'
      case 'good': return '📄 Good Frame'
      case 'poor': return '📄 Frame Detected'
      default: return '📄 Poor Detection'
    }
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Camera Feed Container */}
      <div className="relative flex-1 bg-black overflow-hidden">
        {hasCamera ? (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
              onUserMediaError={onUserMediaError}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
              mirrored={facingMode === 'user'}
            />
            
            {/* Hidden canvas for processing */}
            <canvas 
              ref={canvasRef} 
              className="hidden"
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

        {/* OpenCV Loading Status */}
        {!opencvReady && showFrameDetection && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white rounded-full animate-spin border-t-transparent"></div>
            <span>Loading AI Detection...</span>
          </div>
        )}

        {/* Enhanced Frame Detection Overlay */}
        {showFrameDetection && displayCorners && hasCamera && opencvReady && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge> 
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              
              {/* Main detection polygon */}
              <polygon
                points={`${displayCorners.topLeft.x},${displayCorners.topLeft.y} ${displayCorners.topRight.x},${displayCorners.topRight.y} ${displayCorners.bottomRight.x},${displayCorners.bottomRight.y} ${displayCorners.bottomLeft.x},${displayCorners.bottomLeft.y}`}
                fill="none"
                stroke={getQualityColor()}
                strokeWidth="4"
                filter="url(#glow)"
                className={detectionQuality === 'excellent' ? 'animate-pulse' : ''}
              />
              
              {/* Corner indicators with size based on quality */}
              {[displayCorners.topLeft, displayCorners.topRight, displayCorners.bottomLeft, displayCorners.bottomRight].map((corner, idx) => (
                <circle 
                  key={idx}
                  cx={corner.x} 
                  cy={corner.y} 
                  r={detectionQuality === 'excellent' ? '12' : '8'} 
                  fill={getQualityColor()}
                  className={detectionQuality === 'excellent' ? 'animate-pulse' : ''}
                />
              ))}
            </svg>
            
            {/* Detection status with quality indicator */}
            <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg text-white font-medium ${
              detectionQuality === 'excellent' ? 'bg-green-600' :
              detectionQuality === 'good' ? 'bg-yellow-600' : 'bg-orange-600'
            }`}>
              {getQualityText()}
              <div className="text-xs opacity-80">
                Confidence: {Math.round((displayCorners.confidence || 0) * 100)}%
              </div>
            </div>
          </div>
        )}

        {/* Grid Overlay */}
        {showGrid && hasCamera && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="33.333%" height="33.333%" patternUnits="objectBoundingBox">
                  <path d="M 33.333 0 L 33.333 33.333 M 0 33.333 L 33.333 33.333" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        )}

        {/* Manual Frame Guide (when detection is off) */}
        {!showFrameDetection && (
          <div className="absolute inset-4 border-2 border-white opacity-30 rounded-lg pointer-events-none">
            <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-blue-500 rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-blue-500 rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-blue-500 rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-blue-500 rounded-br-lg"></div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-3 rounded-full ${showGrid ? 'bg-blue-600' : 'bg-gray-600'} transition-colors`}
            title="Toggle Grid"
          >
            <Grid3X3 size={24} />
          </button>

          {/* Frame Detection Toggle */}
          <button
            onClick={() => setShowFrameDetection(!showFrameDetection)}
            className={`p-3 rounded-full ${showFrameDetection ? 'bg-green-600' : 'bg-gray-600'} transition-colors relative`}
            title="Toggle AI Frame Detection"
          >
            <Scan size={24} />
            {!opencvReady && showFrameDetection && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
            )}
          </button>

          {/* Capture Button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50 ${
              detectionQuality === 'excellent' && displayCorners ? 'bg-green-500 hover:bg-green-400 animate-pulse' : 'bg-white hover:bg-gray-100'
            }`}
          >
            {isCapturing ? (
              <div className="w-6 h-6 border-2 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className={`w-12 h-12 rounded-full ${
                detectionQuality === 'excellent' && displayCorners ? 'bg-white' : 'bg-gray-800'
              }`}></div>
            )}
          </button>

          {/* Camera Switch */}
          {hasCamera && (
            <button
              onClick={toggleCamera}
              className="p-3 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors"
              title="Switch Camera"
            >
              <RotateCcw size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input for fallback */}
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

