'use client'

import { useState, useCallback } from 'react'
import Crop, { Point, Area } from 'react-easy-crop'
import { RotateCcw, Square, Maximize2, ArrowLeft, Check } from 'lucide-react'
import { CapturedImage, CroppedImageData } from '../page'

interface CropperProps {
  image: CapturedImage
  onCropComplete: (cropData: CroppedImageData) => void
  onBack: () => void
}

const aspectRatios = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4/3 },
  { label: '16:9', value: 16/9 },
]

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [aspect, setAspect] = useState<number | null>(null)

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
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

    const rotRad = (rotation * Math.PI) / 180

    // Calculate bounding box of the rotated image
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation)

    // Set canvas size to match the bounding box
    canvas.width = bBoxWidth
    canvas.height = bBoxHeight

    // Translate canvas context to a central location on image to allow rotating around the center
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
    ctx.rotate(rotRad)
    ctx.translate(-image.width / 2, -image.height / 2)

    // Draw rotated image and store data
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height)

    // Set canvas width to final desired crop size
    canvas.width = pixelCrop.width
    canvas.height = pixelCrop.height

    // Paste generated rotate image with correct crop
    ctx.putImageData(data, 0, 0)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, url: URL.createObjectURL(blob) })
        }
      }, 'image/jpeg', 0.9)
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
    if (!croppedAreaPixels) return

    try {
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

  const autoStraighten = () => {
    // Simple auto-straighten - in a real app you'd use edge detection
    setRotation(0)
  }

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Crop Area */}
      <div className="relative flex-1">
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
          style={{
            containerStyle: {
              width: '100%',
              height: '100%',
              backgroundColor: '#000'
            }
          }}
        />
      </div>

      {/* Controls */}
      <div className="bg-gray-900 p-4 space-y-4">
        {/* Aspect Ratio Buttons */}
        <div className="flex justify-center space-x-2 mb-4">
          {aspectRatios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => setAspect(ratio.value)}
              className={`px-3 py-2 rounded-lg text-sm ${
                aspect === ratio.value ? 'bg-blue-600' : 'bg-gray-600'
              } text-white transition-colors`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        {/* Rotation Slider */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Rotation: {rotation.toFixed(0)}°
          </label>
          <input
            type="range"
            min="-180"
            max="180"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none slider-thumb"
          />
          <button
            onClick={autoStraighten}
            className="flex items-center space-x-2 text-sm text-blue-400 hover:text-blue-300"
          >
            <RotateCcw size={16} />
            <span>Auto Straighten</span>
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Zoom: {zoom.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none slider-thumb"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4">
          <button onClick={onBack} className="btn-secondary flex items-center space-x-2">
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <button onClick={handleCropSave} className="btn-primary flex items-center space-x-2">
            <Check size={20} />
            <span>Apply Crop</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Cropper