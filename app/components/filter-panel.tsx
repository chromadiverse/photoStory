'use client'

import { useState, useRef } from 'react'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'

interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
}

interface FilterSettings {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
}

interface FilterPanelProps {
  imageData: CroppedImageData
  filterSettings: FilterSettings
  onFilterChange: (settings: FilterSettings) => void
  onComplete: (processedImageData: CroppedImageData) => void
  onBack: () => void
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  imageData,
  filterSettings,
  onFilterChange,
  onComplete,
  onBack
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const applyFilters = () => {
    const { brightness, contrast, saturation, temperature } = filterSettings
    
    // Convert temperature (-100 to +100) to sepia and hue-rotate
    // Negative = cooler (blue), Positive = warmer (orange/yellow)
    let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    
    if (temperature > 0) {
      // Warm: use sepia for warmth
      const sepiaAmount = temperature / 2 // 0-50%
      const hueShift = -temperature * 0.3 // slight orange shift
      filterString += ` sepia(${sepiaAmount}%) hue-rotate(${hueShift}deg)`
    } else if (temperature < 0) {
      // Cool: shift toward blue
      const hueShift = Math.abs(temperature) * 1.8 // shift toward blue (180-240deg range)
      filterString += ` hue-rotate(${hueShift}deg)`
    }
    
    return filterString
  }

  const resetFilters = () => {
    onFilterChange({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      temperature: 0
    })
  }

  const handleSliderChange = (property: keyof FilterSettings, value: number) => {
    onFilterChange({
      ...filterSettings,
      [property]: value
    })
  }

  const processImageWithFilters = async (): Promise<CroppedImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        canvas.width = img.width
        canvas.height = img.height

        // Apply CSS filters to canvas context
        ctx.filter = applyFilters()
        
        // Draw the image with filters applied
        ctx.drawImage(img, 0, 0, img.width, img.height)
        
        // Convert back to blob
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            resolve({
              croppedImage: url,
              croppedBlob: blob,
              rotation: imageData.rotation
            })
          } else {
            reject(new Error('Failed to create blob'))
          }
        }, 'image/jpeg', 0.95)
      }
      
      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }
      
      img.src = imageData.croppedImage
    })
  }

  const handleComplete = async () => {
    // Check if any filters are applied
    const hasFilters = 
      filterSettings.brightness !== 100 ||
      filterSettings.contrast !== 100 ||
      filterSettings.saturation !== 100 ||
      filterSettings.temperature !== 0

    if (!hasFilters) {
      // No filters applied, return original data
      onComplete(imageData)
      return
    }

    try {
      setIsProcessing(true)
      const processedImageData = await processImageWithFilters()
      onComplete(processedImageData)
    } catch (error) {
      console.error('Error processing image with filters:', error)
      // Fallback to original image data
      onComplete(imageData)
    } finally {
      setIsProcessing(false)
    }
  }

  const getTemperatureLabel = () => {
    if (filterSettings.temperature === 0) return '0'
    const absTemp = Math.abs(filterSettings.temperature)
    return filterSettings.temperature > 0 ? `+${absTemp}` : `-${absTemp}`
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-sm px-4 py-3 flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors font-medium"
          disabled={isProcessing}
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-lg">Back</span>
        </button>
        <h2 className="text-gray-800 text-lg font-bold">Apply Filters</h2>
        <button 
          onClick={handleComplete} 
          disabled={isProcessing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Check className="w-5 h-5" />
          <span className="text-lg">
            {isProcessing ? 'Processing...' : 'Done'}
          </span>
        </button>
      </div>

      {/* Image Preview */}
      <div className="flex-1 flex items-center justify-center p-4 bg-white/60">
        <div className="relative max-w-full max-h-full">
          <img
            src={imageData.croppedImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            style={{ filter: applyFilters() }}
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
              <div className="text-white text-lg font-medium">Processing filters...</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white/90 backdrop-blur-sm shadow-sm p-4 space-y-4 max-h-80 overflow-y-auto">
        {/* Brightness */}
        <div className="space-y-2">
          <div className="flex justify-between items-center min-h-[24px]">
            <label className="text-sm font-medium text-gray-700">
              Brightness
            </label>
            <span className="text-sm text-gray-600 font-mono w-12 text-right">
              {filterSettings.brightness}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.brightness}
            onChange={(e) => handleSliderChange('brightness', Number(e.target.value))}
            disabled={isProcessing}
            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-2">
          <div className="flex justify-between items-center min-h-[24px]">
            <label className="text-sm font-medium text-gray-700">
              Contrast
            </label>
            <span className="text-sm text-gray-600 font-mono w-12 text-right">
              {filterSettings.contrast}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.contrast}
            onChange={(e) => handleSliderChange('contrast', Number(e.target.value))}
            disabled={isProcessing}
            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Saturation */}
        <div className="space-y-2">
          <div className="flex justify-between items-center min-h-[24px]">
            <label className="text-sm font-medium text-gray-700">
              Saturation
            </label>
            <span className="text-sm text-gray-600 font-mono w-12 text-right">
              {filterSettings.saturation}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.saturation}
            onChange={(e) => handleSliderChange('saturation', Number(e.target.value))}
            disabled={isProcessing}
            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Temperature (Warm/Cool) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center min-h-[24px]">
            <label className="text-sm font-medium text-gray-700">
              Temperature
            </label>
            <span className="text-sm text-gray-600 font-mono w-12 text-right">
              {getTemperatureLabel()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-500 font-medium w-10">Cool</span>
            <input
              type="range"
              min="-100"
              max="100"
              value={filterSettings.temperature}
              onChange={(e) => handleSliderChange('temperature', Number(e.target.value))}
              disabled={isProcessing}
              className="flex-1 h-3 bg-gradient-to-r from-blue-200 via-gray-200 to-orange-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
            />
            <span className="text-xs text-orange-500 font-medium w-10 text-right">Warm</span>
          </div>
        </div>

        {/* Reset Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={resetFilters}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white/60 hover:bg-white/80 disabled:bg-gray-100 text-gray-700 disabled:text-gray-400 border border-gray-200 rounded-lg transition-colors touch-manipulation font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset All Filters</span>
          </button>
        </div>
      </div>

      {/* Hidden canvas for processing */}
      <canvas 
        ref={canvasRef} 
        className="hidden" 
      />
    </div>
  )
}

export default FilterPanel