// Preview.tsx
'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Share2, RotateCcw, Copy, Save } from 'lucide-react'
import MetadataModal from './metadata-modal'
import ImageUploader from './image-uploader'
import { GalleryMetadata } from '../lib/gallery-schema'
import { saveGalleryMetadata, getImageUrl } from '../lib/upload-service'
import { toast } from 'sonner'
import { createClient } from '../lib/supabase/client'

interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
}

interface PreviewProps {
  imageData: CroppedImageData
  onStartOver: () => void
  onBack: () => void
}

const Preview: React.FC<PreviewProps> = ({
  imageData,
  onStartOver,
  onBack
}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingMetadata, setPendingMetadata] = useState<GalleryMetadata | null>(null)
  const [finalImageBlob, setFinalImageBlob] = useState<Blob | null>(null)

  // Get bucket name from env
  const BUCKET_NAME = process.env.NEXT_PUBLIC_IMAGE_GALLERY_BUCKET || 'gallery'

  const handleMetadataSubmit = async (metadata: GalleryMetadata) => {
    setIsUploading(true)
    
    try {
      // Get current user
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        toast.error('You must be logged in to save to gallery')
        setIsUploading(false)
        return
      }

      // The imageData.croppedBlob already has filters applied from filter-panel
      // No need to reprocess - just use it directly
      console.log('Preview - Using pre-processed image blob with filters')
      
      // Store metadata and blob, trigger upload
      setPendingMetadata(metadata)
      setFinalImageBlob(imageData.croppedBlob)
      
    } catch (error) {
      console.error('Error preparing upload:', error)
      toast.error('Failed to prepare image for upload')
      setIsUploading(false)
    }
  }

  const handleUploadComplete = async (uploadedFile: {
    name: string
    path: string
    type: string
  }) => {
    if (!pendingMetadata) {
      toast.error('Metadata missing')
      setIsUploading(false)
      return
    }

    try {
      // Get current user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('User not found')
        setIsUploading(false)
        return
      }

      // Construct image URL
      const imageUrl = getImageUrl(uploadedFile.path, BUCKET_NAME)

      // Save metadata to database (now with fileName and fileType)
      const result = await saveGalleryMetadata(
        uploadedFile.path,
        imageUrl,
        pendingMetadata,
        user.id,
        uploadedFile.name,
        uploadedFile.type
      )

      if (result.success) {
        toast.success('Image saved to gallery successfully!')
        setIsModalOpen(false)
        setSaveStatus('success')
        setPendingMetadata(null)
        setFinalImageBlob(null)
      } else {
        toast.error(`Failed to save: ${result.error}`)
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('Save to gallery error:', error)
      toast.error('Failed to save image to gallery')
      setSaveStatus('error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error)
    toast.error('Failed to upload image')
    setIsUploading(false)
    setSaveStatus('error')
  }

  const handleDownload = async () => {
    setIsProcessing(true)
    setSaveStatus('idle')
    
    try {
      // Use the pre-processed blob that already has filters applied
      const url = URL.createObjectURL(imageData.croppedBlob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `edited-photo-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      URL.revokeObjectURL(url)
      setSaveStatus('success')
    } catch (error) {
      console.error('Download error:', error)
      setSaveStatus('error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleShare = async () => {
    if (!navigator.share) {
      handleCopyToClipboard()
      return
    }

    setIsProcessing(true)
    
    try {
      // Use the pre-processed blob that already has filters applied
      const file = new File([imageData.croppedBlob], 'edited-photo.jpg', { type: 'image/jpeg' })
      
      await navigator.share({
        files: [file],
        title: 'Edited Photo',
        text: 'Check out my edited photo!'
      })
      
      setSaveStatus('success')
    } catch (error) {
      console.error('Error sharing:', error)
      if (error instanceof Error && error.name !== 'AbortError') {
        setSaveStatus('error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!navigator.clipboard) {
      alert('Clipboard not supported on this device')
      return
    }

    setIsProcessing(true)
    
    try {
      // Use the pre-processed blob that already has filters applied
      const item = new ClipboardItem({ 'image/png': imageData.croppedBlob })
      await navigator.clipboard.write([item])
      toast.success('Image copied to clipboard!')
      setSaveStatus('success')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      toast.error('Failed to copy to clipboard')
      setSaveStatus('error')
    } finally {
      setIsProcessing(false)
    }
  }

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (imageData.croppedImage.startsWith('blob:')) {
        URL.revokeObjectURL(imageData.croppedImage)
      }
    }
  }, [imageData.croppedImage])

  return (
    <>
     <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Image Preview */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative">
          <img
            src={imageData.croppedImage}
            alt="Final Preview"
            className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
          />
          {(isProcessing || isUploading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-white rounded-full animate-spin border-t-transparent"></div>
                <span className="text-white text-sm font-medium">
                  {isUploading ? 'Uploading...' : 'Processing...'}
                </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {saveStatus !== 'idle' && (
          <div className="px-4 pb-2">
            <div
              className={`p-3 rounded-lg text-center transition-all duration-300 font-medium ${
                saveStatus === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {saveStatus === 'success'
                ? 'Action completed successfully!'
                : 'Action failed. Please try again.'}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white/90 backdrop-blur-sm shadow-sm p-4 space-y-4">
          {/* Primary Actions Grid */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isProcessing || isUploading}
              className="flex flex-col items-center gap-2 p-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              <Save className="w-6 h-6" />
              <span className="text-sm font-medium">Save to Gallery</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isProcessing || isUploading}
              className="flex flex-col items-center gap-2 p-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              <Download className="w-6 h-6" />
              <span className="text-sm font-medium">Download</span>
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShare}
              disabled={isProcessing || isUploading}
              className="flex items-center justify-center gap-2 p-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              <Share2 className="w-5 h-5" />
              <span className="text-sm font-medium">Share</span>
            </button>

            <button
              onClick={handleCopyToClipboard}
              disabled={isProcessing || isUploading}
              className="flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              <Copy className="w-5 h-5" />
              <span className="text-sm font-medium">Copy</span>
            </button>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <button 
              onClick={onBack} 
              disabled={isUploading}
              className="flex items-center gap-2 bg-white/60 hover:bg-white/80 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Filters</span>
            </button>
            <button 
              onClick={onStartOver}
              disabled={isUploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Start Over</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metadata Modal */}
      <MetadataModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setPendingMetadata(null)
          setFinalImageBlob(null)
        }}
        onSubmit={handleMetadataSubmit}
        isUploading={isUploading}
      />

      {/* Hidden Uppy Uploader - triggers when blob is ready */}
      {finalImageBlob && pendingMetadata && (
        <ImageUploader
          imageBlob={finalImageBlob}
          bucketName={BUCKET_NAME}
          folderName=""
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
        />
      )}
    </>
  )
}

export default Preview