"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "./lib/supabase/client"
import { useRouter } from "next/navigation"
import CameraView from "./components/camera-view"
import Cropper from "./components/cropper"
import FilterPanel from "./components/filter-panel"
import Preview from "./components/preview"
import WelcomeModal from "./components/welcome-modal"
import ExitConfirmModal from "./components/exit-confirmation-modal"
import { Camera, Sliders, Search, ArrowLeft, Crop } from "lucide-react"
import type { FilterSettings } from "./utils/filters"
import { fetchDancerIdByUserId } from "./service/profileService"

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
  const router = useRouter()

  // FIX 1: Stable supabase client — never recreated on re-render
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // FIX 2: Track whether setLoading(false) has already been called so the
  // checkUser + onAuthStateChange race can never both try to resolve loading
  const loadingResolvedRef = useRef(false)
  const resolveLoading = () => {
    if (!loadingResolvedRef.current) {
      loadingResolvedRef.current = true
      setLoading(false)
    }
  }

  // FIX 3: Safety net — if loading is still true after 8 seconds, force it off.
  // This catches any edge case where both paths fail silently on reload.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!loadingResolvedRef.current) {
        console.warn("Loading timeout hit — forcing loading to false")
        resolveLoading()
      }
    }, 8000)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcomeModal")
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const fetchDancer = async (userId: string) => {
      const result = await fetchDancerIdByUserId(supabase, userId)
      if (!mounted) return
      if (result.error) {
        console.error("Error fetching dancer ID:", result.error)
      } else if (result.data) {
        setDancerId(result.data)
      } else {
        console.warn("No dancer found for user")
        setDancerId(null)
      }
    }

    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()

        if (!mounted) return

        if (error || !user) {
          resolveLoading()
          router.push("/login")
          return
        }

        setUser(user)
        await fetchDancer(user.id)

        if (!mounted) return
        resolveLoading()
      } catch (err) {
        console.error("Unexpected error in checkUser:", err)
        if (mounted) {
          resolveLoading()
          router.push("/login")
        }
      }
    }

    // FIX 4: Subscribe BEFORE calling checkUser so we never miss an event,
    // but guard against the INITIAL_SESSION event double-resolving loading
    // by using the loadingResolvedRef check inside resolveLoading().
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      // INITIAL_SESSION fires on every page load — let checkUser() handle the
      // first resolution so we don't race. Only act on subsequent changes.
      if (event === "INITIAL_SESSION") return

      if (!session) {
        resolveLoading()
        router.push("/login")
      } else {
        setUser(session.user)
        await fetchDancer(session.user.id)
        resolveLoading()
      }
    })

    checkUser()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleImageCapture = (image: CapturedImage) => {
    setCapturedImage(image)
    setCurrentView("crop")
  }

  const handleCropComplete = (cropData: CroppedImageData) => {
    setCroppedImageData(cropData)
    setFilteredImageData(null)
    setCurrentView("filter")
  }

  const handleFilterComplete = (processedData: CroppedImageData) => {
    setFilteredImageData(processedData)
    setCurrentView("preview")
  }

  const handleStartOver = () => {
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

  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  })

  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false)
    localStorage.setItem("hasSeenWelcomeModal", "true")
  }

  const handleGoToGallery = () => {
    setShowExitConfirm(true)
  }

  const confirmExit = () => {
    if (dancerId) {
      window.location.href = `https://curtainconnect.com/profiles/${dancerId}/gallery`
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
      case "camera": return <Camera className="w-8 h-8" />
      case "crop": return <Crop className="w-8 h-8" />
      case "filter": return <Sliders className="w-8 h-8" />
      case "preview": return <Search className="w-8 h-8" />
      default: return <Camera className="w-8 h-8" />
    }
  }

  const renderNavigation = () => (
    <div className="flex justify-between items-center p-3 bg-white/90 backdrop-blur-sm shadow-sm">
      <button
        onClick={() => {
          if (currentView === "camera") return
          if (currentView === "crop") setCurrentView("camera")
          if (currentView === "filter") setCurrentView("crop")
          if (currentView === "preview") setCurrentView("filter")
        }}
        className={`p-2 rounded-lg ${
          currentView === "camera" ? "text-gray-400" : "text-gray-600 hover:bg-gray-100"
        } transition-colors`}
        disabled={currentView === "camera"}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <button
        onClick={() => setShowWelcomeModal(true)}
        className="text-xs font-semibold text-white bg-blue-600 px-3 py-2 rounded-lg shadow-md active:scale-95 active:bg-blue-700 transition-transform whitespace-nowrap"
      >
        Helpful Tips
      </button>

      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
            <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center animate-ping opacity-30 absolute"></div>
            <div className="relative z-10 text-blue-600">{getIconForView()}</div>
          </div>
        </div>
      </div>

      <button
        onClick={handleGoToGallery}
        className="text-xs font-semibold text-white bg-blue-600 px-3 py-2 rounded-lg shadow-md active:scale-95 active:bg-blue-700 transition-transform whitespace-nowrap"
      >
        Go back to Profile
      </button>

      <div className="w-2"></div>
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
            userId={dancerId || undefined}
          />
        )}
      </div>
    </main>
  )
}