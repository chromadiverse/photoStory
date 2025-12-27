"use client"

import { useState, useEffect } from "react"
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
  const supabase = createClient()

  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  })

  // Check if user has seen welcome modal before
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcomeModal')
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true)
    }
  }, [])

  useEffect(() => {
    console.log("🚀 useEffect running")
    let mounted = true
    
    const checkUser = async () => {
      try {
        console.log("🔍 Checking user...")
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        console.log("👤 User result:", user?.email || "NOT LOGGED IN", "Error:", error)

        if (!mounted) {
          console.log("⚠️ Component unmounted, aborting")
          return
        }

        if (error) {
          console.error("❌ Auth error:", error)
          setLoading(false)
          router.push("/login")
          return
        }

        if (!user) {
          console.log("❌ No user found, redirecting...")
          setLoading(false)
          router.push("/login")
          return
        }

        console.log("✅ User authenticated:", user.id)
        setUser(user)
        
        // Fetch dancer ID after user is set
        console.log("🔍 Fetching dancer ID for user:", user.id)
        const result = await fetchDancerIdByUserId(supabase, user.id)
        console.log("📊 Dancer fetch result:", result)
        
        if (!mounted) {
          console.log("⚠️ Component unmounted after dancer fetch, aborting")
          return
        }
        
        if (result.error) {
          console.error("❌ Error fetching dancer ID:", result.error)
        } else if (result.data) {
          console.log("✅ Dancer ID found:", result.data)
          setDancerId(result.data)
        } else {
          console.warn("⚠️ No dancer found for user")
        }
        
        console.log("✅ Setting loading to false")
        setLoading(false)
      } catch (err) {
        console.error("💥 Unexpected error in checkUser:", err)
        if (mounted) {
          setLoading(false)
          router.push("/login")
        }
      }
    }

    checkUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("🔄 Auth state changed:", session?.user?.email || "NO SESSION")
      if (!mounted) return
      
      if (!session) {
        router.push("/login")
      } else {
        setUser(session.user)
        
        // Fetch dancer ID when auth state changes
        const result = await fetchDancerIdByUserId(supabase, session.user.id)
        
        if (!mounted) return
        
        if (result.error) {
          console.error("Error fetching dancer ID:", result.error)
        } else if (result.data) {
          console.log("Dancer ID found:", result.data)
          setDancerId(result.data)
        } else {
          console.warn("No dancer found for user")
          setDancerId(null)
        }
      }
    })

    return () => {
      console.log("🧹 Cleanup: unmounting")
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

  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false)
    // Mark as seen in localStorage
    localStorage.setItem('hasSeenWelcomeModal', 'true')
  }

  const handleGoToGallery = () => {
    // Debug logging
    console.log("🔍 Exit check:", {
      capturedImage: !!capturedImage,
      croppedImageData: !!croppedImageData,
      filteredImageData: !!filteredImageData,
      currentView
    })
    
    // Check if there are any captured/processed images OR if not on camera view
    const hasScansInProgress = capturedImage !== null || croppedImageData !== null || filteredImageData !== null || currentView !== "camera"
    
    if (hasScansInProgress) {
      console.log("✅ Showing exit confirmation")
      setShowExitConfirm(true)
    } else {
      console.log("⏭️ No scans, exiting directly")
      // No scans in progress, exit directly
      confirmExit()
    }
  }

  const confirmExit = () => {
    if (dancerId) {
      window.location.href = `https://curtainconnect.com/profiles/${dancerId}/gallery`
    } else {
      console.error('Dancer ID not available')
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
      case "camera":
        return <Camera className="w-8 h-8" />
      case "crop":
        return <Crop className="w-8 h-8" />
      case "filter":
        return <Sliders className="w-8 h-8" />
      case "preview":
        return <Search className="w-8 h-8" />
      default:
        return <Camera className="w-8 h-8" />
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