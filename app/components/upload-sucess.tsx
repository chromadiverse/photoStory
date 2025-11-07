import { CheckCircle, Download, Camera, User } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface UploadSuccessProps {
  imageUrl: string
  onTakeAnother: () => void
  onGoToProfile: () => void // Placeholder for now
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
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Success Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Success Icon with Animation */}
        <div className="mb-6 relative">
          <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
          <div className="relative bg-white rounded-full p-4 shadow-lg">
            <CheckCircle className="w-16 h-16 text-green-600" strokeWidth={2.5} />
          </div>
        </div>

        {/* Success Message */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          Photo Uploaded!
        </h2>
        <p className="text-gray-600 text-center mb-8 max-w-sm">
          Your photo has been successfully uploaded to <span className="font-semibold text-indigo-600">CurtainConnect</span>
        </p>

        {/* Preview Image */}
        <div className="mb-8 rounded-lg overflow-hidden shadow-xl max-w-md w-full">
          <img
            src={imageUrl}
            alt="Uploaded Photo"
            className="w-full h-auto object-contain"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white/90 backdrop-blur-sm shadow-lg p-6 space-y-3">
        {/* Primary Action - Take Another Photo */}
        <button
          onClick={onTakeAnother}
          className="w-full flex items-center justify-center gap-3 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-md font-medium"
        >
          <Camera className="w-5 h-5" />
          <span>Take Another Photo</span>
        </button>

        {/* Secondary Actions Grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleSaveToDevice}
            disabled={isDownloading}
            className="flex flex-col items-center gap-2 p-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-5 h-5" />
            <span className="text-sm font-medium">
              {isDownloading ? 'Saving...' : 'Save to Device'}
            </span>
          </button>

          <button
            onClick={onGoToProfile}
            className="flex flex-col items-center gap-2 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-sm"
          >
            <User className="w-5 h-5" />
            <span className="text-sm font-medium">Go to Profile</span>
          </button>
        </div>

        {/* Small helper text */}
        <p className="text-xs text-gray-500 text-center pt-2">
          Your photo is now visible in your gallery
        </p>
      </div>
    </div>
  )
}

export default UploadSuccess