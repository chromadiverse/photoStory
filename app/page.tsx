'use client'

import { useState } from 'react'
import CameraView from './components/camera-view' 
import Cropper from './components/cropper' 
import FilterPanel from './components/filter-panel' 
import Preview from './components/preview' 
import WelcomeModal from './components/welcome-modal'  // ADD THIS IMPORT
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
  const [showWelcomeModal, setShowWelcomeModal] = useState(true)  // ADD THIS STATE
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

  // ADD THIS FUNCTION
  const handleCloseModal = () => {
    setShowWelcomeModal(false)
  }

const renderNavigation = () => (
  <div className="flex justify-center space-x-2 p-4 bg-white/90 backdrop-blur-sm shadow-sm">
    <button
      onClick={() => setCurrentView('camera')}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
        currentView === 'camera' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
      } text-white transition-colors`}
      disabled={!capturedImage && currentView !== 'camera'}
    >
      <Camera className="w-5 h-5" />
      <span>Camera</span>
    </button>
    <button
      onClick={() => setCurrentView('crop')}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
        currentView === 'crop' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
      } text-white transition-colors`}
      disabled={!capturedImage}
    >
      <Edit3 className="w-5 h-5" />
      <span>Crop</span>
    </button>
    <button
      onClick={() => setCurrentView('filter')}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
        currentView === 'filter' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
      } text-white transition-colors`}
      disabled={!croppedImageData}
    >
      <Sliders className="w-5 h-5" />
      <span>Filters</span>
    </button>
    <button
      onClick={() => setCurrentView('preview')}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
        currentView === 'preview' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
      } text-white transition-colors`}
      disabled={!croppedImageData}
    >
      <Eye className="w-5 h-5" />
      <span>Preview</span>
    </button>
  </div>
)

return (
  <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    {/* ADD THE WELCOME MODAL HERE */}
    <WelcomeModal 
      isVisible={showWelcomeModal} 
      onClose={handleCloseModal}
    />
    
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