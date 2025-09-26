'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Crop, { Point, Area } from 'react-easy-crop'
import { RotateCcw, Square, Maximize2, ArrowLeft, Check, ZoomIn, ZoomOut, MonitorCog as FitScreen, RotateCcwIcon } from 'lucide-react'
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
  const [minZoom, setMinZoom] = useState(0.1)
  const [manualCropArea, setManualCropArea] = useState<Area | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'none' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move'>('none')
  const [startDrag, setStartDrag] = useState({ x: 0, y: 0, area: { x: 0, y: 0, width: 0, height: 0 } })
  const cropperContainerRef = useRef<HTMLDivElement>(null)

  // Calculate optimal zoom to fit entire image
  const calculateFitZoom = useCallback((containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number) => {
    const scaleX = containerWidth / imageWidth
    const scaleY = containerHeight / imageHeight
    return Math.min(scaleX, scaleY) * 0.8 // 80% to leave some padding
  }, [])

  // Load image and initialize crop based on detected edges
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      setImageLoaded(true)
      
      // Calculate dynamic minimum zoom based on container size
      if (cropperContainerRef.current) {
        const containerRect = cropperContainerRef.current.getBoundingClientRect()
        const fitZoom = calculateFitZoom(
          containerRect.width, 
          containerRect.height, 
          img.naturalWidth, 
          img.naturalHeight
        )
        
        // Set minimum zoom to allow seeing the entire image
        const calculatedMinZoom = Math.max(0.05, fitZoom)
        setMinZoom(calculatedMinZoom)
        
        // Initialize with a reasonable zoom that shows more of the image
        if (image.detectedCorners && image.detectedCorners.length === 4) {
          const corners = image.detectedCorners
          
          // Find bounding box of detected corners
          const minX = Math.min(...corners.map(c => c.x))
          const maxX = Math.max(...corners.map(c => c.x))
          const minY = Math.min(...corners.map(c => c.y))
          const maxY = Math.max(...corners.map(c => c.y))
          
          // Convert detection coordinates to image coordinates
          const scaleX = img.naturalWidth / (image.width || img.naturalWidth)
          const scaleY = img.naturalHeight / (image.height || img.naturalHeight)
          
          const scaledMinX = minX * scaleX
          const scaledMinY = minY * scaleY
          const scaledMaxX = maxX * scaleX
          const scaledMaxY = maxY * scaleY
          
          // Calculate crop parameters as percentages
          const cropX = (scaledMinX / img.naturalWidth) * 100
          const cropY = (scaledMinY / img.naturalHeight) * 100
          const cropWidth = ((scaledMaxX - scaledMinX) / img.naturalWidth) * 100
          const cropHeight = ((scaledMaxY - scaledMinY) / img.naturalHeight) * 100
          
          // Set initial crop to detected area with small padding
          const padding = 2 // 2% padding
          setCrop({ 
            x: Math.max(0, cropX - padding), 
            y: Math.max(0, cropY - padding)
          })
          
          // FIXED: Use more conservative zoom that allows user to see context
          const detectedAreaZoom = Math.max(calculatedMinZoom * 1.2, Math.min(1.5, 60 / Math.min(cropWidth, cropHeight)))
          setZoom(detectedAreaZoom)
          
          console.log('Initialized crop with detected corners:', {
            originalCorners: corners,
            cropArea: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
            initialZoom: detectedAreaZoom,
            minZoom: calculatedMinZoom
          })
        } else {
          // Fallback: Start with fit-to-screen zoom
          setCrop({ x: 0, y: 0 })
          setZoom(Math.max(calculatedMinZoom * 1.1, 0.3))
        }
      }
    }
    img.src = image.src
  }, [image.src, image.detectedCorners, image.width, image.height, calculateFitZoom])

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
    console.log('Crop area updated:', croppedAreaPixels)
    
    // Update manual crop area when react-easy-crop updates
    if (!isDragging) {
      setManualCropArea(croppedAreaPixels)
    }
  }, [isDragging])

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
    setZoom(Math.max(minZoom * 1.1, 0.3))
    setRotation(0)
    setAspect(null)
    setManualCropArea(null)
  }

  // FIXED: Better zoom controls with wider range
  const zoomIn = () => {
    setZoom(prev => Math.min(prev + 0.3, 8)) // Allow more zoom range
  }

  const zoomOut = () => {
    setZoom(prev => Math.max(prev - 0.3, minZoom)) // Use dynamic minimum
  }

  // NEW: Fit to screen function
  const fitToScreen = () => {
    if (cropperContainerRef.current) {
      const containerRect = cropperContainerRef.current.getBoundingClientRect()
      const fitZoom = calculateFitZoom(
        containerRect.width, 
        containerRect.height, 
        imageDimensions.width, 
        imageDimensions.height
      )
      setZoom(Math.max(fitZoom, minZoom))
      setCrop({ x: 0, y: 0 })
    }
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
      // FIXED: More reasonable zoom for detected edges
      setZoom(Math.max(1.5, minZoom * 3))
    }
  }

  // Manual crop area adjustment handlers
  const handleMouseDown = (e: React.MouseEvent, type: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move') => {
    e.preventDefault()
    setIsDragging(true)
    setDragType(type)
    
    // Get current crop area in pixels
    const rect = e.currentTarget.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height
    
    // Calculate current crop area in pixels
    const currentCropArea = manualCropArea || {
      x: Math.round((crop.x / 100) * imageDimensions.width),
      y: Math.round((crop.y / 100) * imageDimensions.height),
      width: Math.round((aspect ? 100 : 100) * imageDimensions.width / zoom),
      height: Math.round((aspect ? 100 / (aspect || 1) : 100) * imageDimensions.height / zoom)
    }
    
    setStartDrag({
      x: e.clientX,
      y: e.clientY,
      area: { ...currentCropArea }
    })
  }

  const handleTouchStart = (e: React.TouchEvent, type: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move') => {
    e.preventDefault()
    setIsDragging(true)
    setDragType(type)
    
    // Get current crop area in pixels
    const rect = e.currentTarget.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height
    
    // Calculate current crop area in pixels
    const currentCropArea = manualCropArea || {
      x: Math.round((crop.x / 100) * imageDimensions.width),
      y: Math.round((crop.y / 100) * imageDimensions.height),
      width: Math.round((aspect ? 100 : 100) * imageDimensions.width / zoom),
      height: Math.round((aspect ? 100 / (aspect || 1) : 100) * imageDimensions.height / zoom)
    }
    
    setStartDrag({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      area: { ...currentCropArea }
    })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !cropperContainerRef.current) return
    
    const rect = cropperContainerRef.current.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height
    
    const deltaX = e.clientX - startDrag.x
    const deltaY = e.clientY - startDrag.y
    
    // Calculate new crop area based on drag type
    let newArea = { ...startDrag.area }
    
    switch (dragType) {
      case 'nw':
        newArea.x += deltaX
        newArea.y += deltaY
        newArea.width -= deltaX
        newArea.height -= deltaY
        break
      case 'ne':
        newArea.y += deltaY
        newArea.width += deltaX
        newArea.height -= deltaY
        break
      case 'sw':
        newArea.x += deltaX
        newArea.width -= deltaX
        newArea.height += deltaY
        break
      case 'se':
        newArea.width += deltaX
        newArea.height += deltaY
        break
      case 'n':
        newArea.y += deltaY
        newArea.height -= deltaY
        break
      case 's':
        newArea.height += deltaY
        break
      case 'w':
        newArea.x += deltaX
        newArea.width -= deltaX
        break
      case 'e':
        newArea.width += deltaX
        break
      case 'move':
        newArea.x += deltaX
        newArea.y += deltaY
        break
    }
    
    // Ensure crop area stays within image bounds
    newArea.x = Math.max(0, Math.min(imageDimensions.width - newArea.width, newArea.x))
    newArea.y = Math.max(0, Math.min(imageDimensions.height - newArea.height, newArea.y))
    newArea.width = Math.max(20, Math.min(imageDimensions.width - newArea.x, newArea.width))
    newArea.height = Math.max(20, Math.min(imageDimensions.height - newArea.y, newArea.height))
    
    setManualCropArea(newArea)
    
    // Update react-easy-crop crop position
    const newCropX = (newArea.x / imageDimensions.width) * 100
    const newCropY = (newArea.y / imageDimensions.height) * 100
    setCrop({ x: newCropX, y: newCropY })
  }, [isDragging, startDrag, dragType, imageDimensions])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !cropperContainerRef.current) return
    
    const rect = cropperContainerRef.current.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height
    
    const deltaX = e.touches[0].clientX - startDrag.x
    const deltaY = e.touches[0].clientY - startDrag.y
    
    // Calculate new crop area based on drag type
    let newArea = { ...startDrag.area }
    
    switch (dragType) {
      case 'nw':
        newArea.x += deltaX
        newArea.y += deltaY
        newArea.width -= deltaX
        newArea.height -= deltaY
        break
      case 'ne':
        newArea.y += deltaY
        newArea.width += deltaX
        newArea.height -= deltaY
        break
      case 'sw':
        newArea.x += deltaX
        newArea.width -= deltaX
        newArea.height += deltaY
        break
      case 'se':
        newArea.width += deltaX
        newArea.height += deltaY
        break
      case 'n':
        newArea.y += deltaY
        newArea.height -= deltaY
        break
      case 's':
        newArea.height += deltaY
        break
      case 'w':
        newArea.x += deltaX
        newArea.width -= deltaX
        break
      case 'e':
        newArea.width += deltaX
        break
      case 'move':
        newArea.x += deltaX
        newArea.y += deltaY
        break
    }
    
    // Ensure crop area stays within image bounds
    newArea.x = Math.max(0, Math.min(imageDimensions.width - newArea.width, newArea.x))
    newArea.y = Math.max(0, Math.min(imageDimensions.height - newArea.height, newArea.y))
    newArea.width = Math.max(20, Math.min(imageDimensions.width - newArea.x, newArea.width))
    newArea.height = Math.max(20, Math.min(imageDimensions.height - newArea.y, newArea.height))
    
    setManualCropArea(newArea)
    
    // Update react-easy-crop crop position
    const newCropX = (newArea.x / imageDimensions.width) * 100
    const newCropY = (newArea.y / imageDimensions.height) * 100
    setCrop({ x: newCropX, y: newCropY })
  }, [isDragging, startDrag, dragType, imageDimensions])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType('none')
  }, [])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    setDragType('none')
  }, [])

  // Add event listeners for drag interactions
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

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
          minZoom={minZoom} // Dynamic minimum zoom
          maxZoom={8} // Increased maximum zoom
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
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              position: 'relative',
            },
            mediaStyle: {
              maxHeight: '100%',
              maxWidth: '100%',
            }
          }}
          cropShape="rect"
          objectFit="contain"
        />
        
        {/* Manual crop handles overlay */}
        {!aspect && manualCropArea && (
          <div 
            className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-10"
            style={{
              left: `${(manualCropArea.x / imageDimensions.width) * 100}%`,
              top: `${(manualCropArea.y / imageDimensions.height) * 100}%`,
              width: `${(manualCropArea.width / imageDimensions.width) * 100}%`,
              height: `${(manualCropArea.height / imageDimensions.height) * 100}%`,
              pointerEvents: 'all',
            }}
          >
            {/* Corner handles */}
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-nw-resize"
              style={{ top: '-8px', left: '-8px' }}
              onMouseDown={(e) => handleMouseDown(e, 'nw')}
              onTouchStart={(e) => handleTouchStart(e, 'nw')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-ne-resize"
              style={{ top: '-8px', right: '-8px' }}
              onMouseDown={(e) => handleMouseDown(e, 'ne')}
              onTouchStart={(e) => handleTouchStart(e, 'ne')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-sw-resize"
              style={{ bottom: '-8px', left: '-8px' }}
              onMouseDown={(e) => handleMouseDown(e, 'sw')}
              onTouchStart={(e) => handleTouchStart(e, 'sw')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-se-resize"
              style={{ bottom: '-8px', right: '-8px' }}
              onMouseDown={(e) => handleMouseDown(e, 'se')}
              onTouchStart={(e) => handleTouchStart(e, 'se')}
            />
            
            {/* Edge handles */}
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-n-resize"
              style={{ top: '-8px', left: '50%', transform: 'translateX(-50%)' }}
              onMouseDown={(e) => handleMouseDown(e, 'n')}
              onTouchStart={(e) => handleTouchStart(e, 'n')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-s-resize"
              style={{ bottom: '-8px', left: '50%', transform: 'translateX(-50%)' }}
              onMouseDown={(e) => handleMouseDown(e, 's')}
              onTouchStart={(e) => handleTouchStart(e, 's')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-w-resize"
              style={{ top: '50%', left: '-8px', transform: 'translateY(-50%)' }}
              onMouseDown={(e) => handleMouseDown(e, 'w')}
              onTouchStart={(e) => handleTouchStart(e, 'w')}
            />
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-blue-500 cursor-e-resize"
              style={{ top: '50%', right: '-8px', transform: 'translateY(-50%)' }}
              onMouseDown={(e) => handleMouseDown(e, 'e')}
              onTouchStart={(e) => handleTouchStart(e, 'e')}
            />
          </div>
        )}
        
        {/* Enhanced zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
          <button
            onClick={zoomIn}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={zoomOut}
            className="w-12 h-12 bg-black bg-opacity-70 hover:bg-opacity-90 text-white rounded-full flex items-center justify-center transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          
          {/* NEW: Fit to screen button */}
          <button
            onClick={fitToScreen}
            className="w-12 h-12 bg-blue-600 bg-opacity-80 hover:bg-opacity-100 text-white rounded-full flex items-center justify-center transition-all"
            title="Fit entire image to screen"
          >
            <FitScreen size={18} />
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
          <div className="text-blue-400 text-xs">Zoom: {zoom.toFixed(1)}x (min: {minZoom.toFixed(2)}x)</div>
        </div>
      </div>

      {/* Enhanced Controls Panel */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-64 overflow-y-auto">
        
        {/* Aspect Ratios */}
        <div className="flex justify-center space-x-3 flex-wrap gap-2">
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

        {/* Zoom Control - NEW */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Zoom: {zoom.toFixed(1)}x
            </label>
            <button
              onClick={fitToScreen}
              className="flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FitScreen size={16} />
              <span>Fit Screen</span>
            </button>
          </div>
          
          <div className="relative">
            <input
              type="range"
              min={minZoom}
              max="8"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
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
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between text-sm text-gray-300">
          <span>Min Zoom: {minZoom.toFixed(2)}x</span>
          <div className="flex space-x-4">
            <button
              onClick={fitToScreen}
              className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FitScreen size={16} />
              <span>Fit Screen</span>
            </button>
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