'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

// Types for jscanify
declare global {
  interface Window {
    cv: any;
    jscanify: any;
  }
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
  const [scanner, setScanner] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState('Loading camera...')
  const animationFrameRef = useRef<number>(0)
  const [detectedCorners, setDetectedCorners] = useState<any>(null)
  const [isDocumentStable, setIsDocumentStable] = useState(false)
  const stableFrameCount = useRef(0)
  const lastCorners = useRef<any>(null)

  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: facingMode
  }

  // Load OpenCV.js and jscanify with better error handling
  useEffect(() => {
    let mounted = true
    const loadLibraries = async () => {
      try {
        setLoadingStatus('Loading OpenCV...')
        
        // Load OpenCV.js if not already loaded
        if (!window.cv) {
          await new Promise((resolve, reject) => {
            // Check if already loading or loaded
            if (document.querySelector('script[src*="opencv.js"]')) {
              const existingScript = document.querySelector('script[src*="opencv.js"]') as HTMLScriptElement
              existingScript.onload = resolve
              existingScript.onerror = reject
              return
            }

            const script = document.createElement('script')
            script.src = 'https://docs.opencv.org/4.8.0/opencv.js'
            script.async = true
            script.onload = resolve
            script.onerror = reject
            document.body.appendChild(script)
          })

          // Wait for OpenCV to be fully initialized
          await new Promise((resolve) => {
            const checkOpenCV = () => {
              if (window.cv && window.cv.Mat) {
                resolve(true)
              } else {
                setTimeout(checkOpenCV, 100)
              }
            }
            checkOpenCV()
          })
        }

        if (!mounted) return
        setLoadingStatus('Loading document scanner...')

        // Load jscanify if not already loaded
        if (!window.jscanify) {
          await new Promise((resolve, reject) => {
            if (document.querySelector('script[src*="jscanify"]')) {
              const existingScript = document.querySelector('script[src*="jscanify"]') as HTMLScriptElement
              existingScript.onload = resolve
              existingScript.onerror = reject
              return
            }

            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/jscanify@1.2.0/dist/jscanify.min.js'
            script.async = true
            script.onload = resolve
            script.onerror = reject
            document.body.appendChild(script)
          })
        }

        if (!mounted) return

        // Initialize scanner
        if (window.jscanify) {
          const scannerInstance = new window.jscanify()
          setScanner(scannerInstance)
          setIsDetectionReady(true)
          setLoadingStatus('Ready')
        } else {
          throw new Error('jscanify not available')
        }
      } catch (error) {
        console.error('Failed to load detection libraries:', error)
        if (mounted) {
          setLoadingStatus('Scanner failed - using basic mode')
          setIsDetectionReady(true) // Continue without advanced features
        }
      }
    }

    loadLibraries()

    return () => {
      mounted = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Document detection loop
  useEffect(() => {
    if (!isDetectionReady || !hasCamera) return

    const detectDocument = () => {
      const webcam = webcamRef.current
      const canvas = canvasRef.current
      const overlayCanvas = overlayCanvasRef.current

      if (!webcam || !canvas || !overlayCanvas) {
        animationFrameRef.current = requestAnimationFrame(detectDocument)
        return
      }

      const video = webcam.video
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0) {
        animationFrameRef.current = requestAnimationFrame(detectDocument)
        return
      }

      try {
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(detectDocument)
          return
        }

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Detect document corners if scanner is available
        let corners = null
        if (scanner) {
          try {
            corners = scanner.findPaperContour(canvas)
          } catch (error) {
            console.warn('Document detection error:', error)
          }
        }

        // Draw overlay
        const overlayCtx = overlayCanvas.getContext('2d')
        if (!overlayCtx) {
          animationFrameRef.current = requestAnimationFrame(detectDocument)
          return
        }

        overlayCanvas.width = canvas.width
        overlayCanvas.height = canvas.height
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

        if (corners && corners.length === 4) {
          setDetectedCorners(corners)
          
          // Check if document is stable
          if (lastCorners.current && areCornersStable(corners, lastCorners.current)) {
            stableFrameCount.current++
            if (stableFrameCount.current > 15) { // ~0.5 second at 30fps
              setIsDocumentStable(true)
            }
          } else {
            stableFrameCount.current = 0
            setIsDocumentStable(false)
          }
          lastCorners.current = corners

          // Draw detection overlay
          drawDetectionOverlay(overlayCtx, corners, canvas.width, canvas.height, isDocumentStable)
        } else {
          setDetectedCorners(null)
          setIsDocumentStable(false)
          stableFrameCount.current = 0
          lastCorners.current = null

          // Show guidance overlay when no document detected
          drawGuidanceOverlay(overlayCtx, canvas.width, canvas.height)
        }
      } catch (error) {
        console.error('Detection error:', error)
      }

      animationFrameRef.current = requestAnimationFrame(detectDocument)
    }

    // Start detection after a small delay to ensure everything is ready
    const timeoutId = setTimeout(() => {
      animationFrameRef.current = requestAnimationFrame(detectDocument)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isDetectionReady, scanner, hasCamera])

  // Helper function to draw detection overlay
  const drawDetectionOverlay = (ctx: CanvasRenderingContext2D, corners: any[], width: number, height: number, isStable: boolean) => {
    // Draw dimmed background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, width, height)

    // Clear document area (create window effect)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    ctx.fill()

    // Draw corner highlights
    ctx.globalCompositeOperation = 'source-over'
    corners.forEach((corner: any, index: number) => {
      // Corner markers
      ctx.fillStyle = isStable ? '#10B981' : '#3B82F6'
      ctx.beginPath()
      ctx.arc(corner.x, corner.y, 8, 0, 2 * Math.PI)
      ctx.fill()

      // Corner lines
      ctx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
      ctx.lineWidth = 3
      ctx.beginPath()
      
      const size = 25
      switch (index) {
        case 0: // top-left
          ctx.moveTo(corner.x, corner.y + size)
          ctx.lineTo(corner.x, corner.y)
          ctx.lineTo(corner.x + size, corner.y)
          break
        case 1: // top-right
          ctx.moveTo(corner.x - size, corner.y)
          ctx.lineTo(corner.x, corner.y)
          ctx.lineTo(corner.x, corner.y + size)
          break
        case 2: // bottom-right
          ctx.moveTo(corner.x, corner.y - size)
          ctx.lineTo(corner.x, corner.y)
          ctx.lineTo(corner.x - size, corner.y)
          break
        case 3: // bottom-left
          ctx.moveTo(corner.x + size, corner.y)
          ctx.lineTo(corner.x, corner.y)
          ctx.lineTo(corner.x, corner.y - size)
          break
      }
      ctx.stroke()
    })

    // Document outline
    ctx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
    ctx.lineWidth = 2
    ctx.setLineDash(isStable ? [] : [10, 5])
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Helper function to draw guidance overlay
  const drawGuidanceOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Dimmed background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, width, height)

    // Draw guide frame
    const centerX = width / 2
    const centerY = height / 2
    const frameWidth = Math.min(width * 0.8, 400)
    const frameHeight = frameWidth * 0.7

    ctx.strokeStyle = '#6B7280'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])
    ctx.strokeRect(
      centerX - frameWidth / 2,
      centerY - frameHeight / 2,
      frameWidth,
      frameHeight
    )
    ctx.setLineDash([])

    // Guide text
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(
      'Position document within frame',
      centerX,
      centerY + frameHeight / 2 + 30
    )
  }

  // Helper function to check if corners are stable
  const areCornersStable = (corners1: any[], corners2: any[], threshold = 15) => {
    if (!corners1 || !corners2 || corners1.length !== corners2.length) return false
    
    for (let i = 0; i < corners1.length; i++) {
      const dx = Math.abs(corners1[i].x - corners2[i].x)
      const dy = Math.abs(corners1[i].y - corners2[i].y)
      if (dx > threshold || dy > threshold) return false
    }
    return true
  }

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1280, height: 720 })
      if (imageSrc) {
        let finalImage = imageSrc

        // If we detected corners and scanner is available, try to extract document
        if (detectedCorners && scanner) {
          try {
            const tempCanvas = document.createElement('canvas')
            const tempCtx = tempCanvas.getContext('2d')
            
            if (tempCtx) {
              const img = new Image()
              await new Promise((resolve) => {
                img.onload = resolve
                img.src = imageSrc
              })

              tempCanvas.width = img.width
              tempCanvas.height = img.height
              tempCtx.drawImage(img, 0, 0)

              const extractedCanvas = scanner.extractPaper(tempCanvas, img.width, img.height)
              if (extractedCanvas) {
                finalImage = extractedCanvas.toDataURL('image/jpeg', 0.9)
              }
            }
          } catch (extractError) {
            console.error('Error extracting document:', extractError)
            // Fall back to original image
          }
        }

        // Convert final image to blob
        const response = await fetch(finalImage)
        const processedBlob = await response.blob()
        
        onImageCapture({
          src: finalImage,
          blob: processedBlob,
          width: webcamRef.current.video?.videoWidth || 1280,
          height: webcamRef.current.video?.videoHeight || 720
        })
      }
    } catch (error) {
      console.error('Error capturing image:', error)
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture, detectedCorners, scanner])

  const handleFileCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        onImageCapture({
          src: result,
          blob: file,
          width: 0, // Will be set when image loads
          height: 0
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  const onUserMediaError = () => {
    setHasCamera(false)
    setLoadingStatus('Camera not available')
  }

  const onUserMedia = () => {
    setHasCamera(true)
    setLoadingStatus('Ready')
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
              onUserMedia={onUserMedia}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.9}
              forceScreenshotSourceSize={true}
            />
            {/* Hidden canvas for processing */}
            <canvas
              ref={canvasRef}
              className="hidden"
            />
            {/* Overlay canvas for detection visualization */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800 text-white p-4">
            <Camera size={64} className="mb-4 text-gray-400" />
            <p className="text-gray-400 mb-4 text-center">{loadingStatus}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Select Photo from Gallery
            </button>
          </div>
        )}

        {/* Status indicator */}
        {hasCamera && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <div className="flex items-center space-x-2 bg-black bg-opacity-50 px-3 py-1 rounded-full">
              <div className={`w-2 h-2 rounded-full ${
                !isDetectionReady ? 'bg-yellow-500' :
                detectedCorners ? (isDocumentStable ? 'bg-green-500' : 'bg-blue-500') : 'bg-red-500'
              }`} />
              <span className="text-white text-sm">
                {!isDetectionReady ? loadingStatus :
                 detectedCorners ? (isDocumentStable ? 'Ready to capture' : 'Document detected') : 'Find document'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Capture Button */}
          <button
            onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
            disabled={isCapturing || (!hasCamera && !fileInputRef.current)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 disabled:opacity-50 ${
              isDocumentStable && hasCamera
                ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-300 animate-pulse' 
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            {isCapturing ? (
              <div className="w-6 h-6 border-2 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className={`w-12 h-12 rounded-full ${
                (isDocumentStable && hasCamera) ? 'bg-white' : 'bg-gray-800'
              }`}></div>
            )}
          </button>

          {/* Camera Switch */}
          {hasCamera && (
            <button
              onClick={toggleCamera}
              className="p-3 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors text-white"
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
        onChange={handleFileCapture}
        className="hidden"
      />
    </div>
  )
}

export default CameraView