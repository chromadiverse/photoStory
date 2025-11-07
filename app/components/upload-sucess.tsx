import { Download, Camera, User } from 'lucide-react'
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

  const handleSaveToDevice = async () => {
    setIsDownloading(true)
    
    try {
      // Since imageUrl is a blob URL from Preview, we can use it directly
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      
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
        {/* Success Text - BIG AND BOLD */}
        <div className="text-center mb-6 space-y-3">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 drop-shadow-lg animate-pulse">
            SUCCESS!
          </h1>
          <div className="space-y-1">
            <p className="text-xl font-bold text-gray-800">
              Your photo is now in your gallery
            </p>
            <p className="text-lg text-gray-600">
              on <span className="font-bold text-indigo-600">CurtainConnect</span>
            </p>
          </div>
        </div>

        {/* Preview Image - LARGE */}
        <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full border-4 border-white">
          <img
            src={imageUrl}
            alt="Uploaded Photo"
            className="w-full h-auto object-contain"
          />
        </div>
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