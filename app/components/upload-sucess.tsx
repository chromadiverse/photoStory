import { CheckCircle, Download, Camera, User } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface UploadSuccessProps {
  imageUrl: string
  onTakeAnother: () => void
  onGoToProfile: () => void
}

const UploadSuccess: React.FC<UploadSuccessProps> = ({
  imageUrl,
  onTakeAnother,
  onGoToProfile
}) => {
  const [isDownloading, setIsDownloading] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleSaveToDevice = async () => {
    setIsDownloading(true)
    
    try {
      // Fetch the image from the URL
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      
      // Check if the Web Share API is available (iOS 12.2+)
      if (navigator.share && blob.size > 0) {
        const file = new File([blob], 'curtainconnect-photo.jpg', { 
          type: 'image/jpeg' 
        })
        
        await navigator.share({
          files: [file],
          title: 'Save to Photos',
          text: 'Save this image to your photo library'
        })
        
        toast.success('Image saved to photos!')
      } else {
        // Fallback: download directly
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `curtainconnect-photo-${Date.now()}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        toast.success('Image saved to downloads')
      }
    } catch (error) {
      console.error('Error saving to device:', error)
      toast.error('Failed to save image')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100">
      {/* Success Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        {/* Success Icon with Stunning Animation */}
        <div className="mb-8 relative">
          {/* Outer glow rings */}
          <div className="absolute inset-0 bg-green-400/30 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
          <div className="absolute inset-0 bg-green-400/20 rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
          
          {/* Main icon container */}
          <div className="relative bg-gradient-to-br from-green-400 to-green-600 rounded-full p-6 shadow-2xl">
            <CheckCircle className="w-20 h-20 text-white" strokeWidth={3} />
          </div>
          
          {/* Sparkle effects */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></div>
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-8 space-y-2">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Success! 🎉
          </h2>
          <p className="text-xl text-gray-700 font-medium">
            Your photo is now in your gallery
          </p>
          <p className="text-sm text-gray-500 max-w-sm">
            on <span className="font-semibold text-indigo-600">CurtainConnect</span>
          </p>
        </div>

        {/* Preview Image */}
        {!imageError ? (
          <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full border-4 border-white">
            <img
              src={imageUrl}
              alt="Uploaded Photo"
              className="w-full h-auto object-cover"
              onError={() => {
                console.error('Image failed to load:', imageUrl)
                setImageError(true)
              }}
              crossOrigin="anonymous"
            />
          </div>
        ) : (
          <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full border-4 border-white bg-gray-100 aspect-square flex items-center justify-center">
            <p className="text-gray-400">Image preview unavailable</p>
          </div>
        )}
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="bg-white/95 backdrop-blur-sm shadow-2xl p-6 space-y-4 border-t border-gray-200">
        {/* Primary Action - Take Another Photo */}
        <button
          onClick={onTakeAnother}
          className="w-full flex items-center justify-center gap-3 p-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] font-semibold text-lg"
        >
          <Camera className="w-6 h-6" />
          <span>Take Another Photo</span>
        </button>

        {/* Secondary Actions Grid */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleSaveToDevice}
            disabled={isDownloading}
            className="flex flex-col items-center justify-center gap-2 p-5 bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02]"
          >
            <Download className="w-6 h-6" />
            <span className="text-sm font-semibold">
              {isDownloading ? 'Saving...' : 'Save to Device'}
            </span>
          </button>

          <button
            onClick={onGoToProfile}
            className="flex flex-col items-center justify-center gap-2 p-5 bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02]"
          >
            <User className="w-6 h-6" />
            <span className="text-sm font-semibold">View Profile</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default UploadSuccess