'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square, CheckCircle, AlertCircle } from 'lucide-react'

interface CapturedImage {
  src: string
  blob: Blob
  width: number
  height: number
  detectedFrame?: { x: number, y: number, width: number, height: number }
}

interface DetectedRectangle {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

interface CameraViewProps {
  onImageCapture?: (image: CapturedImage) => void
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture = () => {} }) => {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [detectedRect, setDetectedRect] = useState<DetectedRectangle | null>(null)
  const [isDetectionActive, setIsDetectionActive] = useState(true)
  const [feedback, setFeedback] = useState<string>('Hold steady and point camera at photo or poster')
  const [captureTimer, setCaptureTimer] = useState<number>(0)
  const [isAutoCapturing, setIsAutoCapturing] = useState(false)
  
  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: facingMode
  }

  // Load OpenCV
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.8.0/opencv.js'
    script.async = true
    script.onload = () => {
      // @ts-ignore
      if (window.cv) {
        console.log('OpenCV loaded successfully')
        startDetection()
      }
    }
    document.body.appendChild(script)

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
      document.body.removeChild(script)
    }
  }, [])

  const detectRectangles = useCallback(() => {
    // @ts-ignore
    if (!window.cv || !webcamRef.current || !canvasRef.current) return

    try {
      const video = webcamRef.current.video
      if (!video || video.readyState !== 4) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // @ts-ignore
      const cv = window.cv
      const src = cv.imread(canvas)
      const gray = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      
      // Apply Gaussian blur to reduce noise
      const blurred = new cv.Mat()
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
      
      // Edge detection with adjusted thresholds for better rectangle detection
      cv.Canny(blurred, edges, 50, 150)
      
      // Dilate to connect nearby edges
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
      cv.dilate(edges, edges, kernel)
      
      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      
      let bestRect: DetectedRectangle | null = null
      let maxScore = 0
      
      // Analyze contours
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)
        const perimeter = cv.arcLength(contour, true)
        
        if (area < 10000 || area > canvas.width * canvas.height * 0.8) continue
        
        // Approximate contour to polygon
        const approx = new cv.Mat()
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)
        
        // Look for rectangles (4 corners) or reasonable polygons
        if (approx.rows >= 4) {
          const rect = cv.boundingRect(contour)
          const aspectRatio = rect.width / rect.height
          
          // Score based on size, aspect ratio, and shape regularity
          let score = 0
          
          // Size score (prefer medium to large rectangles)
          const sizeRatio = area / (canvas.width * canvas.height)
          if (sizeRatio > 0.05 && sizeRatio < 0.7) {
            score += Math.min(sizeRatio * 10, 5)
          }
          
          // Aspect ratio score (prefer photo-like ratios)
          if ((aspectRatio > 0.6 && aspectRatio < 1.8) || (aspectRatio > 0.55 && aspectRatio < 2.0)) {
            score += 3
          }
          
          // Shape regularity score
          const rectArea = rect.width * rect.height
          const fillRatio = area / rectArea
          if (fillRatio > 0.7) {
            score += 2
          }
          
          // Position preference (center-ish is better)
          const centerX = rect.x + rect.width / 2
          const centerY = rect.y + rect.height / 2
          const distanceFromCenter = Math.sqrt(
            Math.pow(centerX - canvas.width / 2, 2) + 
            Math.pow(centerY - canvas.height / 2, 2)
          )
          const maxDistance = Math.sqrt(Math.pow(canvas.width / 2, 2) + Math.pow(canvas.height / 2, 2))
          score += (1 - distanceFromCenter / maxDistance) * 2
          
          if (score > maxScore) {
            maxScore = score
            bestRect = {
              x: rect.x / canvas.width,
              y: rect.y / canvas.height,
              width: rect.width / canvas.width,
              height: rect.height / canvas.height,
              confidence: Math.min(score / 10, 1)
            }
          }
        }
        
        approx.delete()
        contour.delete()
      }
      
      // Update detection state and feedback
      if (bestRect && bestRect.confidence > 0.3) {
        setDetectedRect(bestRect)
        
        if (bestRect.confidence > 0.7) {
          setFeedback('Perfect! Photo detected - hold steady')
          startAutoCapture()
        } else if (bestRect.confidence > 0.5) {
          setFeedback('Good detection - hold steady for better focus')
        } else {
          setFeedback('Photo detected - move closer or adjust angle')
          resetAutoCapture()
        }
      } else {
        setDetectedRect(null)
        setFeedback('Point camera at photo or poster - looking for rectangular shapes')
        resetAutoCapture()
      }
      
      // Clean up OpenCV objects
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      kernel.delete()
      
    } catch (error) {
      console.error('Detection error:', error)
    }
  }, [])

  const startAutoCapture = useCallback(() => {
    if (!isAutoCapturing && detectedRect && detectedRect.confidence > 0.7) {
      setIsAutoCapturing(true)
      setCaptureTimer(3)
      
      const countdown = setInterval(() => {
        setCaptureTimer(prev => {
          if (prev <= 1) {
            clearInterval(countdown)
            handleCapture()
            setIsAutoCapturing(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }, [detectedRect, isAutoCapturing])

  const resetAutoCapture = useCallback(() => {
    setIsAutoCapturing(false)
    setCaptureTimer(0)
  }, [])

  const startDetection = useCallback(() => {
    if (isDetectionActive && !detectionIntervalRef.current) {
      detectionIntervalRef.current = setInterval(detectRectangles, 500) // Slower detection for elderly users
    }
  }, [detectRectangles, isDetectionActive])

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isDetectionActive) {
      startDetection()
    } else {
      stopDetection()
    }
    
    return () => stopDetection()
  }, [isDetectionActive, startDetection, stopDetection])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    resetAutoCapture()
    
    try {
      const imageSrc = webcamRef.current.getScreenshot({ 
        width: 1920, 
        height: 1080
      })
      
      if (imageSrc) {
        const response = await fetch(imageSrc)
        const blob = await response.blob()
        
        const image = new Image()
        image.onload = () => {
          const capturedImage: CapturedImage = {
            src: imageSrc,
            blob,
            width: image.width,
            height: image.height,
            detectedFrame: detectedRect ? {
              x: detectedRect.x * image.width,
              y: detectedRect.y * image.height,
              width: detectedRect.width * image.width,
              height: detectedRect.height * image.height
            } : undefined
          }
          onImageCapture(capturedImage)
          setFeedback('Photo captured successfully!')
          
          // Clear detection temporarily
          setDetectedRect(null)
          setTimeout(() => {
            setFeedback('Point camera at another photo or poster')
          }, 2000)
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error('Error capturing image:', error)
      setFeedback('Error capturing photo - please try again')
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture, detectedRect, resetAutoCapture])

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
    <div className="relative h-screen flex flex-col bg-gray-900">
      {/* Header with feedback */}
      <div className="bg-gray-800 p-4 text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          {detectedRect ? (
            detectedRect.confidence > 0.7 ? (
              <CheckCircle className="text-green-500" size={24} />
            ) : (
              <AlertCircle className="text-yellow-500" size={24} />
            )
          ) : (
            <Square className="text-gray-400" size={24} />
          )}
          <h1 className="text-xl font-bold text-white">Photo Assistant</h1>
        </div>
        <p className="text-lg text-gray-300">{feedback}</p>
        {isAutoCapturing && (
          <div className="mt-2">
            <div className="text-3xl font-bold text-green-500">
              Taking photo in {captureTimer}...
            </div>
          </div>
        )}
      </div>

      {/* Camera Feed */}
      <div className="relative flex-1 bg-black">
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
            
            {/* Detection overlay */}
            {detectedRect && (
              <div
                className="absolute border-4 border-green-500 bg-green-500 bg-opacity-10"
                style={{
                  left: `${detectedRect.x * 100}%`,
                  top: `${detectedRect.y * 100}%`,
                  width: `${detectedRect.width * 100}%`,
                  height: `${detectedRect.height * 100}%`,
                  borderColor: detectedRect.confidence > 0.7 ? '#10B981' : '#F59E0B',
                  backgroundColor: detectedRect.confidence > 0.7 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  boxShadow: detectedRect.confidence > 0.7 ? '0 0 20px rgba(16, 185, 129, 0.5)' : '0 0 20px rgba(245, 158, 11, 0.5)',
                  animation: detectedRect.confidence > 0.7 ? 'pulse 2s infinite' : 'none'
                }}
              >
                <div className="absolute -top-8 left-0 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                  {Math.round(detectedRect.confidence * 100)}% match
                </div>
              </div>
            )}

            {/* Guide overlay for no detection */}
            {!detectedRect && (
              <div className="absolute inset-8 border-2 border-dashed border-gray-400 opacity-50 rounded-lg flex items-center justify-center">
                <div className="text-center text-white bg-black bg-opacity-50 p-4 rounded-lg">
                  <Square size={48} className="mx-auto mb-2 opacity-75" />
                  <p className="text-lg">Position photo or poster in this area</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800">
            <Camera size={80} className="mb-6 text-gray-400" />
            <p className="text-gray-300 mb-6 text-xl text-center px-4">
              Camera not available.<br />You can select a photo from your gallery instead.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-xl font-semibold"
            >
              Select Photo from Gallery
            </button>
          </div>
        )}
        
        {/* Hidden canvas for OpenCV processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Large, accessible controls */}
      <div className="bg-gray-800 p-6">
        <div className="flex items-center justify-center space-x-8">
          {/* Manual capture button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing || isAutoCapturing}
            className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 transform hover:scale-105"
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-3 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className="w-14 h-14 bg-gray-800 rounded-full"></div>
            )}
          </button>

          {/* Camera switch */}
          {hasCamera && (
            <button
              onClick={toggleCamera}
              className="p-4 rounded-full bg-gray-600 hover:bg-gray-500 transition-all duration-200 transform hover:scale-105"
            >
              <RotateCcw size={32} color="white" />
            </button>
          )}

          {/* Detection toggle */}
          <button
            onClick={() => setIsDetectionActive(!isDetectionActive)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              isDetectionActive 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
          >
            {isDetectionActive ? 'Auto-Detect ON' : 'Auto-Detect OFF'}
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-gray-300">
          <p className="text-lg">
            {detectedRect && detectedRect.confidence > 0.7 
              ? "Perfect! Photo will be taken automatically, or tap the white button"
              : "Point camera at old photos or posters. Tap white button to capture manually"}
          </p>
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

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

export default CameraView