'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { Camera, RotateCcw, Grid3X3, Square } from 'lucide-react'
import { CapturedImage } from '../page'

interface CameraViewProps {
  onImageCapture: (image: CapturedImage) => void
}

const CameraView: React.FC<CameraViewProps> = ({ onImageCapture }) => {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [showGrid, setShowGrid] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)
  const [hasCamera, setHasCamera] = useState(true)

  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: facingMode
  }

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
            height: image.height
          })
        }
        image.src = imageSrc
      }
    } catch (error) {
      console.error('Error capturing image:', error)
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

        {/* Grid Overlay */}
        {showGrid && hasCamera && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="33.333%" height="33.333%" patternUnits="objectBoundingBox">
                  <path d="M 33.333 0 L 33.333 33.333 M 0 33.333 L 33.333 33.333" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        )}

        {/* Document Frame Overlay */}
        <div className="absolute inset-4 border-2 border-white opacity-30 rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-blue-500 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-blue-500 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-blue-500 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-blue-500 rounded-br-lg"></div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-3 rounded-full ${showGrid ? 'bg-blue-600' : 'bg-gray-600'} transition-colors`}
          >
            <Grid3X3 size={24} />
          </button>

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
