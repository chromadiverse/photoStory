'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square, Scan } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

interface DetectedRectangle {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number>(0)
  const opencvRef = useRef<any>(null)
  
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [detectedRectangles, setDetectedRectangles] = useState<DetectedRectangle[]>([])
  const [isDetectionActive, setIsDetectionActive] = useState(true)
  const [detectionMessage, setDetectionMessage] = useState('Looking for documents...')

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode
  }

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = async () => {
      if (typeof window !== 'undefined' && !opencvRef.current) {
        try {
          // Dynamically load OpenCV.js
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://docs.opencv.org/4.5.0/opencv.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load OpenCV'))
            document.head.appendChild(script)
          })

          // Wait for OpenCV to be ready
          // @ts-ignore
          if (cv && cv.Mat) {
            // @ts-ignore
            opencvRef.current = cv
            console.log('OpenCV loaded successfully')
          }
        } catch (error) {
          console.error('Error loading OpenCV:', error)
        }
      }
    }

    loadOpenCV()
  }, [])

  // Process video frames for rectangle detection
  const processFrame = useCallback(async () => {
    if (!webcamRef.current || !opencvRef.current || !canvasRef.current || !isDetectionActive) {
      return
    }

    const video = webcamRef.current.video
    if (!video || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(processFrame)
      return
    }

    setIsProcessing(true)

    try {
      const cv = opencvRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (!ctx) return

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Convert to OpenCV Mat
      const src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4)
      src.data.set(imageData.data)

      // Convert to grayscale
      const gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // Apply Gaussian blur to reduce noise
      const blurred = new cv.Mat()
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

      // Edge detection - using adaptive threshold for better results with varying lighting
      const edges = new cv.Mat()
      cv.adaptiveThreshold(blurred, edges, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)

      // Find contours
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      const rectangles: DetectedRectangle[] = []

      // Process contours
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const arcLength = cv.arcLength(contour, true)
        const approx = new cv.Mat()
        cv.approxPolyDP(contour, approx, 0.02 * arcLength, true)

        // Check if it's a quadrilateral (4 corners)
        if (approx.rows === 4) {
          const area = cv.contourArea(approx)
          const boundingRect = cv.boundingRect(approx)

          // Filter by size and aspect ratio
          if (area > (canvas.width * canvas.height * 0.05)) { // At least 5% of screen area
            const aspectRatio = boundingRect.width / boundingRect.height
            const isRectangleLike = aspectRatio > 0.3 && aspectRatio < 3.0 // Allow various aspect ratios
            
            if (isRectangleLike) {
              // Calculate confidence based on how rectangular it is
              const contourArea = cv.contourArea(approx)
              const boundingBoxArea = boundingRect.width * boundingRect.height
              const fullness = contourArea / boundingBoxArea
              
              if (fullness > 0.6) { // Must be reasonably filled
                rectangles.push({
                  x: boundingRect.x,
                  y: boundingRect.y,
                  width: boundingRect.width,
                  height: boundingRect.height,
                  confidence: fullness
                })
              }
            }
          }
          approx.delete()
        }
        contour.delete()
      }

      // Sort by confidence and take the best one
      rectangles.sort((a, b) => b.confidence - a.confidence)
      const bestRectangles = rectangles.slice(0, 1) // Show only the best match

      setDetectedRectangles(bestRectangles)
      
      // Update detection message
      if (bestRectangles.length > 0) {
        setDetectionMessage('Document detected! Ready to capture.')
      } else {
        setDetectionMessage('Point camera at a document or photo')
      }

      // Clean up
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()

    } catch (error) {
      console.error('Error processing frame:', error)
    } finally {
      setIsProcessing(false)
    }

    animationRef.current = requestAnimationFrame(processFrame)
  }, [isDetectionActive])

  // Start/stop frame processing when detection is active
  useEffect(() => {
    if (isDetectionActive && opencvRef.current) {
      animationRef.current = requestAnimationFrame(processFrame)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      setDetectedRectangles([])
      setDetectionMessage('Detection paused')
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isDetectionActive, processFrame])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 })
      if (imageSrc) {
        // If we have a detected rectangle, crop to that area
        let finalImageSrc = imageSrc
        let finalBlob = await (await fetch(imageSrc)).blob()

        if (detectedRectangles.length > 0) {
          const rect = detectedRectangles[0]
          finalImageSrc = await cropImageToRectangle(imageSrc, rect)
          finalBlob = await (await fetch(finalImageSrc)).blob()
        }

        const image = new Image()
        image.onload = () => {
          onImageCapture({
            src: finalImageSrc,
            blob: finalBlob,
            width: image.width,
            height: image.height
          })
        }
        image.src = finalImageSrc
      }
    } catch (error) {
      console.error('Error capturing image:', error)
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture, detectedRectangles])

  const cropImageToRectangle = async (imageSrc: string, rect: DetectedRectangle): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(imageSrc)
          return
        }

        // Add some padding around the detected rectangle (10%)
        const paddingX = rect.width * 0.1
        const paddingY = rect.height * 0.1
        
        const x = Math.max(0, rect.x - paddingX)
        const y = Math.max(0, rect.y - paddingY)
        const width = Math.min(img.width - x, rect.width + paddingX * 2)
        const height = Math.min(img.height - y, rect.height + paddingY * 2)

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.src = imageSrc
    })
  }

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

  const toggleDetection = () => {
    setIsDetectionActive(prev => !prev)
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
            
            {/* Canvas for processing - hidden */}
            <canvas 
              ref={canvasRef} 
              className="hidden" 
            />
            
            {/* Detection Status Overlay */}
            <div className="absolute top-4 left-4 right-4 flex justify-center">
              <div className={`px-4 py-2 rounded-full backdrop-blur-sm ${
                detectedRectangles.length > 0 
                  ? 'bg-green-500/90 text-white' 
                  : 'bg-black/50 text-white'
              } transition-all duration-300`}>
                <div className="flex items-center gap-2">
                  <Scan size={16} />
                  <span className="text-sm font-medium">{detectionMessage}</span>
                </div>
              </div>
            </div>

            {/* Detected Rectangle Overlay */}
            {detectedRectangles.map((rect, index) => (
              <div
                key={index}
                className="absolute border-4 border-green-500 pointer-events-none transition-all duration-300"
                style={{
                  left: `${(rect.x / (canvasRef.current?.width || 1920)) * 100}%`,
                  top: `${(rect.y / (canvasRef.current?.height || 1080)) * 100}%`,
                  width: `${(rect.width / (canvasRef.current?.width || 1920)) * 100}%`,
                  height: `${(rect.height / (canvasRef.current?.height || 1080)) * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
                }}
              >
                {/* Corner indicators */}
                <div className="absolute -top-2 -left-2 w-4 h-4 border-t-4 border-l-4 border-green-500"></div>
                <div className="absolute -top-2 -right-2 w-4 h-4 border-t-4 border-r-4 border-green-500"></div>
                <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-4 border-l-4 border-green-500"></div>
                <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-4 border-r-4 border-green-500"></div>
                
                {/* Confidence indicator */}
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
                  {Math.round(rect.confidence * 100)}% match
                </div>
              </div>
            ))}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="absolute top-4 right-4 bg-blue-500/90 text-white px-3 py-1 rounded-full text-sm">
                Processing...
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
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Detection Toggle */}
          <button
            onClick={toggleDetection}
            className={`p-3 rounded-full transition-colors ${
              isDetectionActive 
                ? 'bg-green-600 hover:bg-green-500' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={isDetectionActive ? 'Disable detection' : 'Enable detection'}
          >
            <Square size={24} className={isDetectionActive ? 'text-white' : 'text-gray-300'} />
          </button>

          {/* Capture Button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              detectedRectangles.length > 0 
                ? 'bg-green-600 hover:bg-green-500' 
                : 'bg-white hover:bg-gray-100'
            } disabled:opacity-50`}
          >
            {isCapturing ? (
              <div className="w-6 h-6 border-2 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className={`w-12 h-12 rounded-full ${
                detectedRectangles.length > 0 ? 'bg-white' : 'bg-gray-800'
              }`}></div>
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