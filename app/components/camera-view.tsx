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

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // Apply Gaussian blur for noise reduction
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)

      // Edge detection with more sensitive parameters
      cv.Canny(gray, edges, 50, 150)

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      let currentShape: DetectedShape | null = null
      let maxArea = 0
      const minArea = 5000 // Much lower minimum area
      const maxArea_limit = (canvas.width * canvas.height) * 0.95 // Allow larger shapes

      // Process contours to find rectangles
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        // Less strict area filtering
        if (area < minArea) continue

        // Approximate contour to polygon
        const approx = new cv.Mat()
        const epsilon = 0.02 * cv.arcLength(contour, true) // Back to original epsilon
        cv.approxPolyDP(contour, approx, epsilon, true)

        // Check if it's a quadrilateral (4 corners)
        if (approx.rows === 4 && area > maxArea) {
          const corners = []
          for (let j = 0; j < 4; j++) {
            const point = approx.data32S.slice(j * 2, j * 2 + 2)
            corners.push({ x: point[0], y: point[1] })
          }

          // Calculate tilt angle using first edge (simpler approach)
          const edge1 = {
            x: corners[1].x - corners[0].x,
            y: corners[1].y - corners[0].y,
          }
          const tiltAngle = Math.atan2(edge1.y, edge1.x) * (180 / Math.PI)

          // More lenient rectangle check
          const normalizedAngle = Math.abs(tiltAngle % 90)
          const isRectangle = normalizedAngle < 25 || normalizedAngle > 65

          currentShape = {
            corners,
            area,
            isRectangle,
            tiltAngle,
            confidence: Math.min(area / 50000, 1), // Simpler confidence calculation
          }
          maxArea = area
        }

        approx.delete()
        contour.delete()
      }

      // Apply simpler temporal smoothing
      const history = detectionHistoryRef.current
      const now = Date.now()

      if (currentShape) {
        // Add to history (keep last 5 detections for faster response)
        history.shapes.push(currentShape)
        if (history.shapes.length > 5) {
          history.shapes.shift()
        }

        // Show detection immediately but smooth alignment
        setDetectedShape(currentShape)
        
        // Simple detection strength based on consistency
        const strength = Math.min(100, (history.shapes.length / 3) * 100)
        setDetectionStrength(strength)

        // Check alignment with more tolerance
        const normalizedAngle = Math.abs(currentShape.tiltAngle % 90)
        const isCurrentlyAligned = normalizedAngle < 15 || normalizedAngle > 75

        if (isCurrentlyAligned) {
          history.alignedCount = Math.min(5, history.alignedCount + 1)
        } else {
          history.alignedCount = Math.max(0, history.alignedCount - 1)
        }

        // Faster alignment detection (3 frames instead of 8)
        const shouldBeAligned = history.alignedCount >= 3 && strength > 50
        const shouldNotBeAligned = history.alignedCount <= 1

        if (shouldBeAligned !== isAligned) {
          setIsAligned(shouldBeAligned)
        }

        // Update instructions with shorter debouncing
        if (now - history.lastInstructionChange > 1000) {
          if (strength < 40) {
            setInstructionText("Move closer to your item")
          } else if (!isCurrentlyAligned) {
            const tilt = Math.round(normalizedAngle)
            if (tilt > 20) {
              setInstructionText("Rotate your item to straighten it")
            } else {
              setInstructionText("Almost aligned! Keep adjusting...")
            }
          } else if (shouldBeAligned) {
            setInstructionText("Perfect! Tap to take your photo")
          } else {
            setInstructionText("Hold steady...")
          }
          history.lastInstructionChange = now
        }
      } else {
        // Faster recovery when no shape detected
        history.alignedCount = Math.max(0, history.alignedCount - 2)
        setDetectionStrength(Math.max(0, detectionStrength - 10))
        
        if (history.shapes.length > 0) {
          history.shapes.pop() // Remove one detection
        }
        
        if (history.shapes.length === 0) {
          setDetectedShape(null)
          setIsAligned(false)
          
          if (now - history.lastInstructionChange > 800) {
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
    } catch (error) {
      console.error("Shape detection error:", error)
    }
  }, [cvLoaded, isAligned, detectionStrength])

  // Normal speed detection loop (30 FPS) for better responsiveness
  useEffect(() => {
    if (cvLoaded && hasCamera) {
      let lastDetection = 0
      const detectLoop = (currentTime: number) => {
        if (currentTime - lastDetection >= 33) { // ~30 FPS
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

  // Crop image to detected shape
  const cropImageToShape = useCallback((imageSrc: string, shape: DetectedShape): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(imageSrc) // Fallback to original
          return
        }

        // Find bounding rectangle of the detected shape
        const xs = shape.corners.map(c => c.x)
        const ys = shape.corners.map(c => c.y)
        const minX = Math.max(0, Math.min(...xs) - 10) // Add small padding
        const maxX = Math.min(img.width, Math.max(...xs) + 10)
        const minY = Math.max(0, Math.min(...ys) - 10)
        const maxY = Math.min(img.height, Math.max(...ys) + 10)

        const cropWidth = maxX - minX
        const cropHeight = maxY - minY

        canvas.width = cropWidth
        canvas.height = cropHeight

        // Draw the cropped portion
        ctx.drawImage(
          img,
          minX, minY, cropWidth, cropHeight, // Source rectangle
          0, 0, cropWidth, cropHeight // Destination rectangle
        )

        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.src = imageSrc
    })
  }, [])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return

    setIsCapturing(true)
    setInstructionText("Taking your photo...")

    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 })
      if (imageSrc) {
        let finalImageSrc = imageSrc
        
        // If we have a detected shape, crop to it
        if (detectedShape && detectionStrength > 30) {
          setInstructionText("Cropping to detected object...")
          finalImageSrc = await cropImageToShape(imageSrc, detectedShape)
        }

        const response = await fetch(finalImageSrc)
        const blob = await response.blob()

        const image = new Image()
        image.onload = () => {
          onImageCapture({
            src: finalImageSrc,
            blob,
            width: image.width,
            height: image.height,
          })
          setInstructionText("Photo captured and cropped successfully!")
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
        image.src = finalImageSrc
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
  }, [onImageCapture, detectedShape, detectionStrength, cropImageToShape])

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

        {/* Grid overlay - removed as requested */}

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

          {/* Detected shape outline */}
          {detectedShape && detectionStrength > 30 && (
            <svg className="absolute inset-0 w-full h-full">
              {/* Green pulsing outline around detected object */}
              <polygon
                points={detectedShape.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="4"
                strokeOpacity="0.9"
                className="animate-pulse"
              />
              
              {/* Solid green outline for better visibility */}
              <polygon
                points={detectedShape.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeOpacity="1"
              />
              
              {/* Corner dots */}
              {detectedShape.corners.map((corner, index) => (
                <circle
                  key={index}
                  cx={corner.x}
                  cy={corner.y}
                  r="8"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="3"
                  className="animate-pulse"
                />
              ))}
              
              {/* Semi-transparent overlay to highlight the detected area */}
              <polygon
                points={detectedShape.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="rgba(34, 197, 94, 0.1)"
                stroke="none"
              />
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