import { useState, useEffect } from 'react'
import { 
  Lightbulb, 
  FileImage, 
  Camera, 
  Crop, 
  Palette, 
  Upload, 
  X, 
  ChevronRight 
} from 'lucide-react'

const tips = [
  {
    icon: Lightbulb,
    title: "Find Perfect Lighting",
    description: "Position yourself in a well-lit area with natural light if possible. Avoid harsh shadows and try to hold your device steady for the best capture quality."
  },
  {
    icon: FileImage,
    title: "Optimize Document Placement",
    description: "Place your photo, poster, or document on a contrasting background. Ensure it's flat and well-positioned for clear edges and optimal detection."
  },
  {
    icon: Camera,
    title: "Manual Camera Control",
    description: "Press the camera settings icon to access manual controls and disable auto AI cropping. This gives you full control over your capture experience."
  },
  {
    icon: Crop,
    title: "Precise Cropping Tools",
    description: "Fine-tune your capture with our intelligent cropping tools. Adjust corners and edges to get the perfect frame for your document."
  },
  {
    icon: Palette,
    title: "Enhanced Filters",
    description: "Apply professional-grade filters to enhance brightness, contrast, saturation, and more. Transform your captures into polished, high-quality images."
  },
  {
    icon: Upload,
    title: "Upload to Chroma Diverse",
    description: "Seamlessly upload your enhanced captures to Chroma Diverse platform. Share your polished documents with confidence and professional quality."
  }
]

export default function WelcomeModal({ isVisible, onClose }) {
  const [currentTip, setCurrentTip] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  if (!isVisible) return null

  const handleNext = () => {
    if (currentTip < tips.length - 1) {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentTip(prev => prev + 1)
        setIsAnimating(false)
      }, 200)
    }
  }

  const CurrentIcon = tips[currentTip].icon

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span className="text-sm font-semibold text-gray-800">
              Quick Start Guide
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pb-6">
          <div className="flex space-x-1">
            {tips.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  index <= currentTip ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="relative h-64 overflow-hidden">
          <div 
            className={`absolute inset-0 flex flex-col items-center p-6 pt-2 transition-all duration-300 ease-out ${
              isAnimating ? 'transform -translate-x-full opacity-0' : 'transform translate-x-0 opacity-100'
            }`}
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <CurrentIcon className="w-8 h-8 text-blue-600" />
            </div>
            
            <h3 className="text-lg font-bold text-gray-800 text-center mb-3">
              {tips[currentTip].title}
            </h3>
            
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              {tips[currentTip].description}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 pt-2 bg-gray-50/50">
          <div className="flex space-x-1">
            {tips.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentTip ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Skip
            </button>
            
            {currentTip < tips.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}