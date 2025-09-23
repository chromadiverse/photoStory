"use client"

import type React from "react"

import { useRef, useState, useCallback, useEffect } from "react"
import Webcam from "react-webcam"
import { Camera, RotateCcw, Square } from "lucide-react"

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
  id: string
  points: { x: number; y: number }[]
  center: { x: number; y: number }
  confidence: number
}
const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")

  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [detectedShapes, setDetectedShapes] = useState<DetectedShape[]>([])
  const [isDetectionActive, setIsDetectionActive] = useState(true)
  const [openCvLoaded, setOpenCvLoaded] = useState(false)

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode,
  }

  useEffect(() => {
    const loadOpenCV = () => {
      if (typeof window !== "undefined") {
        // Check if OpenCV is already loaded
        if ((window as any).cv && (window as any).cv.Mat) {
          console.log("[v0] OpenCV already loaded")
          setOpenCvLoaded(true)
          return
        }

        const script = document.createElement("script")
        script.src = "https://docs.opencv.org/4.5.0/opencv.js" // Using a more stable version
        script.async = true

        script.onload = () => {
          console.log("[v0] OpenCV script loaded, waiting for initialization...")

          // Wait for cv to be available
          const checkCV = () => {
            if ((window as any).cv) {
              const cv = (window as any).cv
              if (cv.Mat) {
                console.log("[v0] OpenCV.js loaded and ready")
                setOpenCvLoaded(true)
              } else {
                // Set up the runtime initialization callback
                cv.onRuntimeInitialized = () => {
                  console.log("[v0] OpenCV.js runtime initialized")
                  setOpenCvLoaded(true)
                }
              }
            } else {
              // Retry after a short delay
              setTimeout(checkCV, 100)
            }
          }

          checkCV()
        }

        script.onerror = (error) => {
          console.error("[v0] Failed to load OpenCV.js:", error)
          // Fallback: try without object detection
          console.log("[v0] Continuing without object detection")
        }

        document.head.appendChild(script)
      }
    }

    loadOpenCV()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const detectShapes = useCallback(() => {
    if (!openCvLoaded || !webcamRef.current || !canvasRef.current || !isDetectionActive) {
      return
    }

    try {
      const video = webcamRef.current.video
      if (!video || video.readyState !== 4) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const cv = (window as any).cv
      if (!cv || !cv.Mat) {
        console.log("[v0] OpenCV not ready, skipping detection")
        return
      }

      // Set canvas size to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const src = cv.imread(canvas)
      const gray = new cv.Mat()
      const blur = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      // Convert to grayscale and apply Gaussian blur for noise reduction
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)

      // Use adaptive threshold for better edge detection in varying lighting
      cv.adaptiveThreshold(blur, edges, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      const shapes: DetectedShape[] = []
      const minArea = canvas.width * canvas.height * 0.01 // Minimum 1% of screen
      const maxArea = canvas.width * canvas.height * 0.8 // Maximum 80% of screen

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        // Filter by area - good for elderly users to avoid tiny detections
        if (area < minArea || area > maxArea) continue

        // Approximate contour to polygon
        const approx = new cv.Mat()
        const epsilon = 0.02 * cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, epsilon, true)

        // Check if it's a rectangle or square (4 corners)
        if (approx.rows === 4) {
          const points = []
          for (let j = 0; j < 4; j++) {
            const point = approx.data32S.slice(j * 2, j * 2 + 2)
            points.push({ x: point[0], y: point[1] })
          }

          // Calculate center point
          const center = {
            x: points.reduce((sum, p) => sum + p.x, 0) / 4,
            y: points.reduce((sum, p) => sum + p.y, 0) / 4,
          }

          // Calculate confidence based on how "rectangular" the shape is
          const rect = cv.boundingRect(contour)
          const rectArea = rect.width * rect.height
          const confidence = area / rectArea

          // Only include shapes that are reasonably rectangular
          if (confidence > 0.7) {
            shapes.push({
              id: `shape-${i}`,
              points,
              center,
              confidence,
            })
          }
        }

        approx.delete()
      }

      // Clean up OpenCV matrices
      src.delete()
      gray.delete()
      blur.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()

      setDetectedShapes(shapes)
    } catch (error) {
      console.error("[v0] Error in shape detection:", error)
      setDetectedShapes([])
    }

    // Continue detection loop
    if (isDetectionActive) {
      animationRef.current = requestAnimationFrame(detectShapes)
    }
  }, [openCvLoaded, isDetectionActive])

  useEffect(() => {
    if (openCvLoaded && isDetectionActive) {
      detectShapes()
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [openCvLoaded, isDetectionActive, detectShapes])

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return

    setIsCapturing(true)

    try {
      const imageSrc = webcamRef.current.getScreenshot({ width: 1920, height: 1080 })
      if (imageSrc) {
        // Convert base64 to blob
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
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error("Error capturing image:", error)
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

  const toggleDetection = () => {
    setIsDetectionActive((prev) => !prev)
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

            {isDetectionActive && detectedShapes.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                <svg
                  className="w-full h-full"
                  viewBox={`0 0 ${webcamRef.current?.video?.videoWidth || 1920} ${webcamRef.current?.video?.videoHeight || 1080}`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  {detectedShapes.map((shape) => (
                    <g key={shape.id}>
                      {/* Green border highlighting the detected rectangle */}
                      <polygon
                        points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="4"
                        strokeDasharray="10,5"
                        className="animate-pulse"
                      />
                      {/* Center indicator */}
                      <circle cx={shape.center.x} cy={shape.center.y} r="8" fill="#22c55e" className="animate-pulse" />
                      {/* Confidence indicator for debugging */}
                      <text
                        x={shape.center.x}
                        y={shape.center.y - 20}
                        fill="#22c55e"
                        fontSize="16"
                        textAnchor="middle"
                        className="font-bold"
                      >
                        📄 {Math.round(shape.confidence * 100)}%
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-2 text-white text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${openCvLoaded ? "bg-green-500" : "bg-yellow-500"}`}></div>
                <span>{openCvLoaded ? "Detection Ready" : "Loading Detection..."}</span>
              </div>
              {isDetectionActive && openCvLoaded && (
                <div className="text-xs mt-1 text-green-400">
                  Found {detectedShapes.length} document{detectedShapes.length !== 1 ? "s" : ""}
                </div>
              )}
              {!openCvLoaded && <div className="text-xs mt-1 text-yellow-400">Manual mode available</div>}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-800">
            <Camera size={64} className="mb-4 text-gray-400" />
            <p className="text-gray-400 mb-4">Camera not available</p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
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

        {/* Document Frame Overlay - only show when detection is off */}
        {!isDetectionActive && (
          <div className="absolute inset-4 border-2 border-white opacity-30 rounded-lg pointer-events-none">
            <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-blue-500 rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-blue-500 rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-blue-500 rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-blue-500 rounded-br-lg"></div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {hasCamera && openCvLoaded && (
            <button
              onClick={toggleDetection}
              className={`p-3 rounded-full transition-colors ${
                isDetectionActive ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"
              }`}
              title={isDetectionActive ? "Turn off auto-detection" : "Turn on auto-detection"}
            >
              <Square size={24} className={isDetectionActive ? "text-white" : "text-gray-300"} />
            </button>
          )}

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
            <button onClick={toggleCamera} className="p-3 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors">
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
