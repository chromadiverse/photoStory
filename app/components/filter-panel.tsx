'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Check, RotateCcw, ChevronDown, ChevronUp, X } from 'lucide-react'
import { getCssFilterString, applyFiltersToCanvas, FilterSettings } from '../utils/filters'

interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
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
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  const [imageScale, setImageScale] = useState(1)

  useEffect(() => {
    if (isFiltersExpanded) {
      setImageScale(0.85)
    } else {
      setImageScale(1)
    }
  }, [isFiltersExpanded])

  const sliderStyles = `
    .slider-enhanced::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #3b82f6;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      border: 3px solid white;
    }
    
    .slider-enhanced::-moz-range-thumb {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #3b82f6;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      border: 3px solid white;
    }
    
    .slider-enhanced:active::-webkit-slider-thumb {
      width: 36px;
      height: 36px;
      box-shadow: 0 3px 12px rgba(59,130,246,0.5);
    }
    
    .slider-enhanced:active::-moz-range-thumb {
      width: 36px;
      height: 36px;
      box-shadow: 0 3px 12px rgba(59,130,246,0.5);
    }
  `
 const applyFilters = () => {
    return getCssFilterString(filterSettings)
  }

  const resetFilters = () => {
    onFilterChange({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0
    })
  }

  const handleSliderChange = (property: keyof FilterSettings, value: number) => {
    onFilterChange({
      ...filterSettings,
      [property]: value
    })
  }

  // FIXED: Proper canvas filter processing
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

        // Set canvas dimensions to match the image
        canvas.width = img.width
        canvas.height = img.height

        // Apply filters using the canvas filter property
        ctx.filter = getCanvasFilterStringFixed(filterSettings)
        
        // Draw the image with filters applied
        ctx.drawImage(img, 0, 0)
        
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
      
      img.onerror = (error) => {
        console.error('Image load error:', error)
        reject(new Error('Failed to load image'))
      }
      
      img.src = imageData.croppedImage
    })
  }

  // FIXED: Correct canvas filter string function
  const getCanvasFilterStringFixed = (filterSettings: FilterSettings): string => {
    const { brightness, contrast, saturation, hue } = filterSettings
    
    // Canvas filter uses different syntax than CSS:
    const brightnessValue = brightness / 100
    const contrastValue = contrast / 100
    const saturationValue = saturation / 100
    
    return `brightness(${brightnessValue}) contrast(${contrastValue}) saturate(${saturationValue}) hue-rotate(${hue}deg)`
  }

  const handleComplete = async () => {
    try {
      setIsProcessing(true)
      
      const processedImageData = await processImageWithFilters()
      onComplete(processedImageData)
    } catch (error) {
      console.error('Error processing image with filters:', error)
      // Fallback: Try alternative method
      try {
        const fallbackData = await processImageWithFiltersFallback()
        onComplete(fallbackData)
      } catch (fallbackError) {
        console.error('Fallback processing also failed:', fallbackError)
        // Last resort: use original image but log warning
        console.warn('Using original image data as final fallback')
        onComplete(imageData)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Alternative method using direct canvas manipulation
  const processImageWithFiltersFallback = async (): Promise<CroppedImageData> => {
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

        // Draw original image first
        ctx.drawImage(img, 0, 0)
        
        // Get image data and apply filters manually
        const canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = canvasImageData.data
        
        // Apply brightness and contrast manually
        const brightnessFactor = (filterSettings.brightness - 100) / 100
        const contrastFactor = (filterSettings.contrast - 100) / 100
        
        for (let i = 0; i < data.length; i += 4) {
          // Brightness
          data[i] = Math.min(255, Math.max(0, data[i] + (255 * brightnessFactor)))     // R
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (255 * brightnessFactor))) // G
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (255 * brightnessFactor))) // B
          
          // Contrast
          const factor = (259 * (contrastFactor + 255)) / (255 * (259 - contrastFactor))
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128))     // R
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128)) // G
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128)) // B
        }
        
        ctx.putImageData(canvasImageData, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            resolve({
              croppedImage: url,
              croppedBlob: blob,
              rotation: imageData.rotation
            })
          } else {
            reject(new Error('Failed to create blob in fallback'))
          }
        }, 'image/jpeg', 0.95)
      }
      
      img.onerror = () => reject(new Error('Failed to load image in fallback'))
      img.src = imageData.croppedImage
    })
  }
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden">
      <style>{sliderStyles}</style>
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0">
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
      <div 
        className="flex items-center justify-center p-4 bg-white/60 transition-all duration-500 ease-in-out flex-shrink-0"
        style={{ 
          height: isFiltersExpanded ? '40%' : '70%',
          minHeight: 0
        }}
      >
        <div className="relative max-w-full max-h-full">
          <img
            src={imageData.croppedImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg transition-transform duration-500 ease-in-out"
            style={{ 
              filter: applyFilters(),
              transform: `scale(${imageScale})`
            }}
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
              <div className="text-white text-lg font-medium">Processing filters...</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Controls Container */}
      <div className="bg-white/90 backdrop-blur-sm shadow-sm flex-grow overflow-hidden flex flex-col">
        {/* Filter Controls */}
        <div 
          className="overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent transition-all duration-500 ease-in-out relative"
          style={{ 
            maxHeight: isFiltersExpanded ? '60vh' : '0',
            opacity: isFiltersExpanded ? 1 : 0,
            flex: isFiltersExpanded ? '1' : '0',
            minHeight: 0
          }}
        >
          {isFiltersExpanded && (
            <button
              onClick={() => setIsFiltersExpanded(false)}
              className="absolute top-1 right-4 z-10 w-8 h-8 flex items-center justify-center bg-blue-400 hover:bg-white text-black rounded-full shadow-md hover:text-gray-900 transition-colors"
              aria-label="Close filters"
              disabled={isProcessing}
            >
              <X className="w-5 h-5" />
            </button>
          )}
          
          <div className="p-6 space-y-8">
            {/* Brightness */}
            <div className="space-y-4 px-2 mt-2">
              <div className="flex justify-between items-center min-h-[32px]">
                <label className="text-base font-semibold text-gray-700">
                  Brightness
                </label>
                <span className="text-base text-gray-600 font-mono w-16 text-right">
                  {filterSettings.brightness}%
                </span>
              </div>
              <div className="py-2" style={{ touchAction: 'none' }}>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filterSettings.brightness}
                  onChange={(e) => handleSliderChange('brightness', Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-10 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-enhanced"
                  style={{
                    WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(filterSettings.brightness / 200) * 100}%, #e5e7eb ${(filterSettings.brightness / 200) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
            </div>

            {/* Contrast */}
            <div className="space-y-4 px-2">
              <div className="flex justify-between items-center min-h-[32px]">
                <label className="text-base font-semibold text-gray-700">
                  Contrast
                </label>
                <span className="text-base text-gray-600 font-mono w-16 text-right">
                  {filterSettings.contrast}%
                </span>
              </div>
              <div className="py-2" style={{ touchAction: 'none' }}>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filterSettings.contrast}
                  onChange={(e) => handleSliderChange('contrast', Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-10 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-enhanced"
                  style={{
                    WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(filterSettings.contrast / 200) * 100}%, #e5e7eb ${(filterSettings.contrast / 200) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
            </div>

            {/* Saturation */}
            <div className="space-y-4 px-2">
              <div className="flex justify-between items-center min-h-[32px]">
                <label className="text-base font-semibold text-gray-700">
                  Saturation
                </label>
                <span className="text-base text-gray-600 font-mono w-16 text-right">
                  {filterSettings.saturation}%
                </span>
              </div>
              <div className="py-2" style={{ touchAction: 'none' }}>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filterSettings.saturation}
                  onChange={(e) => handleSliderChange('saturation', Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-10 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-enhanced"
                  style={{
                    WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(filterSettings.saturation / 200) * 100}%, #e5e7eb ${(filterSettings.saturation / 200) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
            </div>

            {/* Hue */}
            <div className="space-y-4 px-2">
              <div className="flex justify-between items-center min-h-[32px]">
                <label className="text-base font-semibold text-gray-700">
                  Hue
                </label>
                <span className="text-base text-gray-600 font-mono w-16 text-right">
                  {filterSettings.hue > 0 ? '+' : ''}{filterSettings.hue}°
                </span>
              </div>
              <div className="py-2" style={{ touchAction: 'none' }}>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={filterSettings.hue}
                  onChange={(e) => handleSliderChange('hue', Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-10 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-enhanced"
                  style={{
                    WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((filterSettings.hue + 180) / 360) * 100}%, #e5e7eb ${((filterSettings.hue + 180) / 360) * 100}%, #e5e7eb 100%)`
                  }}
                />
              </div>
            </div>

            {/* Reset Button */}
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={resetFilters}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 disabled:text-gray-400 border-2 border-gray-300 rounded-lg transition-colors touch-manipulation font-semibold text-base"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Reset All Filters</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Toggle Button - Always Visible */}
        <div className="flex-shrink-0">
          {isFiltersExpanded ? (
            <button
              onClick={() => setIsFiltersExpanded(false)}
              className="w-full py-3 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              disabled={isProcessing}
            >
              <ChevronUp className="w-5 h-5" />
              <span>Minimize Filters</span>
            </button>
          ) : (
            <button
              onClick={() => setIsFiltersExpanded(true)}
              className="w-full py-3 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              disabled={isProcessing}
            >
              <span>Filters</span>
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div> 
  )
}

export default FilterPanel