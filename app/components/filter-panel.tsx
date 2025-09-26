'use client'

import { useState, useRef } from 'react'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { CroppedImageData, FilterSettings } from '../page'

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
    const { brightness, contrast, saturation, hue, grayscale } = filterSettings
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg) grayscale(${grayscale}%)`
  }

  const resetFilters = () => {
    onFilterChange({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      grayscale: 0
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
      filterSettings.hue !== 0 ||
      filterSettings.grayscale !== 0

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

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center space-x-2 text-white hover:text-blue-400 transition-colors"
          disabled={isProcessing}
        >
          <ArrowLeft size={20} />
          <span className="text-lg">Back</span>
        </button>
        <h2 className="text-white text-lg font-medium">Apply Filters</h2>
        <button 
          onClick={handleComplete} 
          disabled={isProcessing}
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Check size={20} />
          <span className="text-lg">
            {isProcessing ? 'Processing...' : 'Done'}
          </span>
        </button>
      </div>

      {/* Image Preview */}
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-800">
        <div className="relative max-w-full max-h-full">
          <img
            src={imageData.croppedImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            style={{ filter: applyFilters() }}
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
              <div className="text-white text-lg">Processing filters...</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-80 overflow-y-auto">
        {/* Brightness */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-300">
              Brightness
            </label>
            <span className="text-sm text-gray-400">
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
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-300">
              Contrast
            </label>
            <span className="text-sm text-gray-400">
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
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Saturation */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-300">
              Saturation
            </label>
            <span className="text-sm text-gray-400">
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
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Warmth (Hue) */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-300">
              Warmth
            </label>
            <span className="text-sm text-gray-400">
              {filterSettings.hue > 0 ? '+' : ''}{filterSettings.hue}°
            </span>
          </div>
          <input
            type="range"
            min="-180"
            max="180"
            value={filterSettings.hue}
            onChange={(e) => handleSliderChange('hue', Number(e.target.value))}
            disabled={isProcessing}
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Grayscale */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-300">
              Grayscale
            </label>
            <span className="text-sm text-gray-400">
              {filterSettings.grayscale}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={filterSettings.grayscale}
            onChange={(e) => handleSliderChange('grayscale', Number(e.target.value))}
            disabled={isProcessing}
            className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
          />
        </div>

        {/* Reset Button */}
        <div className="pt-4 border-t border-gray-700">
          <button
            onClick={resetFilters}
            disabled={isProcessing}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors touch-manipulation"
          >
            <RotateCcw size={16} />
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