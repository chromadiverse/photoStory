"use client"

import { useState, useEffect, useRef } from "react"
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { useRouter } from "next/navigation"
import CameraView from "./components/camera-view"
import Cropper from "./components/cropper"
import FilterPanel from "./components/filter-panel"
import Preview from "./components/preview"
import WelcomeModal from "./components/welcome-modal"
import ExitConfirmModal from "./components/exit-confirmation-modal"
import { Camera, Sliders, Search, ArrowLeft, Crop } from "lucide-react"
import type { FilterSettings } from "./utils/filters"

type ViewType = "camera" | "crop" | "filter" | "preview"

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
  const [currentView, setCurrentView] = useState<ViewType>("camera")
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null)
  const [croppedImageData, setCroppedImageData] = useState<CroppedImageData | null>(null)
  const [filteredImageData, setFilteredImageData] = useState<CroppedImageData | null>(null)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [dancerId, setDancerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  })
  const router = useRouter()

  const supabase = useRef(createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }
  )).current

  const dancerIdRef = useRef<string | null>(null)

  const safeSetDancerId = (id: string | null) => {
    dancerIdRef.current = id
    setDancerId(id)
  }

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcomeModal")
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          router.push("/login")
          return
        }

        setUser(session.user)

        const { data, error } = await supabase
          .from('dancers')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (error) {
          console.error('[Init] Error:', error)
        } else if (data) {
          safeSetDancerId(data.id)
        }

        if (mounted) setLoading(false)
      } catch (err) {
        console.error('[Init] Exception:', err)
        if (mounted) {
          setLoading(false)
          router.push("/login")
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleImageCapture = (image: CapturedImage) => {
    console.log('[Home] handleImageCapture - blob size:', image.blob.size)
    setCapturedImage(image)
    setCurrentView("crop")
  }

  const handleCropComplete = (cropData: CroppedImageData) => {
    console.log('[Home] handleCropComplete - new URL:', cropData.croppedImage?.substring(0, 50))
    console.log('[Home] handleCropComplete - blob size:', cropData.croppedBlob?.size)
    setCroppedImageData(cropData)
    setFilteredImageData(null)
    setCurrentView("filter")
  }

  const handleFilterComplete = (processedData: CroppedImageData) => {
    console.log('[Home] handleFilterComplete - nueva URL:', processedData.croppedImage?.substring(0, 50))
    console.log('[Home] handleFilterComplete - nuevo blob size:', processedData.croppedBlob?.size)
    setFilteredImageData(processedData)
    setCurrentView("preview")
  }

  const handleStartOver = () => {
    console.log('[Home] handleStartOver - limpiando todo')
    setCapturedImage(null)
    setCroppedImageData(null)
    setFilteredImageData(null)
    setFilterSettings({
      brightness: 100,
      contrast: 100,
      saturation: 100,
    })
    setCurrentView("camera")
  }

  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false)
    localStorage.setItem("hasSeenWelcomeModal", "true")
  }

  const handleGoToGallery = () => {
    setShowExitConfirm(true)
  }

  const confirmExit = () => {
    const id = dancerIdRef.current
    if (id) {
      window.location.href = `https://curtainconnect.com/profiles/${id}/gallery`
    } else {
      console.error("Dancer ID not available")
    }
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

  const getIconForView = () => {
    switch (currentView) {
      case "camera": return <Camera className="w-6 h-6" />
      case "crop": return <Crop className="w-6 h-6" />
      case "filter": return <Sliders className="w-6 h-6" />
      case "preview": return <Search className="w-6 h-6" />
      default: return <Camera className="w-6 h-6" />
    }
  }

  const renderNavigation = () => (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 px-2 py-2 bg-white/90 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            if (currentView === "camera") return
            if (currentView === "crop") setCurrentView("camera")
            if (currentView === "filter") setCurrentView("crop")
            if (currentView === "preview") setCurrentView("filter")
          }}
          className={`p-2 rounded-lg flex-shrink-0 ${
            currentView === "camera" ? "text-gray-300" : "text-gray-600 hover:bg-gray-100"
          } transition-colors`}
          disabled={currentView === "camera"}
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowWelcomeModal(true)}
          className="text-[11px] font-semibold text-white bg-blue-600 px-2.5 py-1.5 rounded-lg shadow-md active:scale-95 active:bg-blue-700 transition-transform leading-tight"
        >
          Helpful Tips
        </button>
      </div>

      <div className="flex items-center justify-center">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
            <div className="w-10 h-10 rounded-full bg-blue-200 animate-ping opacity-30 absolute"></div>
            <div className="relative z-10 text-blue-600">{getIconForView()}</div>
          </div>
        </div>
      </div>

      <button
        onClick={handleGoToGallery}
        className="text-[11px] font-semibold text-white bg-blue-600 px-2.5 py-1.5 rounded-lg shadow-md active:scale-95 active:bg-blue-700 transition-transform leading-tight"
      >
        Back to Profile
      </button>
    </div>
  )

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <WelcomeModal isVisible={showWelcomeModal} onClose={handleCloseWelcomeModal} />
      <ExitConfirmModal
        isVisible={showExitConfirm}
        onConfirm={confirmExit}
        onCancel={() => setShowExitConfirm(false)}
      />

      {renderNavigation()}

      <div className="h-[calc(100vh-80px)]">
        {currentView === "camera" && <CameraView onImageCapture={handleImageCapture} />}

        {currentView === "crop" && capturedImage && (
          <Cropper image={capturedImage} onCropComplete={handleCropComplete} onBack={() => setCurrentView("camera")} />
        )}

        {currentView === "filter" && croppedImageData && (
          <FilterPanel
            imageData={croppedImageData}
            filterSettings={filterSettings}
            onFilterChange={setFilterSettings}
            onComplete={handleFilterComplete}
            onBack={() => setCurrentView("crop")}
          />
        )}

        {currentView === "preview" && filteredImageData && (
          <Preview
            imageData={filteredImageData}
            onStartOver={handleStartOver}
            onBack={() => setCurrentView("filter")}
            userId={dancerId ?? undefined}
          />
        )}
      </div>
    </main>
  )
}