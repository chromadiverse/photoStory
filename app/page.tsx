'use client'

import { useState, useEffect } from 'react'
import { createClient } from './lib/supabase/client' 
import { useRouter } from 'next/navigation'
import CameraView from './components/camera-view' 
import Cropper from './components/cropper' 
import FilterPanel from './components/filter-panel' 
import Preview from './components/preview' 
import WelcomeModal from './components/welcome-modal'
import { Camera, Edit3, Sliders, Eye, LogOut, User, ArrowLeft } from 'lucide-react'
import { FilterSettings } from './utils/filters'

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

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('camera')
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null)
  const [croppedImageData, setCroppedImageData] = useState<CroppedImageData | null>(null)
  const [filteredImageData, setFilteredImageData] = useState<CroppedImageData | null>(null) // NEW: Store filtered image separately
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
    setFilteredImageData(null) // Reset filtered image when new crop comes in
    setCurrentView('filter')
  }

  const handleFilterComplete = (processedData: CroppedImageData) => {
    // Store the filtered image data separately
    setFilteredImageData(processedData)
    setCurrentView('preview')
  }

  const handleStartOver = () => {
    setCapturedImage(null)
    setCroppedImageData(null)
    setFilteredImageData(null) // Clear filtered image too
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

  // Get the appropriate icon based on current view
  const getIconForView = () => {
    switch(currentView) {
      case 'camera': return <Camera className="w-8 h-8" />;
      case 'crop': return <Edit3 className="w-8 h-8" />;
      case 'filter': return <Sliders className="w-8 h-8" />;
      case 'preview': return <Eye className="w-8 h-8" />;
      default: return <Camera className="w-8 h-8" />;
    }
  };

  const renderNavigation = () => (
    <div className="flex justify-between items-center p-4 bg-white/90 backdrop-blur-sm shadow-sm">
      <button
        onClick={() => {
          if (currentView === 'camera') return;
          if (currentView === 'crop') setCurrentView('camera');
          if (currentView === 'filter') setCurrentView('crop');
          if (currentView === 'preview') setCurrentView('filter');
        }}
        className={`p-2 rounded-lg ${
          currentView === 'camera' ? 'text-gray-400' : 'text-gray-600 hover:bg-gray-100'
        } transition-colors`}
        disabled={currentView === 'camera'}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      
      {/* Centered animated icon */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
            <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center animate-ping opacity-30 absolute"></div>
            <div className="relative z-10 text-blue-600">
              {getIconForView()}
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-10"></div> {/* Spacer for alignment */}
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
        
        {currentView === 'preview' && filteredImageData && ( 
          <Preview
            imageData={filteredImageData} 
            onStartOver={handleStartOver}
            onBack={() => setCurrentView('filter')}
          />
        )}
      </div>
    </main>
  )
}