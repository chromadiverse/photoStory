'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Square } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

// Types for OpenCV
declare global {
  interface Window {
    cv: any;
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
  const animationFrameRef = useRef<number>(0)
  const [detectedCorners, setDetectedCorners] = useState<any>(null)
  const [isDocumentStable, setIsDocumentStable] = useState(false)
  const stableFrameCount = useRef(0)
  const lastCorners = useRef<any>(null)

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

        // Create script element
        const script = document.createElement('script')
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js'
        script.async = true
        
        // Set up promise for script loading
        const scriptPromise = new Promise((resolve, reject) => {
          script.onload = resolve
          script.onerror = reject
        })
        
        document.head.appendChild(script)
        await scriptPromise

        // Wait for OpenCV to be fully initialized
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

  // Document detection function using OpenCV
  const detectDocumentCorners = (canvas: HTMLCanvasElement) => {
    if (!window.cv || !canvas) return null

    try {
      // Read image from canvas
      const src = window.cv.imread(canvas)
      
      // Convert to grayscale
      const gray = new window.cv.Mat()
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)
      
      // Apply Gaussian blur
      const blurred = new window.cv.Mat()
      const ksize = new window.cv.Size(5, 5)
      window.cv.GaussianBlur(gray, blurred, ksize, 0, 0, window.cv.BORDER_DEFAULT)
      
      // Edge detection using Canny
      const edges = new window.cv.Mat()
      window.cv.Canny(blurred, edges, 75, 200)
      
      // Find contours
      const contours = new window.cv.MatVector()
      const hierarchy = new window.cv.Mat()
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_LIST, window.cv.CHAIN_APPROX_SIMPLE)
      
      let bestContour = null
      let maxArea = 0
      
      // Find the largest rectangular contour
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = window.cv.contourArea(contour)
        
        // Skip small contours
        if (area < 10000) continue
        
        // Approximate contour to polygon
        const approx = new window.cv.Mat()
        const epsilon = 0.02 * window.cv.arcLength(contour, true)
        window.cv.approxPolyDP(contour, approx, epsilon, true)
        
        // Check if it's a quadrilateral and has reasonable area
        if (approx.rows === 4 && area > maxArea && area > canvas.width * canvas.height * 0.1) {
          maxArea = area
          if (bestContour) bestContour.delete()
          bestContour = approx.clone()
        }
        
        approx.delete()
      }
      
      let corners = null
      if (bestContour) {
        // Extract corner points
        corners = []
        for (let i = 0; i < bestContour.rows; i++) {
          const point = bestContour.data32S
          corners.push({
            x: point[i * 2],
            y: point[i * 2 + 1]
          })
        }
        
        // Sort corners: top-left, top-right, bottom-right, bottom-left
        corners = sortCorners(corners)
        bestContour.delete()
      }
      
      // Cleanup
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      
      return corners
      
    } catch (error) {
      console.error('Error in document detection:', error)
      return null
    }
  }

  // Sort corners in clockwise order starting from top-left
  const sortCorners = (corners: any[]) => {
    if (!corners || corners.length !== 4) return corners
    
    // Find center point
    const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4
    const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4
    
    // Sort by angle from center
    return corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX)
      const angleB = Math.atan2(b.y - centerY, b.x - centerX)
      return angleA - angleB
    })
  }

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
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(detectDocument)
        return
      }

      try {
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Detect document corners
        const corners = detectDocumentCorners(canvas)
        
        // Draw overlay
        const overlayCtx = overlayCanvas.getContext('2d')
        if (!overlayCtx) return

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

          // Draw dimmed background
          overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'
          overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)

          // Clear document area (create window effect)
          overlayCtx.globalCompositeOperation = 'destination-out'
          overlayCtx.beginPath()
          overlayCtx.moveTo(corners[0].x, corners[0].y)
          for (let i = 1; i < corners.length; i++) {
            overlayCtx.lineTo(corners[i].x, corners[i].y)
          }
          overlayCtx.closePath()
          overlayCtx.fill()

          // Draw corner highlights
          overlayCtx.globalCompositeOperation = 'source-over'
          corners.forEach((corner: any, index: number) => {
            // Corner markers
            overlayCtx.fillStyle = isDocumentStable ? '#10B981' : '#3B82F6'
            overlayCtx.beginPath()
            overlayCtx.arc(corner.x, corner.y, 12, 0, 2 * Math.PI)
            overlayCtx.fill()

            // White center dot
            overlayCtx.fillStyle = '#FFFFFF'
            overlayCtx.beginPath()
            overlayCtx.arc(corner.x, corner.y, 4, 0, 2 * Math.PI)
            overlayCtx.fill()

            // Corner lines
            overlayCtx.strokeStyle = isDocumentStable ? '#10B981' : '#3B82F6'
            overlayCtx.lineWidth = 4
            overlayCtx.lineCap = 'round'
            overlayCtx.beginPath()
            
            const size = 40
            switch (index) {
              case 0: // top-left
                overlayCtx.moveTo(corner.x, corner.y + size)
                overlayCtx.lineTo(corner.x, corner.y)
                overlayCtx.lineTo(corner.x + size, corner.y)
                break
              case 1: // top-right  
                overlayCtx.moveTo(corner.x - size, corner.y)
                overlayCtx.lineTo(corner.x, corner.y)
                overlayCtx.lineTo(corner.x, corner.y + size)
                break
              case 2: // bottom-right
                overlayCtx.moveTo(corner.x, corner.y - size)
                overlayCtx.lineTo(corner.x, corner.y)
                overlayCtx.lineTo(corner.x - size, corner.y)
                break
              case 3: // bottom-left
                overlayCtx.moveTo(corner.x + size, corner.y)
                overlayCtx.lineTo(corner.x, corner.y)
                overlayCtx.lineTo(corner.x, corner.y - size)
                break
            }
            overlayCtx.stroke()
          })

          // Document outline
          overlayCtx.strokeStyle = isDocumentStable ? '#10B981' : '#3B82F6'
          overlayCtx.lineWidth = 3
          overlayCtx.setLineDash(isDocumentStable ? [] : [15, 10])
          overlayCtx.beginPath()
          overlayCtx.moveTo(corners[0].x, corners[0].y)
          for (let i = 1; i < corners.length; i++) {
            overlayCtx.lineTo(corners[i].x, corners[i].y)
          }
          overlayCtx.closePath()
          overlayCtx.stroke()
          overlayCtx.setLineDash([])
        } else {
          setDetectedCorners(null)
          setIsDocumentStable(false)
          stableFrameCount.current = 0
          lastCorners.current = null

          // Show guidance overlay when no document detected
          overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)

          // Draw guide frame
          const centerX = overlayCanvas.width / 2
          const centerY = overlayCanvas.height / 2
          const frameWidth = Math.min(overlayCanvas.width * 0.7, 500)
          const frameHeight = frameWidth * 0.75

          overlayCtx.strokeStyle = '#6B7280'
          overlayCtx.lineWidth = 3
          overlayCtx.setLineDash([20, 15])
          overlayCtx.strokeRect(
            centerX - frameWidth / 2,
            centerY - frameHeight / 2,
            frameWidth,
            frameHeight
          )
          overlayCtx.setLineDash([])

          // Guide text
          overlayCtx.fillStyle = '#FFFFFF'
          overlayCtx.font = 'bold 16px Arial'
          overlayCtx.textAlign = 'center'
          overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.8)'
          overlayCtx.shadowBlur = 4
          overlayCtx.fillText(
            'Position document within frame',
            centerX,
            centerY + frameHeight / 2 + 35
          )
          overlayCtx.shadowBlur = 0
        }
      } catch (error) {
        console.error('Detection error:', error)
      }

      animationFrameRef.current = requestAnimationFrame(detectDocument)
    }

    detectDocument()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isDetectionReady, hasCamera])

  // Helper function to check if corners are stable
  const areCornersStable = (corners1: any[], corners2: any[], threshold = 25) => {
    if (!corners1 || !corners2 || corners1.length !== corners2.length) return false
    
    for (let i = 0; i < corners1.length; i++) {
      const dx = Math.abs(corners1[i].x - corners2[i].x)
      const dy = Math.abs(corners1[i].y - corners2[i].y)
      if (dx > threshold || dy > threshold) return false
    }
    return true
  }

  // Perspective transform function
  const perspectiveTransform = (canvas: HTMLCanvasElement, corners: any[]) => {
    if (!window.cv || !corners || corners.length !== 4) return canvas

    try {
      const src = window.cv.imread(canvas)
      
      // Define source points (detected corners)
      const srcPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y, 
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y
      ])
      
      // Calculate target dimensions
      const width = Math.max(
        Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2)),
        Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2))
      )
      const height = Math.max(
        Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2)),
        Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2))
      )
      
      // Define destination points (rectangle)
      const dstPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
        0, 0,
        width, 0,
        width, height,
        0, height
      ])
      
      // Get perspective transform matrix
      const transformMatrix = window.cv.getPerspectiveTransform(srcPoints, dstPoints)
      
      // Apply perspective transformation
      const dst = new window.cv.Mat()
      const dsize = new window.cv.Size(width, height)
      window.cv.warpPerspective(src, dst, transformMatrix, dsize)
      
      // Create output canvas
      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = width
      outputCanvas.height = height
      window.cv.imshow(outputCanvas, dst)
      
      // Cleanup
      src.delete()
      dst.delete()
      srcPoints.delete()
      dstPoints.delete()
      transformMatrix.delete()
      
      return outputCanvas
    } catch (error) {
      console.error('Error in perspective transform:', error)
      return canvas
    }
  }

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return
    
    setIsCapturing(true)
    
    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 })
      if (imageSrc) {
        let finalImage = imageSrc
        let processedBlob: Blob

        // If we detected corners, extract and crop the document
        if (detectedCorners && window.cv) {
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

            try {
              // Use perspective transform to extract document
              const extractedCanvas = perspectiveTransform(tempCanvas, detectedCorners)
              if (extractedCanvas) {
                finalImage = extractedCanvas.toDataURL('image/jpeg', 0.95)
              }
            } catch (extractError) {
              console.error('Error extracting document:', extractError)
            }
          }
        }

        // Convert final image to blob
        const response = await fetch(finalImage)
        processedBlob = await response.blob()
        
        const image = new Image()
        image.onload = () => {
          onImageCapture({
            src: finalImage,
            blob: processedBlob,
            width: image.width,
            height: image.height
          })
        }
        image.src = finalImage
      }
    } catch (error) {
      console.error('Error capturing image:', error)
    } finally {
      setIsCapturing(false)
    }
  }, [onImageCapture, detectedCorners])

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

        {/* Status indicator */}
        {hasCamera && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <div className="flex items-center space-x-2 bg-black bg-opacity-70 px-4 py-2 rounded-full backdrop-blur-sm">
              <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                !isDetectionReady ? 'bg-yellow-500 animate-pulse' :
                detectedCorners ? (isDocumentStable ? 'bg-green-500' : 'bg-blue-500 animate-pulse') : 'bg-red-500'
              }`} />
              <span className="text-white text-sm font-medium">
                {!isDetectionReady ? 'Loading detection...' :
                 detectedCorners ? (isDocumentStable ? 'Ready to capture' : 'Hold steady...') : 'Position document'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
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
            disabled={isCapturing}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 disabled:opacity-50 transform ${
              isDocumentStable 
                ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-300 scale-110' 
                : 'bg-white hover:bg-gray-100 hover:scale-105'
            }`}
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-3 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className={`w-14 h-14 rounded-full transition-colors ${
                isDocumentStable ? 'bg-white' : 'bg-gray-800'
              }`}></div>
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