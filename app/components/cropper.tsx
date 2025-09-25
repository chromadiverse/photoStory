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

interface DetectedCorners {
  x: number;
  y: number;
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

  // Load image and initialize crop based on detected edges
 useEffect(() => {
  const img = new Image()
  img.onload = () => {
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    setImageLoaded(true)
    
    // Calculate initial zoom to fit image properly
    const calculateInitialZoom = () => {
      if (cropperContainerRef.current) {
        const container = cropperContainerRef.current;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const widthRatio = containerWidth / img.naturalWidth;
        const heightRatio = containerHeight / img.naturalHeight;
        
        // Start with zoom that fits the image to container
        return Math.min(widthRatio, heightRatio) * 0.95; // 95% to show some padding
      }
      return 1;
    };

    if (image.detectedCorners && image.detectedCorners.length === 4) {
      const corners = image.detectedCorners
      const minX = Math.min(...corners.map(c => c.x))
      const maxX = Math.max(...corners.map(c => c.x))
      const minY = Math.min(...corners.map(c => c.y))
      const maxY = Math.max(...corners.map(c => c.y))
      
      const scaleX = img.naturalWidth / (image.width || img.naturalWidth)
      const scaleY = img.naturalHeight / (image.height || img.naturalHeight)
      
      const scaledMinX = minX * scaleX
      const scaledMinY = minY * scaleY
      const scaledMaxX = maxX * scaleX
      const scaledMaxY = maxY * scaleY
      
      // Calculate center of detected area
      const centerX = ((scaledMinX + scaledMaxX) / 2) / img.naturalWidth * 100
      const centerY = ((scaledMinY + scaledMaxY) / 2) / img.naturalHeight * 100
      
      setCrop({ x: centerX, y: centerY })
      
      // Calculate zoom based on detected area size
      const detectedWidth = scaledMaxX - scaledMinX
      const detectedHeight = scaledMaxY - scaledMinY
      const areaSize = Math.max(detectedWidth / img.naturalWidth, detectedHeight / img.naturalHeight) * 100
      setZoom(Math.max(1, Math.min(3, 100 / areaSize * 0.8)))
    } else {
      // Center the image with proper zoom
      setCrop({ x: 50, y: 50 })
      setZoom(calculateInitialZoom())
    }
  }
  img.src = image.src
}, [image.src, image.detectedCorners, image.width, image.height])
const fitToWidth = () => {
  if (cropperContainerRef.current && imageDimensions.width > 0) {
    const container = cropperContainerRef.current;
    const containerWidth = container.clientWidth;
    const zoomLevel = containerWidth / imageDimensions.width;
    
    setZoom(zoomLevel);
    setCrop({ x: 50, y: 50 }); // Center the image
  }
};

useEffect(() => {
  const updateContainerSize = () => {
    if (cropperContainerRef.current && imageLoaded) {
      const container = cropperContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      console.log('Container size:', containerRect.width, containerRect.height);
      console.log('Image size:', imageDimensions.width, imageDimensions.height);
    }
  };

  updateContainerSize();
  window.addEventListener('resize', updateContainerSize);
  
  return () => window.removeEventListener('resize', updateContainerSize);
}, [imageLoaded, imageDimensions]);
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

  // FIXED: Higher quality cropping with better canvas handling
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

    // Set canvas to exact crop dimensions for maximum quality
    canvas.width = Math.round(pixelCrop.width)
    canvas.height = Math.round(pixelCrop.height)

    if (rotation === 0) {
      // Direct crop - highest quality
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      
      ctx.drawImage(
        image,
        Math.round(pixelCrop.x), 
        Math.round(pixelCrop.y), 
        Math.round(pixelCrop.width), 
        Math.round(pixelCrop.height),
        0, 0, 
        Math.round(pixelCrop.width), 
        Math.round(pixelCrop.height)
      )
    } else {
      // Handle rotation with quality preservation
      const rotRad = (rotation * Math.PI) / 180
      const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation)

      // Create temporary canvas for rotation
      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')!
      tempCanvas.width = bBoxWidth
      tempCanvas.height = bBoxHeight

      tempCtx.imageSmoothingEnabled = true
      tempCtx.imageSmoothingQuality = 'high'
      tempCtx.translate(bBoxWidth / 2, bBoxHeight / 2)
      tempCtx.rotate(rotRad)
      tempCtx.translate(-image.width / 2, -image.height / 2)
      tempCtx.drawImage(image, 0, 0)
      
      // Now crop from rotated image
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        tempCanvas,
        Math.round(pixelCrop.x), 
        Math.round(pixelCrop.y), 
        Math.round(pixelCrop.width), 
        Math.round(pixelCrop.height),
        0, 0, 
        Math.round(pixelCrop.width), 
        Math.round(pixelCrop.height)
      )
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ blob, url: URL.createObjectURL(blob) })
        }
      }, 'image/jpeg', 0.98) // Maximum quality
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
      console.log('Saving crop with high quality:', croppedAreaPixels)
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
    setZoom(prev => Math.min(prev + 0.2, 5)) // Allow more zoom
  }

  const zoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.5)) // Allow zoom out more
  }

  const handleRotationChange = (newRotation: number) => {
    setRotation(newRotation)
  }

  // Smart crop to detected edges
  const snapToDetectedEdges = () => {
    if (image.detectedCorners && image.detectedCorners.length === 4) {
      const corners = image.detectedCorners
      const minX = Math.min(...corners.map(c => c.x))
      const maxX = Math.max(...corners.map(c => c.x))
      const minY = Math.min(...corners.map(c => c.y))
      const maxY = Math.max(...corners.map(c => c.y))
      
      const scaleX = imageDimensions.width / (image.width || imageDimensions.width)
      const scaleY = imageDimensions.height / (image.height || imageDimensions.height)
      
      const cropX = (minX * scaleX / imageDimensions.width) * 100
      const cropY = (minY * scaleY / imageDimensions.height) * 100
      
      setCrop({ x: cropX, y: cropY })
      setZoom(2) // Zoom in to show the detected area better
    }
  }

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading high-quality image...</div>
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
        <h2 className="text-white text-lg font-medium">
          Adjust Crop {image.detectedCorners ? '(Auto-detected)' : ''}
        </h2>
        <button 
          onClick={handleCropSave} 
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Check size={20} />
          <span className="text-lg">Done</span>
        </button>
      </div>

      {/* Crop Area */}
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
          minZoom={0.5}
          maxZoom={5}
          style={{
            containerStyle: {
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
              position: 'relative'
            },
            cropAreaStyle: {
              border: image.detectedCorners ? '4px solid #10B981' : '3px solid #3B82F6',
              borderRadius: '8px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
            },
             mediaStyle: {
      // Key changes here - ensure image fills container properly
      width: 'auto',
      height: 'auto',
      maxWidth: 'none',
      maxHeight: 'none',
      transform: 'translateZ(0)' // Force hardware acceleration
    }
          }}
          cropShape="rect"
          objectFit="contain"
        />
        
        {/* Enhanced zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
          <button
            onClick={zoomIn}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={zoomOut}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
          >
            <ZoomOut size={20} />
          </button>
          
          {/* Smart snap button for detected edges */}
          {image.detectedCorners && (
            <button
              onClick={snapToDetectedEdges}
              className="w-12 h-12 bg-green-600 bg-opacity-80 hover:bg-opacity-100 text-white rounded-full flex items-center justify-center transition-all"
              title="Snap to detected edges"
            >
              <Square size={18} />
            </button>
          )}
        </div>

        {/* Image quality info */}
        <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg text-sm">
          <div>{imageDimensions.width} × {imageDimensions.height}</div>
          {image.detectedCorners && (
            <div className="text-green-400 text-xs">Auto-detected edges</div>
          )}
        </div>
      </div>

      {/* Enhanced Controls Panel */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-64 overflow-y-auto">
        
        {/* Aspect Ratios */}
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
        {/* FIT CONTROL */}
<button
  onClick={fitToWidth}
  className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
>
  <Maximize2 size={16} />
  <span>Fit to Width</span>
</button>
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

        {/* Zoom and Actions */}
        <div className="flex items-center justify-between text-sm text-gray-300">
          <span>Zoom: {zoom.toFixed(1)}x</span>
          <div className="flex space-x-4">
            {image.detectedCorners && (
              <button
                onClick={snapToDetectedEdges}
                className="flex items-center space-x-1 text-green-400 hover:text-green-300 transition-colors"
              >
                <Square size={16} />
                <span>Snap to Edges</span>
              </button>
            )}
            <button
              onClick={resetCrop}
              className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Maximize2 size={16} />
              <span>Reset All</span>
            </button>
          </div>
        </div>

        {/* Quality Info */}
        {croppedAreaPixels && (
          <div className="text-center text-xs text-gray-400">
            Output: {Math.round(croppedAreaPixels.width)} × {Math.round(croppedAreaPixels.height)} px
            {image.detectedCorners && (
              <span className="text-green-400 ml-2">• Auto-cropped to detected document</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Cropper