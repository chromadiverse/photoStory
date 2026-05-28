"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { ArrowLeft, RotateCw, ArrowRight, Maximize2, Move } from "lucide-react"

interface CapturedImage {
  src: string
  timestamp?: number
}

interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
}

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

const ASPECT_PRESETS = [
  { label: "Free", value: null },
  { label: "3:2", value: 3 / 2 },
  { label: "5:4", value: 5 / 4 },
  { label: "7:5", value: 7 / 5 },
  { label: "1:1", value: 1 },
]

const Cropper: React.FC<CropperProps> = ({ image, onCropComplete, onBack }) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 })
  const [rotation, setRotation] = useState(0)
  const [rotation90, setRotation90] = useState(0)
  const [zoom, setZoom] = useState(1)
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
  const [currentImageSrc, setCurrentImageSrc] = useState<string>("")
  const [originalImageSrc, setOriginalImageSrc] = useState<string>("")

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  const effectiveAspect = useMemo(() => {
    if (aspect === null) return null
    return (rotation90 % 180 === 0) ? aspect : 1 / aspect
  }, [aspect, rotation90])

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      setImageDimensions({ width, height })
      setOriginalImageSrc(image.src)
      setCurrentImageSrc(image.src)
      setImageLoaded(true)

      setCropArea({
        x: width * 0.1,
        y: height * 0.1,
        width: width * 0.8,
        height: height * 0.8,
      })
    }
    img.src = image.src
  }, [image.src])

  const rotateImageBy90 = useCallback(async (imgSrc: string, degrees: number) => {
    return new Promise<string>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(imgSrc)
          return
        }

        if (degrees === 90 || degrees === 270) {
          canvas.width = img.height
          canvas.height = img.width
        } else {
          canvas.width = img.width
          canvas.height = img.height
        }

        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((degrees * Math.PI) / 180)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
        ctx.restore()

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              resolve(url)
            } else {
              resolve(imgSrc)
            }
          },
          "image/jpeg",
          0.95
        )
      }
      img.src = imgSrc
    })
  }, [])

  const resizeImageToRatio = useCallback(
    async (targetRatio: number | null, baseImageSrc: string, currentWidth: number, currentHeight: number) => {
      if (targetRatio === null) {
        setImageDimensions({ width: currentWidth, height: currentHeight })
        setCropArea({
          x: 0,
          y: 0,
          width: currentWidth,
          height: currentHeight,
        })
        return baseImageSrc
      }

      const originalRatio = currentWidth / currentHeight

      let newWidth: number, newHeight: number

      if (originalRatio > targetRatio) {
        newWidth = currentWidth
        newHeight = currentWidth / targetRatio
      } else {
        newHeight = currentHeight
        newWidth = currentHeight * targetRatio
      }

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return baseImageSrc

      canvas.width = newWidth
      canvas.height = newHeight
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, newWidth, newHeight)

      const tempImg = new Image()
      tempImg.src = baseImageSrc
      await new Promise<void>((resolve) => (tempImg.onload = () => resolve()))

      const offsetX = (newWidth - currentWidth) / 2
      const offsetY = (newHeight - currentHeight) / 2
      ctx.drawImage(tempImg, offsetX, offsetY, currentWidth, currentHeight)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95))
      if (blob) {
        const url = URL.createObjectURL(blob)
        setImageDimensions({ width: newWidth, height: newHeight })
        setCropArea({ x: 0, y: 0, width: newWidth, height: newHeight })
        return url
      }
      return baseImageSrc
    },
    [],
  )

  const handleRatioSelect = async (ratioOption: (typeof ASPECT_PRESETS)[0]) => {
    setSelectedRatio(ratioOption.label)
    setAspect(ratioOption.value)

    if (ratioOption.value === null) {
      setCurrentImageSrc(originalImageSrc)
      setImageDimensions({ width: imageDimensions.width, height: imageDimensions.height })
      setCropArea({
        x: imageDimensions.width * 0.1,
        y: imageDimensions.height * 0.1,
        width: imageDimensions.width * 0.8,
        height: imageDimensions.height * 0.8,
      })
      return
    }

    const newSrc = await resizeImageToRatio(
      ratioOption.value,
      currentImageSrc,
      imageDimensions.width,
      imageDimensions.height
    )
    setCurrentImageSrc(newSrc)
  }

  const fitImageToContainer = useCallback(() => {
    setZoom(1)
    setRotation(0)
    setCropArea({
      x: imageDimensions.width * 0.1,
      y: imageDimensions.height * 0.1,
      width: imageDimensions.width * 0.8,
      height: imageDimensions.height * 0.8,
    })
  }, [imageDimensions])

  const resetCropArea = useCallback(() => {
    setCropArea({
      x: imageDimensions.width * 0.1,
      y: imageDimensions.height * 0.1,
      width: imageDimensions.width * 0.8,
      height: imageDimensions.height * 0.8,
    })
  }, [imageDimensions])

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
      
      const rad = (rotation * Math.PI) / 180
      const sin = Math.abs(Math.sin(rad))
      const cos = Math.abs(Math.cos(rad))
      const rotatedWidth = imageDimensions.width * cos + imageDimensions.height * sin
      const rotatedHeight = imageDimensions.width * sin + imageDimensions.height * cos

      const scaleX = containerWidth / rotatedWidth
      const scaleY = containerHeight / rotatedHeight
      const scale = Math.min(scaleX, scaleY) * zoom

      const imageDeltaX = deltaX / scale
      const imageDeltaY = deltaY / scale

      const newCrop = { ...dragState.initialCrop }

      if (effectiveAspect && dragState.dragType !== "move") {
        switch (dragState.dragType) {
          case "nw":
            const newWidthNw = dragState.initialCrop.width - imageDeltaX
            const newHeightNw = newWidthNw / effectiveAspect
            
            newCrop.x = dragState.initialCropStart.x + imageDeltaX
            newCrop.y = dragState.initialCropStart.y + (dragState.initialCrop.height - newHeightNw)
            newCrop.width = newWidthNw
            newCrop.height = newHeightNw
            break
            
          case "ne":
            const newWidthNe = dragState.initialCrop.width + imageDeltaX
            const newHeightNe = newWidthNe / effectiveAspect
            
            newCrop.y = dragState.initialCropStart.y + (dragState.initialCrop.height - newHeightNe)
            newCrop.width = newWidthNe
            newCrop.height = newHeightNe
            break
            
          case "sw":
            const newWidthSw = dragState.initialCrop.width - imageDeltaX
            const newHeightSw = newWidthSw / effectiveAspect
            
            newCrop.x = dragState.initialCropStart.x + imageDeltaX
            newCrop.width = newWidthSw
            newCrop.height = newHeightSw
            break
            
          case "se":
            const newWidthSe = dragState.initialCrop.width + imageDeltaX
            const newHeightSe = newWidthSe / effectiveAspect
            
            newCrop.width = newWidthSe
            newCrop.height = newHeightSe
            break
        }
      } else {
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
        }
      }

      const minSize = 50
      newCrop.width = Math.max(minSize, newCrop.width)
      newCrop.height = Math.max(minSize, newCrop.height)
      newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, newCrop.x))
      newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, newCrop.y))
      newCrop.width = Math.min(imageDimensions.width - newCrop.x, newCrop.width)
      newCrop.height = Math.min(imageDimensions.height - newCrop.y, newCrop.height)

      setCropArea(newCrop)
    },
    [dragState, effectiveAspect, imageDimensions, zoom, rotation],
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

  const rotateImage = async () => {
    const newRotation90 = (rotation90 + 90) % 360
    const rotatedSrc = await rotateImageBy90(currentImageSrc, 90)
    
    const img = new Image()
    img.onload = async () => {
      const newWidth = img.width
      const newHeight = img.height
      
      setImageDimensions({ width: newWidth, height: newHeight })
      setCurrentImageSrc(rotatedSrc)
      setRotation90(newRotation90)
      
      if (effectiveAspect) {
        const rotatedRatio = newWidth / newHeight
        if (rotatedRatio > effectiveAspect) {
          const cropHeight = newWidth / effectiveAspect
          const cropY = (newHeight - cropHeight) / 2
          setCropArea({
            x: 0,
            y: Math.max(0, cropY),
            width: newWidth,
            height: Math.min(cropHeight, newHeight),
          })
        } else {
          const cropWidth = newHeight * effectiveAspect
          const cropX = (newWidth - cropWidth) / 2
          setCropArea({
            x: Math.max(0, cropX),
            y: 0,
            width: Math.min(cropWidth, newWidth),
            height: newHeight,
          })
        }
      } else {
        setCropArea({
          x: 0,
          y: 0,
          width: newWidth,
          height: newHeight,
        })
      }
    }
    img.src = rotatedSrc
  }

  const handleSave = async () => {
    const tempImg = new Image()
    tempImg.src = currentImageSrc

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
        0.95,
      )
    }
  }

  const containerRect = containerRef.current?.getBoundingClientRect()
  const containerWidth = containerRect?.width || 400
  const containerHeight = containerRect?.height || 400

  const rad = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const rotatedWidth = imageDimensions.width * cos + imageDimensions.height * sin
  const rotatedHeight = imageDimensions.width * sin + imageDimensions.height * cos

  const scaleX = containerWidth / rotatedWidth
  const scaleY = containerHeight / rotatedHeight
  const scale = Math.min(scaleX, scaleY) * zoom

  const displayWidth = imageDimensions.width * scale
  const displayHeight = imageDimensions.height * scale

  const rotatedDisplayWidth = rotatedWidth * scale
  const rotatedDisplayHeight = rotatedHeight * scale
  const offsetX = (containerWidth - rotatedDisplayWidth) / 2
  const offsetY = (containerHeight - rotatedDisplayHeight) / 2

  if (!imageLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-400 text-lg flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-zinc-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading image...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white">
      <div className="px-4 py-3 flex items-center justify-between bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Cancel</span>
        </button>
        <h2 className="font-bold text-base">Crop Photo</h2>
        <button onClick={handleSave} className="text-blue-400 font-medium hover:text-blue-300 text-sm">
          Done
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 bg-zinc-900 overflow-hidden"
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
            src={currentImageSrc}
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
          className="absolute border-2 border-white shadow-xl pointer-events-none"
          style={{
            left: offsetX + cropArea.x * scale,
            top: offsetY + cropArea.y * scale,
            width: cropArea.width * scale,
            height: cropArea.height * scale,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        >
          <div className="absolute inset-0">
            {[...Array(2)].map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 border-l border-white/20"
                style={{ left: `${(i + 1) * 33.33}%` }}
              />
            ))}
            {[...Array(2)].map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 border-t border-white/20"
                style={{ top: `${(i + 1) * 33.33}%` }}
              />
            ))}
          </div>

          <div
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center cursor-move border-2 border-white/30 z-10"
            style={{ touchAction: "none" }}
            onMouseDown={(e) => handleDragStart(e, "move")}
            onTouchStart={(e) => handleDragStart(e, "move")}
          >
            <Move className="w-6 h-6 text-white/80" />
          </div>

          {(["nw", "ne", "sw", "se"] as const).map((pos) => (
            <div
              key={pos}
              className="absolute w-10 h-10 bg-white rounded-full shadow-lg cursor-pointer flex items-center justify-center"
              style={{
                top: pos.includes("n") ? "-20px" : "auto",
                bottom: pos.includes("s") ? "-20px" : "auto",
                left: pos.includes("w") ? "-20px" : "auto",
                right: pos.includes("e") ? "-20px" : "auto",
                touchAction: "none",
              }}
              onMouseDown={(e) => handleDragStart(e, pos)}
              onTouchStart={(e) => handleDragStart(e, pos)}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${pos.includes("n") && pos.includes("w") || pos.includes("s") && pos.includes("e") ? "bg-zinc-600" : "bg-zinc-400"}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900/95 backdrop-blur-sm p-4 space-y-5 border-t border-zinc-800">
        <div className="flex justify-center gap-2">
          <button
            onClick={rotateImage}
            className="flex flex-col items-center gap-1.5 text-zinc-400 hover:text-white active:scale-95 transition-all"
            aria-label="Rotate image 90 degrees"
          >
            <div className="w-14 h-14 flex items-center justify-center bg-zinc-800 rounded-2xl hover:bg-zinc-700 transition-colors">
              <RotateCw className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium">Rotate</span>
          </button>

          <button
            onClick={fitImageToContainer}
            className="flex flex-col items-center gap-1.5 text-zinc-400 hover:text-white active:scale-95 transition-all"
            aria-label="Fit image to view"
          >
            <div className="w-14 h-14 flex items-center justify-center bg-zinc-800 rounded-2xl hover:bg-zinc-700 transition-colors">
              <Maximize2 className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium">Fit</span>
          </button>
        </div>

        <div className="flex justify-center gap-2 flex-wrap">
          {ASPECT_PRESETS.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => handleRatioSelect(ratio)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold min-w-[56px] transition-all active:scale-95 ${
                selectedRatio === ratio.label
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600"
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-zinc-300">Zoom</span>
              <span className="text-xs text-zinc-500">{zoom.toFixed(1)}x</span>
            </div>
            <div className="relative h-2.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                style={{ width: `${((zoom - 0.3) / (2 - 0.3)) * 100}%` }}
              />
              <input
                type="range"
                min="0.3"
                max="2"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-zinc-300">Rotation</span>
              <span className="text-xs text-zinc-500">{rotation.toFixed(1)}°</span>
            </div>
            <div className="relative h-2.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-1/2 w-1 bg-white rounded-full"
                style={{ left: "50%", transform: "translateX(-50%)" }}
              />
              <input
                type="range"
                min="-45"
                max="45"
                step="0.5"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <button
              onClick={resetCropArea}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              Reset Crop Area
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Cropper