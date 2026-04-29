'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Download, Share2, RotateCcw, Copy, Save } from 'lucide-react'
import MetadataModal from './metadata-modal'
import ImageUploader from './image-uploader'
import UploadSuccess from './upload-sucess'
import { GalleryMetadataFormData } from '../types/gallery-schema'
import { saveGalleryMetadata } from '../lib/upload-service'
import { toast } from 'sonner'
import { getAllOrganizations } from '../service/getAllOrganizations'
import { Organization } from '../types/orgaization'

interface CroppedImageData {
  croppedImage: string
  croppedBlob: Blob
  rotation: number
}

interface PreviewProps {
  imageData: CroppedImageData
  onStartOver: () => void
  onBack: () => void
  userId?: string
}

const UPLOAD_TIMEOUT_MS = 30000

const Preview: React.FC<PreviewProps> = ({ imageData, onStartOver, onBack, userId }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingMetadata, setPendingMetadata] = useState<GalleryMetadataFormData | null>(null)
  const [finalImageBlob, setFinalImageBlob] = useState<Blob | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('')
  const [organizations, setOrganizations] = useState<Organization[]>([])

  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const BUCKET_NAME = process.env.NEXT_PUBLIC_IMAGE_GALLERY_BUCKET || 'gallery'

  useEffect(() => {
    if (isModalOpen && organizations.length === 0) {
      getAllOrganizations()
        .then(setOrganizations)
        .catch(() => toast.error('Failed to fetch organizations'))
    }
  }, [isModalOpen, organizations.length])

  const resetUploadState = () => {
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current)
      uploadTimeoutRef.current = null
    }
    setIsUploading(false)
    setPendingMetadata(null)
    setFinalImageBlob(null)
  }

  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) clearTimeout(uploadTimeoutRef.current)
    }
  }, [])

  const handleMetadataSubmit = async (metadata: GalleryMetadataFormData) => {
    console.log('🔵 [Preview] handleMetadataSubmit - userId:', userId)

    if (!userId) {
      toast.error('You must be logged in to save to gallery')
      return
    }

    setIsModalOpen(false)
    setIsUploading(true)
    setPendingMetadata(metadata)
    setFinalImageBlob(imageData.croppedBlob)

    uploadTimeoutRef.current = setTimeout(() => {
      toast.error('Upload timed out after 30 seconds')
      resetUploadState()
    }, UPLOAD_TIMEOUT_MS)
  }
  
  const handleUploadComplete = async (uploadedFile: { name: string; path: string; type: string }) => {
    console.log('🟢 [Preview] handleUploadComplete - path:', uploadedFile.path)
    console.log('🟢 [Preview] pendingMetadata:', pendingMetadata ? 'YES' : 'NO')
    console.log('🟢 [Preview] userId:', userId)

    if (!pendingMetadata || !userId) {
      console.error('🔴 [Preview] FALTA metadata o userId')
      resetUploadState()
      toast.error('Upload failed: missing metadata or user')
      return
    }

    try {
      console.log('🟢 [Preview] Llamando a saveGalleryMetadata...')
      const result = await saveGalleryMetadata(
        uploadedFile.path,
        uploadedFile.path,
        pendingMetadata,
        userId,
        uploadedFile.name,
        uploadedFile.type
      )

      console.log('🟢 [Preview] Resultado de saveGalleryMetadata:', result)

      if (result.success) {
        console.log('🟢 [Preview] Éxito! Mostrando pantalla de éxito')
        if (uploadTimeoutRef.current) {
          clearTimeout(uploadTimeoutRef.current)
          uploadTimeoutRef.current = null
        }
        setUploadedImageUrl(imageData.croppedImage)
        setShowSuccess(true)
        setPendingMetadata(null)
        setFinalImageBlob(null)
        setIsUploading(false)
        toast.success('Image saved to gallery!')
      } else {
        console.error('🔴 [Preview] saveGalleryMetadata falló:', result.error)
        resetUploadState()
        toast.error(result.error || 'Failed to save image')
      }
    } catch (error) {
      console.error('🔴 [Preview] Excepción en saveGalleryMetadata:', error)
      resetUploadState()
      toast.error('Failed to save image: ' + (error as Error).message)
    }
  }
  
  const handleUploadError = (error: Error) => {
    console.error('🔴 [Preview] Upload error:', error)
    toast.error('Upload error: ' + error.message)
    resetUploadState()
  }

  const handleSaveToPhotos = async () => {
    setIsProcessing(true)
    try {
      if (navigator.share && imageData.croppedBlob.size > 0) {
        const file = new File([imageData.croppedBlob], 'edited-photo.jpg', { type: 'image/jpeg' })
        await navigator.share({ files: [file], title: 'Save to Photos' })
        toast.success('Image saved to photos!')
      } else {
        const url = URL.createObjectURL(imageData.croppedBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `edited-photo-${Date.now()}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Image saved to downloads')
      }
    } catch (error) {
      toast.error('Failed to save image')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleShare = async () => {
    if (!navigator.share) { handleCopyToClipboard(); return }
    setIsProcessing(true)
    try {
      const file = new File([imageData.croppedBlob], 'edited-photo.jpg', { type: 'image/jpeg' })
      await navigator.share({ files: [file], title: 'Edited Photo' })
    } catch (error) {
      console.error('Error sharing:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!navigator.clipboard) { alert('Clipboard not supported'); return }
    setIsProcessing(true)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': imageData.croppedBlob })])
      toast.success('Image copied to clipboard!')
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleGoToProfile = () => {
    if (userId) window.location.href = `https://curtainconnect.com/profiles/${userId}/gallery`
  }

  if (showSuccess && uploadedImageUrl) {
    return <UploadSuccess imageUrl={uploadedImageUrl} onTakeAnother={onStartOver} onGoToProfile={handleGoToProfile} />
  }

  return (
    <>
      <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
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
                  <span className="text-white text-sm font-medium">{isUploading ? 'Uploading...' : 'Processing...'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-sm shadow-sm p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setIsModalOpen(true)} disabled={isProcessing || isUploading}
              className="flex flex-col items-center gap-2 p-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm">
              <Save className="w-6 h-6" />
              <span className="text-sm font-medium">Save to Profile</span>
            </button>
            <button onClick={handleSaveToPhotos} disabled={isProcessing || isUploading}
              className="flex flex-col items-center gap-2 p-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm">
              <Download className="w-6 h-6" />
              <span className="text-sm font-medium">Save to this device</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleShare} disabled={isProcessing || isUploading}
              className="flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm">
              <Share2 className="w-5 h-5" />
              <span className="text-sm font-medium">Share</span>
            </button>
            <button onClick={handleCopyToClipboard} disabled={isProcessing || isUploading}
              className="flex items-center justify-center gap-2 p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm">
              <Copy className="w-5 h-5" />
              <span className="text-sm font-medium">Copy</span>
            </button>
          </div>
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <button onClick={onBack} disabled={isUploading}
              className="flex items-center gap-2 bg-white/60 hover:bg-white/80 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50">
              <ArrowLeft className="w-5 h-5" /><span>Back to Filters</span>
            </button>
            <button onClick={onStartOver} disabled={isUploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50">
              <RotateCcw className="w-5 h-5" /><span>Start Over</span>
            </button>
          </div>
        </div>
      </div>

      <MetadataModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setPendingMetadata(null); setFinalImageBlob(null) }}
        onSubmit={handleMetadataSubmit}
        isUploading={isUploading}
        organizations={organizations}
      />

      {finalImageBlob && pendingMetadata && (
    <ImageUploader
  imageBlob={finalImageBlob}
  bucketName="im-g"     // ← el bucket
  folderName=""         // ← VACÍO, porque no quieres carpeta adicional
  onUploadComplete={handleUploadComplete}
  onUploadError={handleUploadError}
/>
      )}
    </>
  )
}

export default Preview