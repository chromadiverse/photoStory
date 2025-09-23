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
    <div className="flex justify-center space-x-2 p-4 bg-gray-800">
      <button
        onClick={() => setCurrentView('camera')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
          currentView === 'camera' ? 'bg-blue-600' : 'bg-gray-600'
        } text-white transition-colors`}
        disabled={!capturedImage && currentView !== 'camera'}
      >
        <Camera size={20} />
        <span>Camera</span>
      </button>
      <button
        onClick={() => setCurrentView('crop')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
          currentView === 'crop' ? 'bg-blue-600' : 'bg-gray-600'
        } text-white transition-colors`}
        disabled={!capturedImage}
      >
        <Edit3 size={20} />
        <span>Crop</span>
      </button>
      <button
        onClick={() => setCurrentView('filter')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
          currentView === 'filter' ? 'bg-blue-600' : 'bg-gray-600'
        } text-white transition-colors`}
        disabled={!croppedImageData}
      >
        <Sliders size={20} />
        <span>Filters</span>
      </button>
      <button
        onClick={() => setCurrentView('preview')}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
          currentView === 'preview' ? 'bg-blue-600' : 'bg-gray-600'
        } text-white transition-colors`}
        disabled={!croppedImageData}
      >
        <Eye size={20} />
        <span>Preview</span>
      </button>
    </div>
  )

  return (
    <main className="min-h-screen bg-black text-white">
      {renderNavigation()}
      
      <div className="h-[calc(100vh-80px)]">
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
