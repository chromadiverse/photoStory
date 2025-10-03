'use client'

import { useState, useEffect } from 'react'
import { createClient } from './lib/supabase/client' 
import { useRouter } from 'next/navigation'
import CameraView from './components/camera-view' 
import Cropper from './components/cropper' 
import FilterPanel from './components/filter-panel' 
import Preview from './components/preview' 
import WelcomeModal from './components/welcome-modal'
import { Camera, Edit3, Sliders, Eye, LogOut, User } from 'lucide-react'

type ViewType = 'camera' | 'crop' | 'filter' | 'preview'

export interface CapturedImage {
  src: string
  blob: Blob
  width: number
  height: number
  detectedCorners?: Array<{ x: number; y: number }>
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
}

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('camera')
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null)
  const [croppedImageData, setCroppedImageData] = useState<CroppedImageData | null>(null)
  const [showWelcomeModal, setShowWelcomeModal] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
  })

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        console.log('Client - User check:', user?.email || 'NOT LOGGED IN')
        
        if (error) {
          console.error('Auth error:', error)
          router.push('/login')
          return
        }
        
        if (!user) {
          console.log('No user found, redirecting...')
          router.push('/login')
          return
        }
        
        setUser(user)
        setLoading(false)
      } catch (err) {
        console.error('Error checking user:', err)
        router.push('/login')
      }
    }

    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', session?.user?.email || 'NO SESSION')
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
    })
    setCurrentView('camera')
  }

  const handleCloseModal = () => {
    setShowWelcomeModal(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const renderNavigation = () => (
    <div className="flex justify-between items-center p-4 bg-white/90 backdrop-blur-sm shadow-sm">
    

      <div className="flex justify-center space-x-2 flex-1">
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

    
    </div>
  )

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
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