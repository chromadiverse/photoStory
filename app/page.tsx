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

  // Stable supabase client — never recreated on re-render
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // Track whether loading has already been resolved to prevent double-resolution
  const loadingResolvedRef = useRef(false)
  const resolveLoading = () => {
    if (!loadingResolvedRef.current) {
      loadingResolvedRef.current = true
      setLoading(false)
    }
  }

  // FIX 2 — Stable dancerId ref so in-flight uploads always see the
  // current dancer ID even if a re-render fires mid-upload.
  // dancerId state drives UI; dancerIdRef drives async logic (e.g. Preview upload).
  const dancerIdRef = useRef<string | null>(null)
  const safeSetDancerId = (id: string | null) => {
    dancerIdRef.current = id
    setDancerId(id)
  }

  // Safety net — if loading is still true after 8 seconds, force it off
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
        safeSetDancerId(result.data)
      } else {
        console.warn("No dancer found for user")
        safeSetDancerId(null)
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

    // FIX 3 — Only redirect on an explicit SIGNED_OUT event.
    // Previously, ANY null session (including transient mobile network drops,
    // backgrounded tabs, token refresh timing) triggered a redirect to /login.
    // On mobile Safari, backgrounding the app suspends JS and the token refresh
    // can temporarily return null — this was causing false logouts.
    // Now we only redirect when Supabase explicitly tells us the user signed out.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      // Let checkUser() handle the first resolution — don't race with it
      if (event === "INITIAL_SESSION") return

      if (event === "SIGNED_OUT") {
        // Genuine sign-out: clear state and redirect
        resolveLoading()
        router.push("/login")
        return
      }

      // TOKEN_REFRESHED, USER_UPDATED, SIGNED_IN after initial load:
      // update user state but DO NOT treat a transient null session as a logout
      if (session?.user) {
        setUser(session.user)
        // Only re-fetch dancer if we don't have one yet, to avoid
        // redundant Supabase calls and mid-upload re-renders
        if (!dancerIdRef.current) {
          await fetchDancer(session.user.id)
        }
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
    // Use ref here so this always has the current value even if called
    // during a re-render triggered by an auth state change
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

  // FIX 1 — Replaced the 5-child flex row with a 3-zone CSS grid.
  // Previously: flex justify-between with whitespace-nowrap text buttons + a
  // fixed w-16 icon caused the row to overflow ~320px screens (iPhone SE / 14
  // Mini), pushing the rightmost button off-screen.
  // Fix: grid-cols-[auto_1fr_auto] pins the two action buttons to each edge
  // while the icon stays centred in the flex-1 middle column. Text buttons now
  // use text-[11px] and tighter padding so they never overflow even at 320px.
  const renderNavigation = () => (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 px-2 py-2 bg-white/90 backdrop-blur-sm shadow-sm">

      {/* Left zone: back arrow + Helpful Tips */}
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

      {/* Centre zone: animated icon — naturally centred by the grid */}
      <div className="flex items-center justify-center">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
            <div className="w-10 h-10 rounded-full bg-blue-200 animate-ping opacity-30 absolute"></div>
            <div className="relative z-10 text-blue-600">{getIconForView()}</div>
          </div>
        </div>
      </div>

      {/* Right zone: profile link */}
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
            // Pass the stable ref value so mid-upload re-renders
            // caused by auth state changes can't null this out
            userId={dancerIdRef.current ?? undefined}
          />
        )}
      </div>
    </main>
  )
}