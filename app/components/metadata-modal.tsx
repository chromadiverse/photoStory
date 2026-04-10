'use client'

import React, { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2 } from 'lucide-react'
import { Form } from './ui/form'
import { GalleryMetadataSchema, GalleryMetadataFormData } from '../types/gallery-schema'
import { MetadataStep } from './metadata-step' 
import { Organization } from '../types/orgaization' 

interface MetadataModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: GalleryMetadataFormData) => Promise<void>
  isUploading: boolean
  organizations: Organization[]
}

const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isUploading,
  organizations
}) => {
  const [peopleDepictedList, setPeopleDepictedList] = useState<string[]>([])
  const [artistsProductionList, setArtistsProductionList] = useState<any[]>([])
  const [genreInput, setGenreInput] = useState('')
  const [showGenreSuggestions, setShowGenreSuggestions] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  const form = useForm<GalleryMetadataFormData>({
    resolver: zodResolver(GalleryMetadataSchema),
    defaultValues: {
      title: '',
      location: '',
      description: '',
      peopleDepicted: [],
      genres: [],
      dateKnowledge: undefined,
      hasOrganization: undefined,
      isCreativeWork: undefined,
      mediaCreator: {
        name: '',
        displayTitle: '',
        role: '',
        roleCategory: undefined,
        roleCategoryOther: '',
      },
    },
    mode: 'onChange',
  })

  const handleFormSubmit = async (data: GalleryMetadataFormData) => {
    await onSubmit(data)
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
    onClose()
  }

  const handleAutoSave = () => {
    // Optional: implement auto-save functionality
    console.log('Auto-save triggered')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
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
        <div className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              <MetadataStep
                form={form}
                formRef={formRef}
                organizations={organizations}
                peopleDepictedList={peopleDepictedList}
                setPeopleDepictedList={setPeopleDepictedList}
                artistsProductionList={artistsProductionList}
                setArtistsProductionList={setArtistsProductionList}
                genreInput={genreInput}
                setGenreInput={setGenreInput}
                showGenreSuggestions={showGenreSuggestions}
                setShowGenreSuggestions={setShowGenreSuggestions}
                onAutoSave={handleAutoSave}
                onSubmit={() => {}}
                isSaving={isUploading}
              />
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}

export default MetadataModal