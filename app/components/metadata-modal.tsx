'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2 } from 'lucide-react'
import { GalleryMetadataSchema, GalleryMetadata } from '../lib/gallery-schema'

interface MetadataModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: GalleryMetadata) => Promise<void>
  isUploading: boolean
}

const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isUploading
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<GalleryMetadata>({
    resolver: zodResolver(GalleryMetadataSchema),
    defaultValues: {
      title: '',
      date: new Date().toISOString().split('T')[0],
      location: '',
      companyGroup: '',
      choreographers: '',
      dancersPerformers: '',
      genreStyle: '',
      musicSoundtrack: '',
      directorProducer: '',
      description: '',
      keywords: '',
      rightsPermissions: ''
    }
  })

  const handleFormSubmit = async (data: GalleryMetadata) => {
    await onSubmit(data)
    reset()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">Add to Gallery</h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                {...register('title')}
                type="text"
                placeholder="Enter title"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
              {errors.title && (
                <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                {...register('date')}
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
              {errors.date && (
                <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <input
                {...register('location')}
                type="text"
                placeholder="Where was this taken?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Performance Details Section */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h3 className="font-medium text-gray-800">Performance Details</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company/Group</label>
              <input
                {...register('companyGroup')}
                type="text"
                placeholder="Company or group name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Choreographers</label>
              <input
                {...register('choreographers')}
                type="text"
                placeholder="Choreographer names"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dancers/Performers</label>
              <input
                {...register('dancersPerformers')}
                type="text"
                placeholder="Dancer names"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Genre/Style</label>
              <input
                {...register('genreStyle')}
                type="text"
                placeholder="Ballet, Contemporary, etc."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Production Details Section */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h3 className="font-medium text-gray-800">Production Details</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Music/Soundtrack</label>
              <input
                {...register('musicSoundtrack')}
                type="text"
                placeholder="Music or soundtrack details"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Director/Producer</label>
              <input
                {...register('directorProducer')}
                type="text"
                placeholder="Director or producer name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Describe this photo..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isUploading}
            />
          </div>

          {/* Rights & Keywords Section */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h3 className="font-medium text-gray-800">Rights & Keywords</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Keywords</label>
              <input
                {...register('keywords')}
                type="text"
                placeholder="e.g., dance, performance, ballet"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
              <p className="text-gray-500 text-xs mt-1">Separate keywords with commas</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rights/Permissions</label>
              <input
                {...register('rightsPermissions')}
                type="text"
                placeholder="Rights and permissions information"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Save to Gallery'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MetadataModal