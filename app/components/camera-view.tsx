// app/components/CameraView.tsx
'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Grid3X3, Square, Scan } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

interface DetectedCorners {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
  bottomRight: { x: number; y: number }
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

  // High quality video constraints
  const videoConstraints = {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    facingMode: facingMode,
    aspectRatio: { ideal: 16/9 }
  }

  // Edge detection using canvas
  const detectEdges = useCallback((imageData: ImageData): ImageData => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const output = new ImageData(width, height)
    
    // Sobel edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let pixelX = 0
        let pixelY = 0
        
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const idx = ((y + i) * width + (x + j)) * 4
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            const kernelIdx = (i + 1) * 3 + (j + 1)
            pixelX += gray * sobelX[kernelIdx]
            pixelY += gray * sobelY[kernelIdx]
          }
        }
        
        const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY)
        const idx = (y * width + x) * 4
        const intensity = Math.min(255, magnitude)
        
        output.data[idx] = intensity
        output.data[idx + 1] = intensity
        output.data[idx + 2] = intensity
        output.data[idx + 3] = 255
      }
    }
    
    return output
  }, [])

  // Find contours and detect rectangular shapes
  const findRectangularContours = useCallback((imageData: ImageData): DetectedCorners | null => {
    const width = imageData.width
    const height = imageData.height
    const data = imageData.data
    
    // Find strong edges
    const edges: { x: number; y: number }[] = []
    
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4
        if (data[idx] > 128) { // Strong edge threshold
          edges.push({ x, y })
        }
      }
    }
    
    if (edges.length < 100) return null
    
    // Find convex hull and approximate to rectangle
    const corners = findBestRectangle(edges, width, height)
    return corners
  }, [])

  // Simplified rectangle detection
  const findBestRectangle = useCallback((edges: { x: number; y: number }[], width: number, height: number): DetectedCorners | null => {
    if (edges.length === 0) return null
    
    // Find corner candidates
    const cornerCandidates = {
      topLeft: edges.filter(p => p.x < width * 0.4 && p.y < height * 0.4)
        .sort((a, b) => (a.x + a.y) - (b.x + b.y))[0],
      topRight: edges.filter(p => p.x > width * 0.6 && p.y < height * 0.4)
        .sort((a, b) => (b.x - a.x) + (a.y - b.y))[0],
      bottomLeft: edges.filter(p => p.x < width * 0.4 && p.y > height * 0.6)
        .sort((a, b) => (a.x - b.x) + (b.y - a.y))[0],
      bottomRight: edges.filter(p => p.x > width * 0.6 && p.y > height * 0.6)
        .sort((a, b) => (b.x + b.y) - (a.x + a.y))[0]
    }
    
    // Check if we found all corners
    if (!cornerCandidates.topLeft || !cornerCandidates.topRight || 
        !cornerCandidates.bottomLeft || !cornerCandidates.bottomRight) {
      return null
    }
    
    // Validate rectangle shape (basic checks)
    const corners = cornerCandidates as DetectedCorners
    const area = calculateRectangleArea(corners)
    const minArea = (width * height) * 0.1 // At least 10% of image
    const maxArea = (width * height) * 0.9 // At most 90% of image
    
    if (area < minArea || area > maxArea) return null
    
    return corners
  }, [])

  const calculateRectangleArea = (corners: DetectedCorners): number => {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners
    
    const width1 = Math.abs(topRight.x - topLeft.x)
    const width2 = Math.abs(bottomRight.x - bottomLeft.x)
    const height1 = Math.abs(bottomLeft.y - topLeft.y)
    const height2 = Math.abs(bottomRight.y - topRight.y)
    
    const avgWidth = (width1 + width2) / 2
    const avgHeight = (height1 + height2) / 2
    
    return avgWidth * avgHeight
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

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    setVideoSize({ width: video.videoWidth, height: video.videoHeight })

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Get image data and detect edges
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const edges = detectEdges(imageData)
    
    // Find rectangular contours
    const detected = findRectangularContours(edges)
    setDetectedFrame(detected)

    // Continue the loop
    animationRef.current = requestAnimationFrame(processFrameDetection)
  }, [showFrameDetection, detectEdges, findRectangularContours])

  // Start frame detection when component mounts
  useEffect(() => {
    if (showFrameDetection && hasCamera) {
      animationRef.current = requestAnimationFrame(processFrameDetection)
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [showFrameDetection, hasCamera, processFrameDetection])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
    try {
      // Get the video element to capture at full resolution
      const video = webcamRef.current.video
      if (!video) return

      // Create canvas with video's actual dimensions
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas to actual video resolution
      canvas.width = video.videoWidth || 1920
      canvas.height = video.videoHeight || 1080

      // Draw video frame at full resolution
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to blob
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

  // Convert canvas coordinates to display coordinates
  const scaleCoordinates = useCallback((corners: DetectedCorners, canvasWidth: number, canvasHeight: number) => {
    const container = webcamRef.current?.video?.parentElement
    if (!container) return corners

    const containerRect = container.getBoundingClientRect()
    const scaleX = containerRect.width / canvasWidth
    const scaleY = containerRect.height / canvasHeight

    return {
      topLeft: { x: corners.topLeft.x * scaleX, y: corners.topLeft.y * scaleY },
      topRight: { x: corners.topRight.x * scaleX, y: corners.topRight.y * scaleY },
      bottomLeft: { x: corners.bottomLeft.x * scaleX, y: corners.bottomLeft.y * scaleY },
      bottomRight: { x: corners.bottomRight.x * scaleX, y: corners.bottomRight.y * scaleY },
    }
  }, [])

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
              width="640" 
              height="480"
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileCapture}
              className="hidden"
            />
          </div>
        )}

        {/* Frame Detection Overlay */}
        {showFrameDetection && detectedFrame && hasCamera && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge> 
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <polygon
                points={`${detectedFrame.topLeft.x},${detectedFrame.topLeft.y} ${detectedFrame.topRight.x},${detectedFrame.topRight.y} ${detectedFrame.bottomRight.x},${detectedFrame.bottomRight.y} ${detectedFrame.bottomLeft.x},${detectedFrame.bottomLeft.y}`}
                fill="none"
                stroke="#00ff00"
                strokeWidth="3"
                filter="url(#glow)"
                className="animate-pulse"
              />
              {/* Corner indicators */}
              <circle cx={detectedFrame.topLeft.x} cy={detectedFrame.topLeft.y} r="8" fill="#00ff00" />
              <circle cx={detectedFrame.topRight.x} cy={detectedFrame.topRight.y} r="8" fill="#00ff00" />
              <circle cx={detectedFrame.bottomLeft.x} cy={detectedFrame.bottomLeft.y} r="8" fill="#00ff00" />
              <circle cx={detectedFrame.bottomRight.x} cy={detectedFrame.bottomRight.y} r="8" fill="#00ff00" />
            </svg>
            
            {/* Detection status */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg">
              📄 Frame Detected
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

        {/* Manual Frame Guide */}
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
            className={`p-3 rounded-full ${showFrameDetection ? 'bg-green-600' : 'bg-gray-600'} transition-colors`}
            title="Toggle Frame Detection"
          >
            <Scan size={24} />
          </button>

          {/* Capture Button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {isCapturing ? (
              <div className="w-6 h-6 border-2 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className="w-12 h-12 bg-gray-800 rounded-full"></div>
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