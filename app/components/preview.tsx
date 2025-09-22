'use client'

import { useState } from 'react'
import { ArrowLeft, Download, Share2, RotateCcw, Copy } from 'lucide-react'
import { CroppedImageData, FilterSettings } from '../page'

interface PreviewProps {
  imageData: CroppedImageData
  filterSettings: FilterSettings
  onStartOver: () => void
  onBack: () => void
}

const Preview: React.FC<PreviewProps> = ({
  imageData,
  filterSettings,
  onStartOver,
  onBack
}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const applyFilters = () => {
    const { brightness, contrast, saturation, hue, grayscale } = filterSettings
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg) grayscale(${grayscale}%)`
  }

  // Create canvas with filters applied and return as blob
  const createFinalImage = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      const img = new Image()
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height

        // Apply filters via canvas
        const { brightness, contrast, saturation, hue, grayscale } = filterSettings
        ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100}) hue-rotate(${hue}deg) grayscale(${grayscale / 100})`
        ctx.drawImage(img, 0, 0)

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create blob'))
          }
        }, 'image/jpeg', 0.9)
      }
      
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageData.croppedImage
    })
  }

  const handleDownload = async () => {
    setIsProcessing(true)
    setSaveStatus('idle')
    
    try {
      const blob = await createFinalImage()
      const url = URL.createObjectURL(blob)
      
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
      // Fallback to copy to clipboard or show message
      handleCopyToClipboard()
      return
    }

    setIsProcessing(true)
    
    try {
      const blob = await createFinalImage()
      const file = new File([blob], 'edited-photo.jpg', { type: 'image/jpeg' })
      
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
      const blob = await createFinalImage()
      const item = new ClipboardItem({ 'image/png': blob })
      await navigator.clipboard.write([item])
      setSaveStatus('success')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      setSaveStatus('error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveLocal = async () => {
    setIsProcessing(true)
    setSaveStatus('idle')
    
    try {
      const blob = await createFinalImage()
      
      // For browsers that support File System Access API
      if ('showSaveFilePicker' in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: `edited-photo-${Date.now()}.jpg`,
          types: [{
            description: 'JPEG images',
            accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
          }]
        })
        
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        // Fallback to download
        handleDownload()
        return
      }
      
      setSaveStatus('success')
    } catch (error) {
      console.error('Save error:', error)
      setSaveStatus('error')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Image Preview */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative">
          <img
            src={imageData.croppedImage}
            alt="Final Preview"
            className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
            style={{ filter: applyFilters() }}
          />
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 border-2 border-white rounded-full animate-spin border-t-transparent"></div>
                <span className="text-white text-sm">Processing...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {saveStatus !== 'idle' && (
        <div className="px-4 pb-2">
          <div
            className={`p-3 rounded-lg text-center transition-all duration-300 ${
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
      <div className="bg-gray-900 p-4 space-y-4">
        {/* Primary Actions Grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            disabled={isProcessing}
            className="flex flex-col items-center space-y-2 p-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Download size={24} />
            <span className="text-sm font-medium">Download</span>
          </button>

          <button
            onClick={handleShare}
            disabled={isProcessing}
            className="flex flex-col items-center space-y-2 p-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Share2 size={24} />
            <span className="text-sm font-medium">Share</span>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={handleCopyToClipboard}
            disabled={isProcessing}
            className="flex items-center justify-center space-x-2 p-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Copy size={20} />
            <span className="text-sm font-medium">Copy to Clipboard</span>
          </button>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t border-gray-700">
          <button onClick={onBack} className="btn-secondary flex items-center space-x-2">
            <ArrowLeft size={20} />
            <span>Back to Filters</span>
          </button>
          <button onClick={onStartOver} className="btn-primary flex items-center space-x-2">
            <RotateCcw size={20} />
            <span>Start Over</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Preview