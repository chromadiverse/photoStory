'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

interface DetectedShape {
  points: number[][]
  type: 'rectangle' | 'square' | 'other'
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [isOpenCVLoaded, setIsOpenCVLoaded] = useState(false)
  const [detectedShapes, setDetectedShapes] = useState<DetectedShape[]>([])

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode
  }

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = () => {
      if (window.cv) {
        setIsOpenCVLoaded(true)
        return
      }

      const script = document.createElement('script')
      script.src = 'https://docs.opencv.org/4.5.0/opencv.js'
      script.async = true
      script.onload = () => {
        // OpenCV loads asynchronously, so we need to wait for it to be ready
        const checkOpenCV = setInterval(() => {
          if (window.cv) {
            clearInterval(checkOpenCV)
            setIsOpenCVLoaded(true)
          }
        }, 100)
      }
      script.onerror = () => {
        console.warn('OpenCV.js failed to load. Shape detection disabled.')
      }
      document.head.appendChild(script)

      return () => {
        document.head.removeChild(script)
      }
    }

    loadOpenCV()
  }, [])

  // Shape detection function
  const detectShapes = useCallback(() => {
    if (!webcamRef.current || !canvasRef.current || !isOpenCVLoaded) return

    const video = webcamRef.current.video
    if (!video || video.readyState !== 4) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    try {
      // Convert canvas image to OpenCV Mat
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const src = window.cv.matFromImageData(imageData)
      const gray = new window.cv.Mat()
      const edges = new window.cv.Mat()
      const hierarchy = new window.cv.Mat()

      // Convert to grayscale
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)

      // Apply Gaussian blur to reduce noise
      window.cv.GaussianBlur(gray, gray, new window.cv.Size(5, 5), 0)

      // Detect edges using Canny
      window.cv.Canny(gray, edges, 50, 150)

      // Find contours
      const contours = new window.cv.MatVector()
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE)

      const shapes: DetectedShape[] = []

      // Process each contour
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const epsilon = 0.02 * window.cv.arcLength(contour, true)
        const approx = new window.cv.Mat()
        
        window.cv.approxPolyDP(contour, approx, epsilon, true)
        
        const area = window.cv.contourArea(approx)
        
        // Filter by area to avoid small noise
        if (area > 1000) {
          const points: number[][] = []
          
          // Extract points from the approximation
          for (let j = 0; j < approx.rows; j++) {
            points.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]])
          }

          let type: 'rectangle' | 'square' | 'other' = 'other'

          // Check if it's a quadrilateral
          if (points.length === 4) {
            type = 'rectangle'
            
            // Check if it might be a square (all sides approximately equal)
            const distances = [
              Math.sqrt(Math.pow(points[1][0] - points[0][0], 2) + Math.pow(points[1][1] - points[0][1], 2)),
              Math.sqrt(Math.pow(points[2][0] - points[1][0], 2) + Math.pow(points[2][1] - points[1][1], 2)),
              Math.sqrt(Math.pow(points[3][0] - points[2][0], 2) + Math.pow(points[3][1] - points[2][1], 2)),
              Math.sqrt(Math.pow(points[0][0] - points[3][0], 2) + Math.pow(points[0][1] - points[3][1], 2))
            ]

            const avgDistance = distances.reduce((a, b) => a + b) / 4
            const variance = distances.reduce((a, b) => a + Math.pow(b - avgDistance, 2), 0) / 4
            
            if (variance < avgDistance * 0.3) { // Allow 30% variance for squares
              type = 'square'
            }
          }

          shapes.push({ points, type })
          approx.delete()
        }
        contour.delete()
      }

      setDetectedShapes(shapes)

      // Clean up
      src.delete()
      gray.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()

    } catch (error) {
      console.error('Error detecting shapes:', error)
    }

    // Continue the animation loop
    animationRef.current = requestAnimationFrame(detectShapes)
  }, [isOpenCVLoaded])

  // Start/stop shape detection based on OpenCV load status
  useEffect(() => {
    if (isOpenCVLoaded && hasCamera) {
      animationRef.current = requestAnimationFrame(detectShapes)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isOpenCVLoaded, hasCamera, detectShapes])

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

  // Draw detected shapes on canvas
  useEffect(() => {
    if (!canvasRef.current || detectedShapes.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw detected shapes with green outlines
    detectedShapes.forEach(shape => {
      if (shape.points.length < 3) return

      ctx.strokeStyle = '#00FF00' // Green color
      ctx.lineWidth = 4
      ctx.lineJoin = 'round'
      
      ctx.beginPath()
      ctx.moveTo(shape.points[0][0], shape.points[0][1])
      
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i][0], shape.points[i][1])
      }
      
      ctx.closePath()
      ctx.stroke()

      // Add label for square/rectangle
      if (shape.type === 'square' || shape.type === 'rectangle') {
        const centerX = shape.points.reduce((sum, point) => sum + point[0], 0) / shape.points.length
        const centerY = shape.points.reduce((sum, point) => sum + point[1], 0) / shape.points.length
        
        ctx.fillStyle = '#00FF00'
        ctx.font = 'bold 20px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(shape.type.charAt(0).toUpperCase() + shape.type.slice(1), centerX, centerY - 10)
      }
    })
  }, [detectedShapes])

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
            
            {/* Canvas for shape detection overlay */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ zIndex: 10 }}
            />

            {/* Loading indicator for OpenCV */}
            {!isOpenCVLoaded && (
              <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                Loading shape detection...
              </div>
            )}

            {/* Shape detection status */}
            {isOpenCVLoaded && (
              <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-green-400 px-3 py-1 rounded text-sm">
                Shape detection active
              </div>
            )}
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

        {/* Document Frame Overlay */}
        <div className="absolute inset-4 border-2 border-white opacity-30 rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-blue-500 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-blue-500 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-blue-500 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-blue-500 rounded-br-lg"></div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
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