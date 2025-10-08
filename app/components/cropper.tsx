"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { ArrowLeft, RotateCcw as RotateIcon, ArrowRight as AutoStraightenIcon } from "lucide-react"
import type { CapturedImage, CroppedImageData } from "../page"

interface CropperProps {
  image: CapturedImage
  onCropComplete: (cropData: CroppedImageData) => void
  onBack: () => void
}

interface Point {
  x: number
  y: number
}

interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  isDragging: boolean
  dragType: "none" | "nw" | "ne" | "sw" | "se" | "move"
  start: Point
  initialCrop: CropArea
  initialMouse: Point
  initialCropStart: Point
}

const printRatios = [
  { label: "Free", value: null },
  { label: "3:2", value: 3 / 2 },
  { label: "5:4", value: 5 / 4 },
  { label: "7:5", value: 7 / 5 },
  { label: "1:1", value: 1 },
]

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 })
  const [rotatedBoundingBox, setRotatedBoundingBox] = useState({ width: 0, height: 0 })
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 })
  const [rotation, setRotation] = useState(0) // Continuous rotation in degrees
  const [zoom, setZoom] = useState(0.5)
  const [aspect, setAspect] = useState<number | null>(null)
  const [selectedRatio, setSelectedRatio] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: "none",
    start: { x: 0, y: 0 },
    initialCrop: { x: 0, y: 0, width: 0, height: 0 },
    initialMouse: { x: 0, y: 0 },
    initialCropStart: { x: 0, y: 0 },
  })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  // Calculate effective aspect ratio based on rotation
  const effectiveAspect = useMemo(() => {
    if (aspect === null) return null;
    // When rotated 90° or 270°, the aspect ratio effectively inverts
    return (rotation % 180 === 0) ? aspect : 1 / aspect;
  }, [aspect, rotation]);

  // Initialize image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      setOriginalDimensions({ width, height })
      setImageDimensions({ width, height })
      setRotatedBoundingBox({ width, height })
      setOriginalImageSrc(image.src)
      setImageLoaded(true)

      setCropArea({
        x: 0,
        y: 0,
        width: width,
        height: height,
      })
    }
    img.src = image.src
  }, [image.src])

  const resizeImageToRatio = useCallback(
    async (targetRatio: number | null) => {
      if (!originalImageSrc || targetRatio === null) {
        setProcessedImage(null)
        setImageDimensions({ width: originalDimensions.width, height: originalDimensions.height })
        setCropArea({
          x: 0,
          y: 0,
          width: originalDimensions.width,
          height: originalDimensions.height,
        })
        return
      }

      const originalWidth = originalDimensions.width
      const originalHeight = originalDimensions.height
      const originalRatio = originalWidth / originalHeight

      let newWidth: number, newHeight: number

      if (originalRatio > targetRatio) {
        newWidth = originalWidth
        newHeight = originalWidth / targetRatio
      } else {
        newHeight = originalHeight
        newWidth = originalHeight * targetRatio
      }

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      canvas.width = newWidth
      canvas.height = newHeight
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, newWidth, newHeight)

      const tempImg = new Image()
      tempImg.src = originalImageSrc
      await new Promise<void>((resolve) => (tempImg.onload = () => resolve()))

      const offsetX = (newWidth - originalWidth) / 2
      const offsetY = (newHeight - originalHeight) / 2
      ctx.drawImage(tempImg, offsetX, offsetY, originalWidth, originalHeight)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95))
      if (blob) {
        const url = URL.createObjectURL(blob)
        setProcessedImage(url)
        setImageDimensions({ width: newWidth, height: newHeight })
        setCropArea({ x: 0, y: 0, width: newWidth, height: newHeight })
      }
    },
    [originalImageSrc, originalDimensions],
  )

  const handleRatioSelect = (ratioOption: (typeof printRatios)[0]) => {
    setSelectedRatio(ratioOption.label)
    setAspect(ratioOption.value)
    resizeImageToRatio(ratioOption.value)
  }

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, dragType: DragState["dragType"]) => {
    e.preventDefault()
    e.stopPropagation()

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

    setDragState({
      isDragging: true,
      dragType,
      start: { x: clientX, y: clientY },
      initialCrop: { ...cropArea },
      initialMouse: { x: clientX, y: clientY },
      initialCropStart: { x: cropArea.x, y: cropArea.y },
    })
  }

  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragState.isDragging || !containerRef.current) return
      e.preventDefault()

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

      const deltaX = clientX - dragState.start.x
      const deltaY = clientY - dragState.start.y

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerWidth = containerRect.width
      const containerHeight = containerRect.height
      const scaleX = containerWidth / rotatedBoundingBox.width
      const scaleY = containerHeight / rotatedBoundingBox.height
      const scale = Math.min(scaleX, scaleY) * zoom

      const imageDeltaX = deltaX / scale
      const imageDeltaY = deltaY / scale

      const newCrop = { ...dragState.initialCrop }

      if (effectiveAspect && dragState.dragType !== "move") {
        // Handle aspect ratio constraint
        switch (dragState.dragType) {
          case "nw":
            // Calculate new dimensions maintaining aspect ratio
            const newWidthNw = dragState.initialCrop.width - imageDeltaX;
            const newHeightNw = newWidthNw / effectiveAspect;
            
            newCrop.x = dragState.initialCropStart.x + imageDeltaX;
            newCrop.y = dragState.initialCropStart.y + (dragState.initialCrop.height - newHeightNw);
            newCrop.width = newWidthNw;
            newCrop.height = newHeightNw;
            break;
            
          case "ne":
            const newWidthNe = dragState.initialCrop.width + imageDeltaX;
            const newHeightNe = newWidthNe / effectiveAspect;
            
            newCrop.y = dragState.initialCropStart.y + (dragState.initialCrop.height - newHeightNe);
            newCrop.width = newWidthNe;
            newCrop.height = newHeightNe;
            break;
            
          case "sw":
            const newWidthSw = dragState.initialCrop.width - imageDeltaX;
            const newHeightSw = newWidthSw / effectiveAspect;
            
            newCrop.x = dragState.initialCropStart.x + imageDeltaX;
            newCrop.width = newWidthSw;
            newCrop.height = newHeightSw;
            break;
            
          case "se":
            const newWidthSe = dragState.initialCrop.width + imageDeltaX;
            const newHeightSe = newWidthSe / effectiveAspect;
            
            newCrop.width = newWidthSe;
            newCrop.height = newHeightSe;
            break;
            
          default:
            return
        }
      } else {
        // Free-form cropping (no aspect ratio lock)
        switch (dragState.dragType) {
          case "nw":
            newCrop.x = dragState.initialCropStart.x + imageDeltaX
            newCrop.y = dragState.initialCropStart.y + imageDeltaY
            newCrop.width = dragState.initialCrop.width - imageDeltaX
            newCrop.height = dragState.initialCrop.height - imageDeltaY
            break
          case "ne":
            newCrop.y = dragState.initialCropStart.y + imageDeltaY
            newCrop.width = dragState.initialCrop.width + imageDeltaX
            newCrop.height = dragState.initialCrop.height - imageDeltaY
            break
          case "sw":
            newCrop.x = dragState.initialCropStart.x + imageDeltaX
            newCrop.width = dragState.initialCrop.width - imageDeltaX
            newCrop.height = dragState.initialCrop.height + imageDeltaY
            break
          case "se":
            newCrop.width = dragState.initialCrop.width + imageDeltaX
            newCrop.height = dragState.initialCrop.height + imageDeltaY
            break
          case "move":
            newCrop.x = dragState.initialCropStart.x + imageDeltaX
            newCrop.y = dragState.initialCropStart.y + imageDeltaY
            break
          default:
            return
        }
      }

      // Ensure crop area stays within bounds
      const minSize = 50
      newCrop.width = Math.max(minSize, newCrop.width)
      newCrop.height = Math.max(minSize, newCrop.height)
      newCrop.x = Math.max(0, Math.min(rotatedBoundingBox.width - newCrop.width, newCrop.x))
      newCrop.y = Math.max(0, Math.min(rotatedBoundingBox.height - newCrop.height, newCrop.y))
      newCrop.width = Math.min(rotatedBoundingBox.width - newCrop.x, newCrop.width)
      newCrop.height = Math.min(rotatedBoundingBox.height - newCrop.y, newCrop.height)

      // Ensure aspect ratio is maintained after bounds correction
      if (effectiveAspect && dragState.dragType !== "move") {
        const currentRatio = newCrop.width / newCrop.height;
        if (Math.abs(currentRatio - effectiveAspect) > 0.001) { // Small tolerance for floating point errors
          if (currentRatio > effectiveAspect) {
            // Too wide: adjust width
            newCrop.width = newCrop.height * effectiveAspect;
          } else {
            // Too tall: adjust height
            newCrop.height = newCrop.width / effectiveAspect;
          }
        }
      }

      setCropArea(newCrop)
    },
    [dragState, effectiveAspect, rotatedBoundingBox, zoom],
  )

  const handleDragEnd = useCallback(() => {
    setDragState((prev) => ({ ...prev, isDragging: false }))
  }, [])

  useEffect(() => {
    if (dragState.isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        handleDragMove(e)
      }

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("touchmove", handleTouchMove, { passive: false })
      window.addEventListener("mouseup", handleDragEnd)
      window.addEventListener("touchend", handleDragEnd)

      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("touchmove", handleTouchMove)
        window.removeEventListener("mouseup", handleDragEnd)
        window.removeEventListener("touchend", handleDragEnd)
      }
    }
  }, [dragState.isDragging, handleDragMove, handleDragEnd])

  useEffect(() => {
    const rad = (rotation * Math.PI) / 180
    const sin = Math.abs(Math.sin(rad))
    const cos = Math.abs(Math.cos(rad))

    const rotatedWidth = imageDimensions.width * cos + imageDimensions.height * sin
    const rotatedHeight = imageDimensions.width * sin + imageDimensions.height * cos

    setRotatedBoundingBox({ width: rotatedWidth, height: rotatedHeight })
  }, [rotation, imageDimensions])

  // =============== ROTATION: 90° BUTTON ===============
  const rotateImage = () => {
    const newRotation = (rotation + 90) % 360
    setRotation(newRotation)

    // Swap dimensions only on 90/270
    if (newRotation % 180 !== 0) {
      const oldWidth = imageDimensions.width
      const oldHeight = imageDimensions.height

      setImageDimensions({
        width: oldHeight,
        height: oldWidth,
      })

      const rad = (newRotation * Math.PI) / 180
      const sin = Math.abs(Math.sin(rad))
      const cos = Math.abs(Math.cos(rad))
      const rotatedWidth = oldHeight * cos + oldWidth * sin
      const rotatedHeight = oldHeight * sin + oldWidth * cos

      if (aspect) {
        const newRatio = rotatedWidth / rotatedHeight
        if (newRatio > aspect) {
          const cropHeight = rotatedWidth / aspect
          const cropY = (rotatedHeight - cropHeight) / 2
          setCropArea({
            x: 0,
            y: Math.max(0, cropY),
            width: rotatedWidth,
            height: Math.min(cropHeight, rotatedHeight),
          })
        } else {
          const cropWidth = rotatedHeight * aspect
          const cropX = (rotatedWidth - cropWidth) / 2
          setCropArea({
            x: Math.max(0, cropX),
            y: 0,
            width: Math.min(cropWidth, rotatedWidth),
            height: rotatedHeight,
          })
        }
      } else {
        setCropArea({
          x: 0,
          y: 0,
          width: rotatedWidth,
          height: rotatedHeight,
        })
      }
    } else {
      setCropArea({
        x: 0,
        y: 0,
        width: imageDimensions.width,
        height: imageDimensions.height,
      })
    }
  }

  // =============== AUTO-STRAIGHTEN ===============
  const autoStraighten = () => {
    setRotation(0)
  }

  // =============== SAVE ===============
  const handleSave = async () => {
    const imgSrc = processedImage || image.src
    const tempImg = new Image()
    tempImg.src = imgSrc

    tempImg.onload = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const rad = (rotation * Math.PI) / 180
      const sin = Math.abs(Math.sin(rad))
      const cos = Math.abs(Math.cos(rad))

      const rotatedWidth = tempImg.width * cos + tempImg.height * sin
      const rotatedHeight = tempImg.width * sin + tempImg.height * cos

      canvas.width = rotatedWidth
      canvas.height = rotatedHeight

      ctx.save()
      ctx.translate(rotatedWidth / 2, rotatedHeight / 2)
      ctx.rotate(rad)
      ctx.drawImage(tempImg, -tempImg.width / 2, -tempImg.height / 2)
      ctx.restore()

      const cropCanvas = document.createElement("canvas")
      const cropCtx = cropCanvas.getContext("2d")
      if (!cropCtx) return

      cropCanvas.width = cropArea.width
      cropCanvas.height = cropArea.height

      cropCtx.drawImage(
        canvas,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height,
      )

      cropCanvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            onCropComplete({
              croppedImage: url,
              croppedBlob: blob,
              rotation: 0,
            })
          }
        },
        "image/jpeg",
        0.92,
      )
    }
  }

  const containerRect = containerRef.current?.getBoundingClientRect()
  const containerWidth = containerRect?.width || 400
  const containerHeight = containerRect?.height || 400

  const scaleX = containerWidth / rotatedBoundingBox.width
  const scaleY = containerHeight / rotatedBoundingBox.height
  const scale = Math.min(scaleX, scaleY) * zoom

  const displayWidth = imageDimensions.width * scale
  const displayHeight = imageDimensions.height * scale

  const rotatedDisplayWidth = rotatedBoundingBox.width * scale
  const rotatedDisplayHeight = rotatedBoundingBox.height * scale
  const offsetX = (containerWidth - rotatedDisplayWidth) / 2
  const offsetY = (containerHeight - rotatedDisplayHeight) / 2

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-black/80">
        <button onClick={onBack} className="flex items-center gap-2 text-white hover:text-blue-300">
          <ArrowLeft className="w-5 h-5" />
          <span>Cancel</span>
        </button>
        <h2 className="font-bold text-lg">Edit</h2>
        <button onClick={handleSave} className="text-blue-400 font-medium hover:text-blue-300">
          Done
        </button>
      </div>

      {/* Crop Area */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 bg-black overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <div
          ref={imageRef}
          className="absolute"
          style={{
            width: displayWidth,
            height: displayHeight,
            left: offsetX + (rotatedDisplayWidth - displayWidth) / 2,
            top: offsetY + (rotatedDisplayHeight - displayHeight) / 2,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
        >
          <img
            src={processedImage || image.src}
            alt="Crop source"
            className="absolute select-none"
            style={{
              width: displayWidth,
              height: displayHeight,
              left: 0,
              top: 0,
            }}
            draggable={false}
          />
        </div>

        <div
          className="absolute border-2 border-white border-opacity-80 pointer-events-none"
          style={{
            left: offsetX + cropArea.x * scale,
            top: offsetY + cropArea.y * scale,
            width: cropArea.width * scale,
            height: cropArea.height * scale,
          }}
        >
          <div className="absolute inset-0">
            {[...Array(2)].map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 border-l border-white border-opacity-30"
                style={{ left: `${(i + 1) * 33.33}%` }}
              />
            ))}
            {[...Array(2)].map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 border-t border-white border-opacity-30"
                style={{ top: `${(i + 1) * 33.33}%` }}
              />
            ))}
          </div>

          <div
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center z-10 pointer-events-auto cursor-move"
            style={{ touchAction: "none" }}
            onMouseDown={(e) => handleDragStart(e, "move")}
            onTouchStart={(e) => handleDragStart(e, "move")}
          >
            <div className="w-6 h-6 rounded-full bg-white/80"></div>
          </div>

          {(["nw", "ne", "sw", "se"] as const).map((pos) => (
            <div
              key={pos}
              className="absolute w-8 h-8 bg-white rounded-full border-2 border-white shadow-lg pointer-events-auto cursor-pointer"
              style={{
                top: pos.includes("n") ? "-16px" : "auto",
                bottom: pos.includes("s") ? "-16px" : "auto",
                left: pos.includes("w") ? "-16px" : "auto",
                right: pos.includes("e") ? "-16px" : "auto",
                touchAction: "none",
              }}
              onMouseDown={(e) => handleDragStart(e, pos)}
              onTouchStart={(e) => handleDragStart(e, pos)}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/80 p-4 space-y-5">
        {/* ROTATE BUTTON - ABOVE RATIOS */}
        <div className="flex justify-center">
          <button
            onClick={rotateImage}
            className="flex flex-col items-center gap-1.5 text-white hover:text-blue-300 active:scale-95 transition-transform"
            aria-label="Rotate image 90 degrees"
          >
            <div className="w-12 h-12 flex items-center justify-center bg-gray-800 rounded-full">
              <RotateIcon className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium">Rotate</span>
          </button>
        </div>

        {/* Aspect Ratios */}
        <div className="flex justify-center gap-2 flex-wrap">
          {printRatios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => handleRatioSelect(ratio)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium min-w-[60px] transition-colors ${
                selectedRatio === ratio.label
                  ? "bg-white text-black"
                  : "bg-gray-700 text-white active:bg-gray-600 hover:bg-gray-600"
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        {/* SLIDERS - BELOW RATIOS */}
        <div className="space-y-4">
          {/* Zoom Slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">Zoom</span>
              <span className="text-xs text-gray-400">{zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-2.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 touch-manipulation"
            />
          </div>

          {/* Rotation Slider */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">Rotation</span>
              <span className="text-xs text-gray-400">{rotation.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="-45"
              max="45"
              step="0.5"
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full h-2.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 touch-manipulation"
            />
          </div>

          {/* Auto-Straighten (optional but helpful) */}
          <div className="flex justify-center">
            <button
              onClick={autoStraighten}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              <AutoStraightenIcon className="w-4 h-4" />
              Reset Rotation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Cropper