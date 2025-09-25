'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Crop, { Point, Area } from 'react-easy-crop'
import { RotateCcw, Square, Maximize2, ArrowLeft, Check, ZoomIn, ZoomOut } from 'lucide-react'
import { CapturedImage, CroppedImageData } from '../page'

interface CropperProps {
  image: CapturedImage
  onCropComplete: (cropData: CroppedImageData) => void
  onBack: () => void
}

const aspectRatios = [
  { label: 'Free', value: null },
  { label: 'Square', value: 1 },
  { label: 'Document', value: 4/3 },
  { label: 'Photo', value: 3/2 },
  { label: 'Wide', value: 16/9 },
]

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [aspect, setAspect] = useState<number | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const cropperContainerRef = useRef<HTMLDivElement>(null)

  // Load image and get its natural dimensions
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      setImageLoaded(true)
      
      // Start with crop covering most of the image but with some margin
      const margin = 0.05 // 5% margin on each side
      setCrop({ 
        x: margin * 100, 
        y: margin * 100 
      })
      
      // Set initial zoom to fit the image nicely
      setZoom(1)
      
      console.log('Image loaded:', {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: image.src.substring(0, 50) + '...'
      })
    }
    img.src = image.src
  }, [image.src])

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
    console.log('Crop area updated:', croppedAreaPixels)
  }, [])

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', error => reject(error))
      image.src = url
    })

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0
  ): Promise<{ blob: Blob; url: string }> => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Could not get canvas context')
    }

    // For no rotation, we can do a simple crop which preserves quality better
    if (rotation === 0) {
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      )
    } else {
      // Handle rotation
      const rotRad = (rotation * Math.PI) / 180
      const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation)

      canvas.width = bBoxWidth
      canvas.height = bBoxHeight

      ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
      ctx.rotate(rotRad)
      ctx.translate(-image.width / 2, -image.height / 2)
      ctx.drawImage(image, 0, 0)
      
      const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height)
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      ctx.putImageData(data, 0, 0)
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, url: URL.createObjectURL(blob) })
        }
      }, 'image/jpeg', 0.95) // Higher quality
    })
  }

  const rotateSize = (width: number, height: number, rotation: number) => {
    const rotRad = (rotation * Math.PI) / 180
    return {
      width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
      height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    }
  }

  const handleCropSave = async () => {
    if (!croppedAreaPixels) {
      console.error('No crop area defined')
      return
    }

    try {
      console.log('Saving crop with dimensions:', croppedAreaPixels)
      const { blob, url } = await getCroppedImg(image.src, croppedAreaPixels, rotation)
      onCropComplete({
        croppedImage: url,
        croppedBlob: blob,
        rotation
      })
    } catch (error) {
      console.error('Error cropping image:', error)
    }
  }

  const resetCrop = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setAspect(null)
  }

  const zoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3))
  }

  const zoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 1))
  }

  const handleRotationChange = (newRotation: number) => {
    setRotation(newRotation)
  }

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading image...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center space-x-2 text-white hover:text-blue-400 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-lg">Back</span>
        </button>
        <h2 className="text-white text-lg font-medium">Adjust Crop</h2>
        <button 
          onClick={handleCropSave} 
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Check size={20} />
          <span className="text-lg">Done</span>
        </button>
      </div>

      {/* Crop Area - Takes most of the screen */}
      <div ref={cropperContainerRef} className="relative flex-1 min-h-0">
        <Crop
          image={image.src}
          crop={crop}
          rotation={rotation}
          zoom={zoom}
          aspect={aspect || undefined}
          onCropChange={setCrop}
          onRotationChange={setRotation}
          onCropComplete={onCropCompleteHandler}
          onZoomChange={setZoom}
          showGrid={true}
          restrictPosition={false}
          style={{
            containerStyle: {
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
              position: 'relative'
            },
            cropAreaStyle: {
              border: '3px solid #10B981',
              borderRadius: '8px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
            },
            mediaStyle: {
              maxHeight: '100%',
              maxWidth: '100%'
            }
          }}
          cropShape="rect"
          objectFit="contain"
        />
        
        {/* Touch-friendly zoom controls overlay */}
        <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
          <button
            onClick={zoomIn}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={zoomOut}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center"
          >
            <ZoomOut size={20} />
          </button>
        </div>

        {/* Image info overlay */}
        <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg text-sm">
          {imageDimensions.width} × {imageDimensions.height}
        </div>
      </div>

      {/* Controls Panel - Compact but touch-friendly */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-64 overflow-y-auto">
        
        {/* Quick Actions */}
        <div className="flex justify-center space-x-3">
          {aspectRatios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => setAspect(ratio.value)}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                aspect === ratio.value 
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        {/* Rotation Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Rotation: {rotation.toFixed(0)}°
            </label>
            <button
              onClick={() => setRotation(0)}
              className="flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>
          
          <div className="relative">
            <input
              type="range"
              min="-45"
              max="45"
              step="0.5"
              value={rotation}
              onChange={(e) => handleRotationChange(Number(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #374151 0%, #374151 ${((rotation + 45) / 90) * 100}%, #10B981 ${((rotation + 45) / 90) * 100}%, #10B981 100%)`
              }}
            />
            {/* Slider thumb styling */}
            <style jsx>{`
              input[type="range"]::-webkit-slider-thumb {
                appearance: none;
                height: 24px;
                width: 24px;
                border-radius: 50%;
                background: #10B981;
                cursor: pointer;
                border: 2px solid #ffffff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              }
              input[type="range"]::-moz-range-thumb {
                height: 24px;
                width: 24px;
                border-radius: 50%;
                background: #10B981;
                cursor: pointer;
                border: 2px solid #ffffff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              }
            `}</style>
          </div>
        </div>

        {/* Zoom Display */}
        <div className="flex items-center justify-between text-sm text-gray-300">
          <span>Zoom: {zoom.toFixed(1)}x</span>
          <button
            onClick={resetCrop}
            className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Maximize2 size={16} />
            <span>Reset All</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Cropper