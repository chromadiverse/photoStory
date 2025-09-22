'use client'

import { useState } from 'react'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { CroppedImageData, FilterSettings } from '../page'

interface FilterPanelProps {
  imageData: CroppedImageData
  filterSettings: FilterSettings
  onFilterChange: (settings: FilterSettings) => void
  onComplete: () => void
  onBack: () => void
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  imageData,
  filterSettings,
  onFilterChange,
  onComplete,
  onBack
}) => {
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

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Image Preview */}
      <div className="flex-1 flex items-center justify-center p-4">
        <img
          src={imageData.croppedImage}
          alt="Preview"
          className="max-w-full max-h-full object-contain"
          style={{ filter: applyFilters() }}
        />
      </div>

      {/* Filter Controls */}
      <div className="bg-gray-900 p-4 space-y-4 max-h-80 overflow-y-auto">
        {/* Brightness */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Brightness: {filterSettings.brightness}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.brightness}
            onChange={(e) => handleSliderChange('brightness', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Contrast: {filterSettings.contrast}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.contrast}
            onChange={(e) => handleSliderChange('contrast', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
        </div>

        {/* Saturation */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Saturation: {filterSettings.saturation}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={filterSettings.saturation}
            onChange={(e) => handleSliderChange('saturation', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
        </div>

        {/* Warmth (Hue) */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Warmth: {filterSettings.hue}°
          </label>
          <input
            type="range"
            min="-180"
            max="180"
            value={filterSettings.hue}
            onChange={(e) => handleSliderChange('hue', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
        </div>

        {/* Grayscale */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Grayscale: {filterSettings.grayscale}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={filterSettings.grayscale}
            onChange={(e) => handleSliderChange('grayscale', Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
        </div>

        {/* Reset Button */}
        <button
          onClick={resetFilters}
          className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
        >
          <RotateCcw size={16} />
          <span>Reset Filters</span>
        </button>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4">
          <button onClick={onBack} className="btn-secondary flex items-center space-x-2">
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <button onClick={onComplete} className="btn-primary flex items-center space-x-2">
            <Check size={20} />
            <span>Apply Filters</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilterPanel