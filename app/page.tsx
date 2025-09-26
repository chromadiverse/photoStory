'use client'

import { useState } from 'react'
import CameraView from './components/camera-view' 
import Cropper from './components/cropper' 
import FilterPanel from './components/filter-panel' 
import Preview from './components/preview' 
import { Camera, Edit3, Sliders, Eye } from 'lucide-react'

type ViewType = 'camera' | 'crop' | 'filter' | 'preview'

export interface CapturedImage {
  src: string
  blob: Blob
  width: number
  height: number
  detectedCorners?: Array<{ x: number; y: number }> // NEW: Pass detected corners to cropper
}

export interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
}

export interface FilterSettings {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  grayscale: number
}

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('camera')
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null)
  const [croppedImageData, setCroppedImageData] = useState<CroppedImageData | null>(null)
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    grayscale: 0
  })

  const handleImageCapture = (image: CapturedImage) => {
    setCapturedImage(image)
    setCurrentView('crop')
  }

  const handleCropComplete = (cropData: CroppedImageData) => {
    setCroppedImageData(cropData)
    setCurrentView('filter')
  }

  const handleFilterComplete = () => {
    setCurrentView('preview')
  }

  const handleStartOver = () => {
    setCapturedImage(null)
    setCroppedImageData(null)
    setFilterSettings({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      grayscale: 0
    })
    setCurrentView('camera')
  }

const renderNavigation = () => (
  <header className="bg-white/90 backdrop-blur-sm shadow-sm border-b border-gray-200">
    <div className="container mx-auto px-4 py-4">
      <div className="flex justify-center gap-3 sm:gap-4">
        <button
          onClick={() => setCurrentView('camera')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base ${
            currentView === 'camera' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'bg-white/60 hover:bg-white/80 text-gray-700 border border-gray-200'
          }`}
          disabled={!capturedImage && currentView !== 'camera'}
        >
          <Camera className="w-4 h-4" />
          <span>Camera</span>
        </button>
        <button
          onClick={() => setCurrentView('crop')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base ${
            currentView === 'crop' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : capturedImage
                ? 'bg-white/60 hover:bg-white/80 text-gray-700 border border-gray-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
          }`}
          disabled={!capturedImage}
        >
          <Edit3 className="w-4 h-4" />
          <span>Crop</span>
        </button>
        <button
          onClick={() => setCurrentView('filter')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base ${
            currentView === 'filter' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : croppedImageData
                ? 'bg-white/60 hover:bg-white/80 text-gray-700 border border-gray-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
          }`}
          disabled={!croppedImageData}
        >
          <Sliders className="w-4 h-4" />
          <span>Filters</span>
        </button>
        <button
          onClick={() => setCurrentView('preview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base ${
            currentView === 'preview' 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : croppedImageData
                ? 'bg-white/60 hover:bg-white/80 text-gray-700 border border-gray-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
          }`}
          disabled={!croppedImageData}
        >
          <Eye className="w-4 h-4" />
          <span>Preview</span>
        </button>
      </div>
    </div>
  </header>
)

return (
  <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    {renderNavigation()}
    
    <div className="container mx-auto px-4 py-4 sm:py-6">
      {currentView === 'camera' && (
        <CameraView onImageCapture={handleImageCapture} />
      )}
      
      {currentView === 'crop' && capturedImage && (
        <Cropper
          image={capturedImage}
          onCropComplete={handleCropComplete}
          onBack={() => setCurrentView('camera')}
        />
      )}
      
      {currentView === 'filter' && croppedImageData && (
        <FilterPanel
          imageData={croppedImageData}
          filterSettings={filterSettings}
          onFilterChange={setFilterSettings}
          onComplete={handleFilterComplete}
          onBack={() => setCurrentView('crop')}
        />
      )}
      
      {currentView === 'preview' && croppedImageData && (
        <Preview
          imageData={croppedImageData}
          filterSettings={filterSettings}
          onStartOver={handleStartOver}
          onBack={() => setCurrentView('filter')}
        />
      )}
    </div>
  </main>
)
}