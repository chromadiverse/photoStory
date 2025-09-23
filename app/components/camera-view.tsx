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

  // Advanced shape detection function
  const detectAllRectangularShapes = (canvas: HTMLCanvasElement): DetectedShape[] => {
    if (!window.cv || !canvas) return []

    try {
      const src = window.cv.imread(canvas)
      const gray = new window.cv.Mat()
      const blurred = new window.cv.Mat()
      const edges = new window.cv.Mat()
      
      // Convert to grayscale
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)
      
      // Apply multiple blur techniques for better edge detection
      window.cv.GaussianBlur(gray, blurred, new window.cv.Size(3, 3), 0)
      
      // Try multiple edge detection thresholds to catch different contrasts
      const edgeResults = []
      const thresholds = [
        [30, 100],   // Low threshold - for subtle edges
        [50, 150],   // Medium threshold
        [75, 200],   // High threshold - for strong edges
        [100, 255]   // Very high threshold
      ]
      
      for (const [low, high] of thresholds) {
        const tempEdges = new window.cv.Mat()
        window.cv.Canny(blurred, tempEdges, low, high)
        edgeResults.push(tempEdges)
      }
      
      // Combine all edge results
      let combinedEdges = edgeResults[0].clone()
      for (let i = 1; i < edgeResults.length; i++) {
        window.cv.bitwise_or(combinedEdges, edgeResults[i], combinedEdges)
      }
      
      // Morphological operations to improve edge connectivity
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(3, 3))
      window.cv.morphologyEx(combinedEdges, edges, window.cv.MORPH_CLOSE, kernel)
      
      // Find contours
      const contours = new window.cv.MatVector()
      const hierarchy = new window.cv.Mat()
      window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE)
      
      const detectedShapes: DetectedShape[] = []
      const minArea = canvas.width * canvas.height * 0.05 // Minimum 5% of screen
      const maxArea = canvas.width * canvas.height * 0.95 // Maximum 95% of screen
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = window.cv.contourArea(contour)
        
        // Filter by area
        if (area < minArea || area > maxArea) continue
        
        // Test multiple epsilon values for approximation
        const epsilons = [0.01, 0.02, 0.03, 0.04, 0.05]
        
        for (const epsilonFactor of epsilons) {
          const approx = new window.cv.Mat()
          const epsilon = epsilonFactor * window.cv.arcLength(contour, true)
          window.cv.approxPolyDP(contour, approx, epsilon, true)
          
          // Check if it's a quadrilateral
          if (approx.rows === 4) {
            const corners: Point[] = []
            for (let j = 0; j < 4; j++) {
              corners.push({
                x: approx.data32S[j * 2],
                y: approx.data32S[j * 2 + 1]
              })
            }
            
            // Additional validation
            if (isValidRectangle(corners, canvas.width, canvas.height)) {
              const sortedCorners = sortCorners(corners)
              detectedShapes.push({
                corners: sortedCorners,
                area: area,
                perimeter: window.cv.arcLength(contour, true),
                aspectRatio: calculateAspectRatio(sortedCorners),
                confidence: calculateShapeConfidence(sortedCorners, area, canvas.width, canvas.height)
              })
              break // Found valid quad with this epsilon, no need to try others
            }
          }
          approx.delete()
        }
      }
      
      // Cleanup
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      combinedEdges.delete()
      edgeResults.forEach(e => e.delete())
      contours.delete()
      hierarchy.delete()
      kernel.delete()
      
      // Sort by confidence and return top candidates
      return detectedShapes
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5) // Keep top 5 candidates
      
    } catch (error) {
      console.error('Error in shape detection:', error)
      return []
    }
  }

  // Validate if corners form a reasonable rectangle
  const isValidRectangle = (corners: Point[], canvasWidth: number, canvasHeight: number): boolean => {
    if (corners.length !== 4) return false
    
    // Check if all corners are within canvas bounds
    for (const corner of corners) {
      if (corner.x < 0 || corner.x > canvasWidth || corner.y < 0 || corner.y > canvasHeight) {
        return false
      }
    }
    
    // Calculate side lengths
    const sides: number[] = []
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4
      const length = Math.sqrt(
        Math.pow(corners[next].x - corners[i].x, 2) + 
        Math.pow(corners[next].y - corners[i].y, 2)
      )
      sides.push(length)
    }
    
    // Check if opposite sides are similar (rectangle property)
    const tolerance = 0.3 // 30% tolerance
    const side1Ratio = Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2])
    const side2Ratio = Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3])
    
    return side1Ratio < tolerance && side2Ratio < tolerance
  }

  // Calculate aspect ratio
  const calculateAspectRatio = (corners: Point[]): number => {
    const width = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2))
    const height = Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2))
    return width / height
  }

  // Calculate confidence score
  const calculateShapeConfidence = (corners: Point[], area: number, canvasWidth: number, canvasHeight: number): number => {
    let confidence = 0
    
    // Area score (larger shapes get higher score, but not too large)
    const areaRatio = area / (canvasWidth * canvasHeight)
    if (areaRatio > 0.1 && areaRatio < 0.8) {
      confidence += 30
    }
    
    // Aspect ratio score (common photo/poster ratios)
    const aspectRatio = calculateAspectRatio(corners)
    const commonRatios = [1, 1.33, 1.5, 1.6, 1.77, 0.75, 0.67] // 1:1, 4:3, 3:2, 16:10, 16:9, etc.
    const closestRatio = commonRatios.reduce((prev, curr) => 
      Math.abs(curr - aspectRatio) < Math.abs(prev - aspectRatio) ? curr : prev
    )
    const ratioError = Math.abs(aspectRatio - closestRatio) / closestRatio
    if (ratioError < 0.2) confidence += 25
    
    // Position score (centered shapes get bonus)
    const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / 4
    const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / 4
    const distanceFromCenter = Math.sqrt(
      Math.pow(centerX - canvasWidth / 2, 2) + Math.pow(centerY - canvasHeight / 2, 2)
    )
    const maxDistance = Math.sqrt(Math.pow(canvasWidth / 2, 2) + Math.pow(canvasHeight / 2, 2))
    confidence += (1 - distanceFromCenter / maxDistance) * 20
    
    // Regularity score (how rectangular it looks)
    const angles = calculateCornerAngles(corners)
    const angleScore = angles.filter(angle => Math.abs(angle - 90) < 15).length * 6.25 // 25 points for 4 right angles
    confidence += angleScore
    
    return Math.min(confidence, 100)
  }

  // Calculate corner angles
  const calculateCornerAngles = (corners: Point[]): number[] => {
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
      
      const angle = Math.acos(dot / (mag1 * mag2)) * 180 / Math.PI
      angles.push(angle)
    }
    return angles
  }

  // Sort corners in clockwise order starting from top-left
  const sortCorners = (corners: Point[]): Point[] => {
    if (!corners || corners.length !== 4) return corners
    
    // Find center point
    const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / 4
    const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / 4
    
    // Sort by angle from center, starting from top-left
    const sorted = corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX)
      const angleB = Math.atan2(b.y - centerY, b.x - centerX)
      return angleA - angleB
    })
    
    // Ensure we start from top-left
    const topLeft = sorted.reduce((min, corner) => 
      (corner.x + corner.y < min.x + min.y) ? corner : min
    )
    const startIndex = sorted.indexOf(topLeft)
    return [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)]
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
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Detect all rectangular shapes
        const shapes = detectAllRectangularShapes(canvas)
        setDetectedShapes(shapes)
        
        // Select best shape
        const currentBest = shapes.length > 0 ? shapes[0] : null
        setBestShape(currentBest)
        
        // Check stability
        if (currentBest && lastBestShape.current && areShapesSimilar(currentBest, lastBestShape.current)) {
          stableFrameCount.current++
          if (stableFrameCount.current > 10) { // ~0.33 seconds at 30fps
            setIsShapeStable(true)
          }
        } else {
          stableFrameCount.current = 0
          setIsShapeStable(false)
        }
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
  }, [isDetectionReady, hasCamera])

  // Check if two shapes are similar (for stability)
  const areShapesSimilar = (shape1: DetectedShape | null, shape2: DetectedShape | null, threshold = 30): boolean => {
    if (!shape1 || !shape2) return false
    
    for (let i = 0; i < 4; i++) {
      const dx = Math.abs(shape1.corners[i].x - shape2.corners[i].x)
      const dy = Math.abs(shape1.corners[i].y - shape2.corners[i].y)
      if (dx > threshold || dy > threshold) return false
    }
    return true
  }

  // Draw detection overlay
  const drawOverlay = (overlayCanvas: HTMLCanvasElement, shapes: DetectedShape[], bestShape: DetectedShape | null) => {
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) return

    overlayCanvas.width = canvasRef.current?.width || 0
    overlayCanvas.height = canvasRef.current?.height || 0
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    if (shapes.length === 0) {
      // Show scanning indicator
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      
      overlayCtx.fillStyle = '#FFFFFF'
      overlayCtx.font = 'bold 18px Arial'
      overlayCtx.textAlign = 'center'
      overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.8)'
      overlayCtx.shadowBlur = 4
      overlayCtx.fillText(
        'Scanning for rectangular shapes...',
        overlayCanvas.width / 2,
        overlayCanvas.height / 2
      )
      overlayCtx.shadowBlur = 0
      return
    }

    // Draw all detected shapes with different styles
    shapes.forEach((shape, index) => {
      const isBest = index === 0
      const corners = shape.corners
      
      if (isBest) {
        // Highlight the best shape
        const isStable = isShapeStable
        
        // Draw semi-transparent overlay everywhere except the detected shape
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        
        // Cut out the detected shape area
        overlayCtx.globalCompositeOperation = 'destination-out'
        overlayCtx.beginPath()
        overlayCtx.moveTo(corners[0].x, corners[0].y)
        corners.slice(1).forEach(corner => overlayCtx.lineTo(corner.x, corner.y))
        overlayCtx.closePath()
        overlayCtx.fill()
        
        // Draw border and corners
        overlayCtx.globalCompositeOperation = 'source-over'
        
        // Main border
        overlayCtx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
        overlayCtx.lineWidth = 4
        overlayCtx.setLineDash(isStable ? [] : [20, 10])
        overlayCtx.beginPath()
        overlayCtx.moveTo(corners[0].x, corners[0].y)
        corners.slice(1).forEach(corner => overlayCtx.lineTo(corner.x, corner.y))
        overlayCtx.closePath()
        overlayCtx.stroke()
        overlayCtx.setLineDash([])
        
        // Corner markers
        corners.forEach((corner, cornerIndex) => {
          overlayCtx.fillStyle = isStable ? '#10B981' : '#3B82F6'
          overlayCtx.beginPath()
          overlayCtx.arc(corner.x, corner.y, 15, 0, 2 * Math.PI)
          overlayCtx.fill()
          
          overlayCtx.fillStyle = '#FFFFFF'
          overlayCtx.beginPath()
          overlayCtx.arc(corner.x, corner.y, 6, 0, 2 * Math.PI)
          overlayCtx.fill()
          
          // Corner lines
          overlayCtx.strokeStyle = isStable ? '#10B981' : '#3B82F6'
          overlayCtx.lineWidth = 5
          overlayCtx.lineCap = 'round'
          
          const size = 50
          overlayCtx.beginPath()
          switch (cornerIndex) {
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
        
        // Confidence and info
        const centerX = corners.reduce((sum: number, c: Point) => sum + c.x, 0) / 4
        const centerY = corners.reduce((sum: number, c: Point) => sum + c.y, 0) / 4
        
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        overlayCtx.fillRect(centerX - 80, centerY - 25, 160, 50)
        
        overlayCtx.fillStyle = '#FFFFFF'
        overlayCtx.font = 'bold 14px Arial'
        overlayCtx.textAlign = 'center'
        overlayCtx.fillText(
          `${Math.round(shape.confidence)}% confidence`,
          centerX,
          centerY - 5
        )
        overlayCtx.fillText(
          isStable ? 'READY!' : 'Hold steady...',
          centerX,
          centerY + 10
        )
        
      } else {
        // Draw other detected shapes more subtly
        overlayCtx.strokeStyle = '#FFFFFF'
        overlayCtx.lineWidth = 2
        overlayCtx.setLineDash([10, 10])
        overlayCtx.beginPath()
        overlayCtx.moveTo(corners[0].x, corners[0].y)
        corners.slice(1).forEach(corner => overlayCtx.lineTo(corner.x, corner.y))
        overlayCtx.closePath()
        overlayCtx.stroke()
        overlayCtx.setLineDash([])
      }
    })
  }

  // Perspective transform function
  const perspectiveTransform = (canvas: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement | null => {
    if (!window.cv || !corners || corners.length !== 4) return null

    try {
      const src = window.cv.imread(canvas)
      
      const srcPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y, 
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y
      ])
      
      const width = Math.max(
        Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2)),
        Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2))
      )
      const height = Math.max(
        Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2)),
        Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2))
      )
      
      const dstPoints = window.cv.matFromArray(4, 1, window.cv.CV_32FC2, [
        0, 0,
        width, 0,
        width, height,
        0, height
      ])
      
      const transformMatrix = window.cv.getPerspectiveTransform(srcPoints, dstPoints)
      const dst = new window.cv.Mat()
      const dsize = new window.cv.Size(width, height)
      window.cv.warpPerspective(src, dst, transformMatrix, dsize)
      
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
      return null
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

        // If we detected a shape, extract and crop it
        if (bestShape && window.cv) {
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
              const extractedCanvas = perspectiveTransform(tempCanvas, bestShape.corners)
              if (extractedCanvas) {
                finalImage = extractedCanvas.toDataURL('image/jpeg', 0.95)
              }
            } catch (extractError) {
              console.error('Error extracting shape:', extractError)
            }
          }
        }

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
  }, [onImageCapture, bestShape])

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

        {/* Status indicator */}
        {hasCamera && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <div className="flex items-center space-x-2 bg-black bg-opacity-70 px-4 py-2 rounded-full backdrop-blur-sm">
              <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                !isDetectionReady ? 'bg-yellow-500 animate-pulse' :
                bestShape ? (isShapeStable ? 'bg-green-500' : 'bg-blue-500 animate-pulse') : 'bg-red-500'
              }`} />
              <span className="text-white text-sm font-medium">
                {!isDetectionReady ? 'Loading detection...' :
                 bestShape ? (isShapeStable ? 'Ready to capture!' : 'Shape detected - hold steady') : 'Scanning for shapes...'}
              </span>
            </div>
            
            {/* Shape count indicator */}
            {detectedShapes.length > 0 && (
              <div className="bg-black bg-opacity-70 px-3 py-1 rounded-full backdrop-blur-sm">
                <span className="text-white text-sm">
                  {detectedShapes.length} shape{detectedShapes.length > 1 ? 's' : ''} found
                </span>
              </div>
            )}
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
              isShapeStable && bestShape
                ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-300 scale-110 animate-pulse' 
                : bestShape
                ? 'bg-blue-500 hover:bg-blue-400 ring-2 ring-blue-300 scale-105'
                : 'bg-white hover:bg-gray-100 hover:scale-105'
            }`}
          >
            {isCapturing ? (
              <div className="w-8 h-8 border-3 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
            ) : (
              <div className={`w-14 h-14 rounded-full transition-colors ${
                isShapeStable && bestShape ? 'bg-white' : 
                bestShape ? 'bg-white' : 'bg-gray-800'
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
        
        {/* Shape info */}
        {bestShape && (
          <div className="mt-4 text-center">
            <div className="bg-gray-800 rounded-lg p-3 inline-block">
              <p className="text-white text-sm">
                <span className="text-gray-400">Confidence:</span> {Math.round(bestShape.confidence)}% | 
                <span className="text-gray-400"> Aspect:</span> {bestShape.aspectRatio.toFixed(2)}:1 |
                <span className="text-gray-400"> Area:</span> {Math.round(bestShape.area / 1000)}k px
              </p>
            </div>
          </div>
        )}
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