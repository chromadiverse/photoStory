'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react'

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
  const [feedback, setFeedback] = useState<string>('Looking for photos and posters...')
  const [isOpenCVReady, setIsOpenCVReady] = useState(false)
  
  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
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
        // @ts-ignore
        window.cv.onRuntimeInitialized = () => {
          console.log('OpenCV ready!')
          setIsOpenCVReady(true)
          startDetection()
        }
      }
    }
    document.head.appendChild(script)

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
      try {
        document.head.removeChild(script)
      } catch (e) {
        // Script might already be removed
      }
    }
  }, [])

  const detectRectangles = useCallback(() => {
    // @ts-ignore
    if (!window.cv || !isOpenCVReady || !webcamRef.current || !canvasRef.current) return

    try {
      const video = webcamRef.current.video
      if (!video || video.readyState !== 4 || video.videoWidth === 0) return

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
      const blurred = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      try {
        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
        
        // Apply bilateral filter to reduce noise while preserving edges
        cv.bilateralFilter(gray, blurred, 9, 75, 75)
        
        // Use adaptive threshold for better edge detection
        const thresh = new cv.Mat()
        cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)
        
        // Also use Canny edge detection
        cv.Canny(blurred, edges, 30, 100)
        
        // Combine both approaches
        cv.bitwise_or(thresh, edges, edges)
        
        // Morphological operations to close gaps
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
        cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)
        
        // Find contours
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
        
        let bestRect: DetectedRectangle | null = null
        let maxScore = 0
        
        const minArea = canvas.width * canvas.height * 0.03  // At least 3% of screen
        const maxArea = canvas.width * canvas.height * 0.85  // At most 85% of screen
        
        // Analyze contours
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i)
          const area = cv.contourArea(contour)
          
          if (area < minArea || area > maxArea) {
            contour.delete()
            continue
          }
          
          const perimeter = cv.arcLength(contour, true)
          
          // Approximate contour to polygon
          const approx = new cv.Mat()
          cv.approxPolyDP(contour, approx, 0.015 * perimeter, true)
          
          // Get bounding rectangle
          const rect = cv.boundingRect(contour)
          
          // Calculate scores
          let score = 0
          
          // Size score - prefer medium to large objects
          const sizeRatio = area / (canvas.width * canvas.height)
          score += Math.min(sizeRatio * 15, 8)
          
          // Aspect ratio score - photos are usually rectangular
          const aspectRatio = rect.width / rect.height
          if (aspectRatio > 0.5 && aspectRatio < 3.0) {
            if (aspectRatio > 0.8 && aspectRatio < 2.0) {
              score += 5  // Common photo ratios
            } else {
              score += 3  // Still reasonable
            }
          }
          
          // Rectangularity score
          const rectArea = rect.width * rect.height
          const extent = area / rectArea
          if (extent > 0.7) {
            score += 4
          } else if (extent > 0.5) {
            score += 2
          }
          
          // Prefer objects not at the very edge
          const margin = 20
          if (rect.x > margin && rect.y > margin && 
              rect.x + rect.width < canvas.width - margin && 
              rect.y + rect.height < canvas.height - margin) {
            score += 2
          }
          
          // Polygon approximation score - rectangles should have 4-6 corners after approximation
          if (approx.rows === 4) {
            score += 6  // Perfect rectangle
          } else if (approx.rows >= 4 && approx.rows <= 8) {
            score += 3  // Close to rectangle
          }
          
          if (score > maxScore && score > 8) {  // Higher threshold
            maxScore = score
            bestRect = {
              x: rect.x / canvas.width,
              y: rect.y / canvas.height,
              width: rect.width / canvas.width,
              height: rect.height / canvas.width,
              confidence: Math.min(score / 20, 1)
            }
          }
          
          approx.delete()
          contour.delete()
        }
        
        // Update detection state
        if (bestRect && bestRect.confidence > 0.4) {
          setDetectedRect(bestRect)
          
          if (bestRect.confidence > 0.8) {
            setFeedback('Perfect detection! Ready to capture')
          } else if (bestRect.confidence > 0.6) {
            setFeedback('Good detection - hold steady')
          } else {
            setFeedback('Photo detected - adjust position')
          }
        } else {
          setDetectedRect(null)
          setFeedback('Looking for photos and posters...')
        }
        
        // Clean up
        thresh.delete()
        kernel.delete()
        
      } catch (innerError) {
        console.error('Inner detection error:', innerError)
      }
      
      // Clean up main objects
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      
    } catch (error) {
      console.error('Detection error:', error)
      setFeedback('Detection temporarily unavailable')
    }
  }, [isOpenCVReady])

  const startDetection = useCallback(() => {
    if (isOpenCVReady && !detectionIntervalRef.current) {
      detectionIntervalRef.current = setInterval(detectRectangles, 300)
    }
  }, [detectRectangles, isOpenCVReady])

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isOpenCVReady) {
      startDetection()
    }
    
    return () => stopDetection()
  }, [isOpenCVReady, startDetection, stopDetection])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
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
          setFeedback('Photo captured!')
          
          setTimeout(() => {
            setFeedback('Looking for photos and posters...')
          }, 2000)
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error('Error capturing image:', error)
      setFeedback('Error capturing photo')
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture, detectedRect])

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
    <div className="h-screen flex flex-col bg-black">
      {/* Status bar */}
      <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {detectedRect ? (
            <CheckCircle className="text-green-500" size={20} />
          ) : (
            <AlertCircle className="text-yellow-500" size={20} />
          )}
          <span className="text-white font-medium">{feedback}</span>
        </div>
        <div className="text-white text-sm">
          {isOpenCVReady ? 'Detection Active' : 'Loading...'}
        </div>
      </div>

      {/* Camera Feed - takes remaining space */}
      <div className="flex-1 relative bg-black">
        {hasCamera ? (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              width="100%"
              height="100%"
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
              onUserMediaError={onUserMediaError}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
            />
            
            {/* Detection overlay - ONLY when detection is found */}
            {detectedRect && (
              <div
                className="absolute"
                style={{
                  left: `${detectedRect.x * 100}%`,
                  top: `${detectedRect.y * 100}%`,
                  width: `${detectedRect.width * 100}%`,
                  height: `${detectedRect.height * 100}%`,
                  border: '4px solid #10B981',
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.8)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  animation: 'pulse 2s infinite'
                }}
              >
                <div className="absolute -top-10 left-0 bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
                  PHOTO DETECTED • {Math.round(detectedRect.confidence * 100)}%
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800">
            <Camera size={80} className="mb-6 text-gray-400" />
            <p className="text-gray-300 mb-6 text-xl text-center px-4">
              Camera not available
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-xl font-semibold"
            >
              Select Photo from Gallery
            </button>
          </div>
        )}
        
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Fixed controls at bottom */}
      <div className="bg-gray-900 p-4">
        <div className="flex items-center justify-center space-x-8">
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing}
            className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 transform hover:scale-105"
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-4 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className="w-14 h-14 bg-gray-800 rounded-full"></div>
            )}
          </button>

          {hasCamera && (
            <button
              onClick={toggleCamera}
              className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 transition-all duration-200 transform hover:scale-105"
            >
              <RotateCcw size={32} color="white" />
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

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { 
            box-shadow: 0 0 30px rgba(16, 185, 129, 0.8);
            border-color: #10B981;
          }
          50% { 
            box-shadow: 0 0 50px rgba(16, 185, 129, 1);
            border-color: #34D399;
          }
        }
      `}</style>
    </div>
  )
}

export default CameraView