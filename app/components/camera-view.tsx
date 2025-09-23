"use client"

import type React from "react"

import { useRef, useState, useCallback, useEffect } from "react"
import Webcam from "react-webcam"
import { Camera, RotateCcw, LayoutGrid, CheckCircle } from "lucide-react"

interface CapturedImage {
  src: string
  blob: Blob
  width: number
  height: number
}

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

interface DetectedShape {
  corners: Array<{ x: number; y: number }>
  area: number
  isRectangle: boolean
  tiltAngle: number
  confidence: number
}

interface DetectionHistory {
  shapes: DetectedShape[]
  alignedCount: number
  stableCount: number
  lastInstructionChange: number
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const detectionHistoryRef = useRef<DetectionHistory>({
    shapes: [],
    alignedCount: 0,
    stableCount: 0,
    lastInstructionChange: 0
  })

  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [showGrid, setShowGrid] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [cvLoaded, setCvLoaded] = useState(false)
  const [detectedShape, setDetectedShape] = useState<DetectedShape | null>(null)
  const [isAligned, setIsAligned] = useState(false)
  const [instructionText, setInstructionText] = useState("Position your item in the frame")
  const [detectionStrength, setDetectionStrength] = useState(0) // 0-100 strength indicator

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode,
  }

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = () => {
      if (typeof window !== "undefined" && !(window as any).cv) {
        const script = document.createElement("script")
        script.src = "https://docs.opencv.org/4.8.0/opencv.js"
        script.async = true
        script.onload = () => {
          const cv = (window as any).cv
          cv.onRuntimeInitialized = () => {
            console.log("OpenCV.js loaded successfully")
            setCvLoaded(true)
            setInstructionText("Hold your item steady in the frame")
          }
        }
        document.head.appendChild(script)
      } else if ((window as any).cv && (window as any).cv.Mat) {
        setCvLoaded(true)
        setInstructionText("Hold your item steady in the frame")
      }
    }

    loadOpenCV()
  }, [])

  // Stabilized shape detection with history
  const detectShapes = useCallback(() => {
    if (!cvLoaded || !webcamRef.current || !canvasRef.current) return

    const video = webcamRef.current.video
    const canvas = canvasRef.current

    if (!video || video.readyState !== 4) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    try {
      const cv = (window as any).cv
      const src = cv.imread(canvas)
      const gray = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      // Convert to grayscale with enhanced preprocessing
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // Enhanced preprocessing for stability
      cv.GaussianBlur(gray, gray, new cv.Size(7, 7), 0)
      
      // Adaptive threshold for better edge detection
      const thresh = new cv.Mat()
      cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)
      
      // More conservative edge detection
      cv.Canny(thresh, edges, 30, 100)
      
      // Morphological operations to clean up edges
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      let currentShape: DetectedShape | null = null
      let maxArea = 0
      const minArea = (canvas.width * canvas.height) * 0.05 // At least 5% of frame
      const maxArea_limit = (canvas.width * canvas.height) * 0.8 // At most 80% of frame

      // Process contours to find rectangles
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        // More strict area filtering
        if (area < minArea || area > maxArea_limit) continue

        // Approximate contour to polygon with adjusted epsilon
        const approx = new cv.Mat()
        const epsilon = 0.015 * cv.arcLength(contour, true) // More conservative approximation
        cv.approxPolyDP(contour, approx, epsilon, true)

        // Check if it's a quadrilateral (4 corners)
        if (approx.rows === 4 && area > maxArea) {
          const corners = []
          for (let j = 0; j < 4; j++) {
            const point = approx.data32S.slice(j * 2, j * 2 + 2)
            corners.push({ x: point[0], y: point[1] })
          }

          // Calculate aspect ratio to filter out very elongated shapes
          const bounds = cv.boundingRect(contour)
          const aspectRatio = bounds.width / bounds.height
          
          // Skip very elongated rectangles (likely not target objects)
          if (aspectRatio < 0.3 || aspectRatio > 3.5) continue

          // Calculate tilt angle using the longest edge
          const edges_calc = [
            { dx: corners[1].x - corners[0].x, dy: corners[1].y - corners[0].y },
            { dx: corners[2].x - corners[1].x, dy: corners[2].y - corners[1].y },
            { dx: corners[3].x - corners[2].x, dy: corners[3].y - corners[2].y },
            { dx: corners[0].x - corners[3].x, dy: corners[0].y - corners[3].y }
          ]
          
          // Find the longest edge
          const edgeLengths = edges_calc.map(e => Math.sqrt(e.dx * e.dx + e.dy * e.dy))
          const longestEdgeIndex = edgeLengths.indexOf(Math.max(...edgeLengths))
          const longestEdge = edges_calc[longestEdgeIndex]
          
          const tiltAngle = Math.atan2(longestEdge.dy, longestEdge.dx) * (180 / Math.PI)

          // Check if it's roughly rectangular with more tolerance
          const normalizedAngle = Math.abs(tiltAngle % 90)
          const isRectangle = normalizedAngle < 20 || normalizedAngle > 70

          currentShape = {
            corners,
            area,
            isRectangle,
            tiltAngle,
            confidence: Math.min(area / (canvas.width * canvas.height * 0.3), 1), // Normalize confidence
          }
          maxArea = area
        }

        approx.delete()
        contour.delete()
      }

      // Apply temporal smoothing and stability checks
      const history = detectionHistoryRef.current
      const now = Date.now()

      if (currentShape) {
        // Add to history (keep last 10 detections)
        history.shapes.push(currentShape)
        if (history.shapes.length > 10) {
          history.shapes.shift()
        }

        // Calculate stability metrics
        if (history.shapes.length >= 5) {
          const recentShapes = history.shapes.slice(-5)
          
          // Check angle stability
          const angles = recentShapes.map(s => s.tiltAngle)
          const avgAngle = angles.reduce((sum, a) => sum + a, 0) / angles.length
          const angleVariance = angles.reduce((sum, a) => sum + Math.pow(a - avgAngle, 2), 0) / angles.length
          
          // Check area stability
          const areas = recentShapes.map(s => s.area)
          const avgArea = areas.reduce((sum, a) => sum + a, 0) / areas.length
          const areaVariance = areas.reduce((sum, a) => sum + Math.pow(a - avgArea, 2), 0) / areas.length
          
          // Create stabilized shape with averaged values
          const stabilizedShape: DetectedShape = {
            corners: currentShape.corners, // Use current corners for display
            area: avgArea,
            isRectangle: currentShape.isRectangle,
            tiltAngle: avgAngle,
            confidence: currentShape.confidence
          }

          // Check if shape is stable (low variance in angle and area)
          const isStable = angleVariance < 50 && areaVariance < (avgArea * 0.1)
          const normalizedAngle = Math.abs(avgAngle % 90)
          const isCurrentlyAligned = normalizedAngle < 8 || normalizedAngle > 82

          if (isStable) {
            history.stableCount++
            setDetectedShape(stabilizedShape)
            
            // Calculate detection strength (0-100)
            const strength = Math.min(100, (history.stableCount / 3) * 100)
            setDetectionStrength(strength)

            if (isCurrentlyAligned) {
              history.alignedCount++
            } else {
              history.alignedCount = Math.max(0, history.alignedCount - 1)
            }

            // Only change alignment state after consistent readings
            const shouldBeAligned = history.alignedCount >= 8 && strength > 70
            const shouldNotBeAligned = history.alignedCount <= 2 || strength < 30

            if (shouldBeAligned && !isAligned) {
              setIsAligned(true)
            } else if (shouldNotBeAligned && isAligned) {
              setIsAligned(false)
            }

            // Update instructions with debouncing (minimum 2 seconds between changes)
            if (now - history.lastInstructionChange > 2000) {
              if (strength < 30) {
                setInstructionText("Move closer to your item")
              } else if (!isCurrentlyAligned && strength > 30) {
                const tilt = Math.round(Math.abs(avgAngle % 90))
                if (tilt > 15) {
                  setInstructionText("Rotate your item to straighten it")
                } else {
                  setInstructionText("Almost aligned! Keep adjusting...")
                }
              } else if (shouldBeAligned) {
                setInstructionText("Perfect! Tap to take your photo")
              } else if (strength > 50) {
                setInstructionText("Hold steady... almost there")
              }
              history.lastInstructionChange = now
            }
          } else {
            // Reset stability if detection becomes unstable
            history.stableCount = Math.max(0, history.stableCount - 1)
            history.alignedCount = Math.max(0, history.alignedCount - 1)
          }
        }
      } else {
        // No shape detected - gradually reduce confidence
        history.alignedCount = Math.max(0, history.alignedCount - 1)
        history.stableCount = Math.max(0, history.stableCount - 1)
        setDetectionStrength(Math.max(0, detectionStrength - 5))
        
        if (history.stableCount === 0) {
          setDetectedShape(null)
          setIsAligned(false)
          
          if (now - history.lastInstructionChange > 1500) {
            setInstructionText("Position your item in the frame")
            history.lastInstructionChange = now
          }
        }
      }

      // Cleanup
      src.delete()
      gray.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      thresh.delete()
      kernel.delete()
    } catch (error) {
      console.error("Shape detection error:", error)
    }
  }, [cvLoaded, isAligned, detectionStrength])

  // Slower detection loop for stability (15 FPS instead of 60)
  useEffect(() => {
    if (cvLoaded && hasCamera) {
      let lastDetection = 0
      const detectLoop = (currentTime: number) => {
        if (currentTime - lastDetection >= 67) { // ~15 FPS
          detectShapes()
          lastDetection = currentTime
        }
        animationFrameRef.current = requestAnimationFrame(detectLoop)
      }
      animationFrameRef.current = requestAnimationFrame(detectLoop)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [cvLoaded, hasCamera, detectShapes])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return

    setIsCapturing(true)
    setInstructionText("Taking your photo...")

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
            height: image.height,
          })
          setInstructionText("Photo captured successfully!")
          setTimeout(() => {
            setInstructionText("Position your item in the frame")
            detectionHistoryRef.current = {
              shapes: [],
              alignedCount: 0,
              stableCount: 0,
              lastInstructionChange: Date.now()
            }
          }, 2000)
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error("Error capturing image:", error)
      setInstructionText("Error taking photo. Please try again.")
      setTimeout(() => {
        setInstructionText("Position your item in the frame")
      }, 2000)
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
            height: image.height,
          })
        }
        image.src = result
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"))
    // Reset detection history when switching cameras
    detectionHistoryRef.current = {
      shapes: [],
      alignedCount: 0,
      stableCount: 0,
      lastInstructionChange: Date.now()
    }
  }

  const onUserMediaError = () => {
    setHasCamera(false)
    setInstructionText("Camera not available. Use 'Choose Photo' instead.")
  }

  return (
    <div className="relative h-full flex flex-col bg-black">
      {/* Status Header */}
      <div
        className={`w-full py-4 px-6 text-center text-lg font-semibold transition-all duration-1000 ${
          isAligned ? "bg-green-600 text-white" : detectionStrength > 50 ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
        }`}
      >
        <div className="flex items-center justify-center gap-3">
          {isAligned && <CheckCircle size={24} />}
          <span>{instructionText}</span>
        </div>
        
        {/* Detection Strength Indicator */}
        {detectionStrength > 0 && (
          <div className="mt-2 max-w-xs mx-auto">
            <div className="w-full bg-gray-300 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  isAligned ? "bg-green-400" : detectionStrength > 70 ? "bg-blue-400" : "bg-orange-400"
                }`}
                style={{ width: `${detectionStrength}%` }}
              ></div>
            </div>
            <div className="text-xs mt-1 opacity-75">
              Detection: {Math.round(detectionStrength)}%
            </div>
          </div>
        )}
      </div>

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
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800">
            <Camera size={80} className="mb-6 text-gray-400" />
            <p className="text-gray-300 mb-6 text-xl text-center px-4">Camera not available</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-8 py-4 bg-blue-600 text-white text-xl rounded-xl hover:bg-blue-700 transition-colors font-semibold"
            >
              Choose Photo from Gallery
            </button>
          </div>
        )}

        {/* Grid overlay */}
        {showGrid && hasCamera && (
          <div className="absolute inset-0 pointer-events-none opacity-60">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="33.333%" height="33.333%" patternUnits="objectBoundingBox">
                  <path
                    d="M 33.333 0 L 33.333 33.333 M 0 33.333 L 33.333 33.333"
                    fill="none"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        )}

        {/* Target frame with corners */}
        <div className="absolute inset-8 pointer-events-none">
          <div
            className={`w-full h-full border-4 rounded-2xl transition-all duration-1000 ${
              isAligned 
                ? "border-green-400 shadow-lg shadow-green-400/50" 
                : detectionStrength > 50 
                  ? "border-blue-400 shadow-md shadow-blue-400/30" 
                  : "border-white/40"
            }`}
          >
            {/* Corner markers */}
            {[
              { position: "-top-2 -left-2", corners: "border-l-6 border-t-6 rounded-tl-2xl" },
              { position: "-top-2 -right-2", corners: "border-r-6 border-t-6 rounded-tr-2xl" },
              { position: "-bottom-2 -left-2", corners: "border-l-6 border-b-6 rounded-bl-2xl" },
              { position: "-bottom-2 -right-2", corners: "border-r-6 border-b-6 rounded-br-2xl" }
            ].map((corner, index) => (
              <div
                key={index}
                className={`absolute ${corner.position} w-12 h-12 ${corner.corners} transition-all duration-1000 ${
                  isAligned 
                    ? "border-green-400 shadow-lg shadow-green-400/50" 
                    : detectionStrength > 50 
                      ? "border-blue-400 shadow-md shadow-blue-400/30" 
                      : "border-white/50"
                }`}
              />
            ))}
          </div>

          {/* Detected shape overlay */}
          {detectedShape && detectionStrength > 30 && (
            <svg className="absolute inset-0 w-full h-full">
              <polygon
                points={detectedShape.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke={isAligned ? "#10b981" : "#3b82f6"}
                strokeWidth="3"
                strokeOpacity="0.8"
                strokeDasharray={isAligned ? "0" : "10,5"}
                className="transition-all duration-500"
              />
              {detectedShape.corners.map((corner, index) => (
                <circle
                  key={index}
                  cx={corner.x}
                  cy={corner.y}
                  r="6"
                  fill={isAligned ? "#10b981" : "#3b82f6"}
                  stroke="white"
                  strokeWidth="2"
                  className="transition-all duration-500"
                />
              ))}
            </svg>
          )}
        </div>

        {/* Tilt indicator */}
        {detectedShape && !isAligned && detectionStrength > 50 && (
          <div className="absolute top-1/2 right-6 transform -translate-y-1/2">
            <div className="bg-black/90 rounded-2xl p-4 border-2 border-orange-400">
              <div className="text-white text-base font-semibold mb-3 text-center">Straighten</div>
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-3 border-white/50 rounded-lg"></div>
                <div
                  className="absolute inset-2 border-3 border-orange-400 rounded-lg transition-transform duration-700"
                  style={{ transform: `rotate(${detectedShape.tiltAngle}deg)` }}
                ></div>
              </div>
              <div className="text-white text-sm mt-2 text-center font-medium">
                {Math.round(Math.abs(detectedShape.tiltAngle % 90))}° off
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black p-6 border-t-2 border-gray-800">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Grid Toggle */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-4 rounded-2xl transition-colors mb-2 ${showGrid ? "bg-blue-600" : "bg-gray-600"}`}
            >
              <LayoutGrid size={28} className="text-white" />
            </button>
            <span className="text-white text-sm font-medium">Grid</span>
          </div>

          {/* Capture Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={hasCamera ? handleCapture : () => fileInputRef.current?.click()}
              disabled={isCapturing}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 disabled:opacity-50 border-4 ${
                isAligned
                  ? "bg-green-500 hover:bg-green-600 border-green-300 shadow-green-500/50 scale-105"
                  : detectionStrength > 50
                    ? "bg-blue-500 hover:bg-blue-600 border-blue-300 shadow-blue-500/40"
                    : "bg-white hover:bg-gray-100 border-gray-300"
              }`}
            >
              {isCapturing ? (
                <div className="w-8 h-8 border-4 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
              ) : (
                <div className={`w-14 h-14 rounded-full transition-all duration-500 ${
                  isAligned ? "bg-white" : detectionStrength > 50 ? "bg-white" : "bg-gray-800"
                }`}></div>
              )}
            </button>
            <span className="text-white text-sm font-medium mt-2">
              {hasCamera ? "Take Photo" : "Choose Photo"}
            </span>
          </div>

          {/* Camera Switch */}
          {hasCamera && (
            <div className="flex flex-col items-center">
              <button
                onClick={toggleCamera}
                className="p-4 rounded-2xl bg-gray-600 hover:bg-gray-500 transition-colors mb-2"
              >
                <RotateCcw size={28} className="text-white" />
              </button>
              <span className="text-white text-sm font-medium">Flip</span>
            </div>
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
    </div>
  )
}

export default CameraView