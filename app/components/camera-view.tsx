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

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [showGrid, setShowGrid] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [cvLoaded, setCvLoaded] = useState(false)
  const [detectedShape, setDetectedShape] = useState<DetectedShape | null>(null)
  const [isAligned, setIsAligned] = useState(false)
  const [instructionText, setInstructionText] = useState("Position your document in the frame")

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
            setInstructionText("Hold your document steady in the frame")
          }
        }
        document.head.appendChild(script)
      } else if ((window as any).cv && (window as any).cv.Mat) {
        setCvLoaded(true)
        setInstructionText("Hold your document steady in the frame")
      }
    }

    loadOpenCV()
  }, [])

  // Real-time shape detection
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

      // Apply Gaussian blur
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)

      // Edge detection
      cv.Canny(gray, edges, 50, 150)

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      let bestShape: DetectedShape | null = null
      let maxArea = 0

      // Process contours to find rectangles
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        // Filter by area (minimum size)
        if (area < 10000) continue

        // Approximate contour to polygon
        const approx = new cv.Mat()
        const epsilon = 0.02 * cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, epsilon, true)

        // Check if it's a quadrilateral (4 corners)
        if (approx.rows === 4 && area > maxArea) {
          const corners = []
          for (let j = 0; j < 4; j++) {
            const point = approx.data32S.slice(j * 2, j * 2 + 2)
            corners.push({ x: point[0], y: point[1] })
          }

          // Calculate tilt angle
          const edge1 = {
            x: corners[1].x - corners[0].x,
            y: corners[1].y - corners[0].y,
          }
          const tiltAngle = Math.atan2(edge1.y, edge1.x) * (180 / Math.PI)

          // Check if it's roughly rectangular
          const isRectangle = Math.abs(tiltAngle % 90) < 15 || Math.abs(tiltAngle % 90) > 75

          bestShape = {
            corners,
            area,
            isRectangle,
            tiltAngle,
            confidence: area / (canvas.width * canvas.height), // Relative to frame size
          }
          maxArea = area
        }

        approx.delete()
        contour.delete()
      }

      setDetectedShape(bestShape)
      const aligned = bestShape ? Math.abs(bestShape.tiltAngle % 90) < 5 : false
      setIsAligned(aligned)

      if (!bestShape) {
        setInstructionText("Move closer to your document")
      } else if (!aligned) {
        const tilt = Math.round(Math.abs(bestShape.tiltAngle % 90))
        if (tilt > 10) {
          setInstructionText("Straighten your document - rotate slightly")
        } else {
          setInstructionText("Almost there! Keep adjusting...")
        }
      } else {
        setInstructionText("Perfect! Tap the green button to take photo")
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
  }, [cvLoaded])

  // Start/stop detection loop
  useEffect(() => {
    if (cvLoaded && hasCamera) {
      const detectLoop = () => {
        detectShapes()
        animationFrameRef.current = requestAnimationFrame(detectLoop)
      }
      detectLoop()
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
    setInstructionText("Taking photo...")

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
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error("Error capturing image:", error)
      setInstructionText("Error taking photo. Please try again.")
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
  }

  const onUserMediaError = () => {
    setHasCamera(false)
    setInstructionText("Camera not available. Use 'Choose Photo' instead.")
  }

  return (
    <div className="relative h-full flex flex-col bg-black">
      <div
        className={`w-full py-4 px-6 text-center text-lg font-semibold transition-colors duration-500 ${
          isAligned ? "bg-green-600 text-white" : "bg-blue-600 text-white"
        }`}
      >
        {isAligned && <CheckCircle className="inline mr-2" size={24} />}
        {instructionText}
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
            {/* Hidden canvas for OpenCV processing */}
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

        {showGrid && hasCamera && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="33.333%" height="33.333%" patternUnits="objectBoundingBox">
                  <path
                    d="M 33.333 0 L 33.333 33.333 M 0 33.333 L 33.333 33.333"
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        )}

        <div className="absolute inset-8 pointer-events-none">
          {/* Target frame */}
          <div
            className={`w-full h-full border-4 rounded-2xl transition-all duration-500 ${
              isAligned ? "border-green-400 shadow-lg shadow-green-400/50" : "border-white/50"
            }`}
          >
            <div
              className={`absolute -top-2 -left-2 w-12 h-12 border-l-6 border-t-6 rounded-tl-2xl transition-all duration-500 ${
                isAligned ? "border-green-400 shadow-lg shadow-green-400/50" : "border-blue-400"
              }`}
            ></div>
            <div
              className={`absolute -top-2 -right-2 w-12 h-12 border-r-6 border-t-6 rounded-tr-2xl transition-all duration-500 ${
                isAligned ? "border-green-400 shadow-lg shadow-green-400/50" : "border-blue-400"
              }`}
            ></div>
            <div
              className={`absolute -bottom-2 -left-2 w-12 h-12 border-l-6 border-b-6 rounded-bl-2xl transition-all duration-500 ${
                isAligned ? "border-green-400 shadow-lg shadow-green-400/50" : "border-blue-400"
              }`}
            ></div>
            <div
              className={`absolute -bottom-2 -right-2 w-12 h-12 border-r-6 border-b-6 rounded-br-2xl transition-all duration-500 ${
                isAligned ? "border-green-400 shadow-lg shadow-green-400/50" : "border-blue-400"
              }`}
            ></div>
          </div>

          {/* Detected shape overlay */}
          {detectedShape && (
            <svg className="absolute inset-0 w-full h-full">
              <polygon
                points={detectedShape.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke={detectedShape.isRectangle ? "#10b981" : "#f59e0b"}
                strokeWidth="4"
                strokeDasharray={detectedShape.isRectangle ? "0" : "15,10"}
              />
              {detectedShape.corners.map((corner, index) => (
                <circle
                  key={index}
                  cx={corner.x}
                  cy={corner.y}
                  r="8"
                  fill={detectedShape.isRectangle ? "#10b981" : "#f59e0b"}
                  stroke="white"
                  strokeWidth="2"
                />
              ))}
            </svg>
          )}
        </div>

        {detectedShape && !isAligned && (
          <div className="absolute top-1/2 right-6 transform -translate-y-1/2">
            <div className="bg-black/80 rounded-2xl p-4 border-2 border-orange-400">
              <div className="text-white text-lg font-semibold mb-3 text-center">Straighten</div>
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 border-4 border-white/50 rounded-xl"></div>
                <div
                  className="absolute inset-2 border-4 border-orange-400 rounded-xl transition-transform duration-300"
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
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all disabled:opacity-50 border-4 ${
                isAligned
                  ? "bg-green-500 hover:bg-green-600 border-green-300 shadow-green-500/50"
                  : "bg-white hover:bg-gray-100 border-gray-300"
              }`}
            >
              {isCapturing ? (
                <div className="w-8 h-8 border-4 border-gray-400 rounded-full animate-spin border-t-gray-600"></div>
              ) : (
                <div className={`w-14 h-14 rounded-full ${isAligned ? "bg-white" : "bg-gray-800"}`}></div>
              )}
            </button>
            <span className="text-white text-sm font-medium mt-2">{hasCamera ? "Take Photo" : "Choose Photo"}</span>
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
