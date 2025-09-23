"use client"

import type React from "react"

import { useRef, useState, useCallback, useEffect } from "react"
import Webcam from "react-webcam"
import { Camera, RotateCcw } from "lucide-react"
import type { CapturedImage } from "../page" 

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)
  const [isOpenCVReady, setIsOpenCVReady] = useState(false)

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode,
  }

  useEffect(() => {
    const loadOpenCV = async () => {
      if (typeof window !== "undefined" && !(window as any).cv) {
        const script = document.createElement("script")
        script.src = "https://docs.opencv.org/4.8.0/opencv.js"
        script.async = true
        script.onload = () => {
          const cv = (window as any).cv
          cv.onRuntimeInitialized = () => {
            console.log("OpenCV.js is ready")
            setIsOpenCVReady(true)
          }
        }
        document.head.appendChild(script)
      } else if ((window as any).cv && (window as any).cv.Mat) {
        setIsOpenCVReady(true)
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
    if (!isOpenCVReady || !webcamRef.current || !canvasRef.current) return

    const video = webcamRef.current.video
    const canvas = canvasRef.current

    if (!video || video.readyState !== 4) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    try {
      const cv = (window as any).cv

      // Create OpenCV matrices
      const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4)
      const gray = new cv.Mat()
      const edges = new cv.Mat()
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()

      // Capture frame from video
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      src.data.set(imageData.data)

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // Apply Gaussian blur to reduce noise
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)

      // Edge detection
      cv.Canny(gray, edges, 50, 150)

      // Find contours
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      // Clear canvas and prepare for drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = "#00ff00" // Green color
      ctx.lineWidth = 3

      // Process each contour
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        // Filter by area (adjust these values based on your needs)
        if (area > 5000 && area < canvas.width * canvas.height * 0.8) {
          // Approximate contour to polygon
          const approx = new cv.Mat()
          const epsilon = 0.02 * cv.arcLength(contour, true)
          cv.approxPolyDP(contour, approx, epsilon, true)

          // Check if it's a rectangle/square (4 vertices)
          if (approx.rows === 4) {
            // Draw the detected rectangle
            ctx.beginPath()
            for (let j = 0; j < approx.rows; j++) {
              const point = approx.data32S.slice(j * 2, j * 2 + 2)
              if (j === 0) {
                ctx.moveTo(point[0], point[1])
              } else {
                ctx.lineTo(point[0], point[1])
              }
            }
            ctx.closePath()
            ctx.stroke()

            // Add corner indicators
            ctx.fillStyle = "#00ff00"
            for (let j = 0; j < approx.rows; j++) {
              const point = approx.data32S.slice(j * 2, j * 2 + 2)
              ctx.beginPath()
              ctx.arc(point[0], point[1], 6, 0, 2 * Math.PI)
              ctx.fill()
            }
          }

          approx.delete()
        }

        contour.delete()
      }

      // Clean up
      src.delete()
      gray.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
    } catch (error) {
      console.error("Shape detection error:", error)
    }

    // Continue animation loop
    animationRef.current = requestAnimationFrame(detectShapes)
  }, [isOpenCVReady])

  useEffect(() => {
    if (isOpenCVReady && hasCamera) {
      const startDetection = () => {
        if (webcamRef.current?.video?.readyState === 4) {
          detectShapes()
        } else {
          setTimeout(startDetection, 100)
        }
      }
      startDetection()
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isOpenCVReady, hasCamera, detectShapes])

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
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
              style={{ mixBlendMode: "screen" }}
            />
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

        {/* Document Frame Overlay */}
        <div className="absolute inset-4 border-2 border-white opacity-30 rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-blue-500 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-blue-500 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-blue-500 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-blue-500 rounded-br-lg"></div>
        </div>

        {!isOpenCVReady && hasCamera && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
            Loading shape detection...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
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
