'use client'

import React, { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Form } from './ui/form'
import { GalleryMetadataSchema, GalleryMetadataFormData } from '../types/gallery-schema'
import { ConditionalStep } from './conditional-step' 
import { MetadataStep } from './metadata-step' 
import { Organization } from '../types/orgaization'

interface MetadataModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: GalleryMetadataFormData) => Promise<void>
  isUploading: boolean
  organizations: Organization[]
}

type Step = 'conditional' | 'metadata'

const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isUploading,
  organizations
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('conditional')
  const [peopleDepictedList, setPeopleDepictedList] = useState<string[]>([])
  const [artistsProductionList, setArtistsProductionList] = useState<any[]>([])
  const [genreInput, setGenreInput] = useState('')
  const [showGenreSuggestions, setShowGenreSuggestions] = useState(false)
  const [debugMessage, setDebugMessage] = useState<string>('Esperando...')
  const formRef = useRef<HTMLDivElement>(null)

  const form = useForm<GalleryMetadataFormData>({
    resolver: zodResolver(GalleryMetadataSchema),
    defaultValues: {
      uploadType: "single",
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

  const handleConditionalComplete = () => {
    setCurrentStep('metadata')
  }

  const handleFormSubmit = async (data: GalleryMetadataFormData) => {
    console.log('[MetadataModal] handleFormSubmit called', data)

    if (!data.title) {
      console.warn('[MetadataModal] Missing title, aborting')
      setDebugMessage('ERROR: Missing title')
      return
    }

    setDebugMessage('Submitting metadata...')

    try {
      await onSubmit(data)
      console.log('[MetadataModal] onSubmit resolved successfully')
      setDebugMessage('Metadata submitted successfully!')
    } catch (error: any) {
      console.error('[MetadataModal] onSubmit threw:', error)
      setDebugMessage(`ERROR: ${error.message || 'Unknown error'}`)
    }
  }

  const handleSubmitClick = () => {
    console.log('[MetadataModal] Save button clicked')
    console.log('[MetadataModal] Current form values:', form.getValues())
    console.log('[MetadataModal] Form state:', form.formState)

    form.handleSubmit(
      (data) => {
        console.log('[MetadataModal] RHF validation passed, data:', data)
        handleFormSubmit(data)
      },
      (errors) => {
        console.warn('[MetadataModal] RHF validation failed, errors:', errors)
        setDebugMessage(`Validation errors: ${Object.keys(errors).join(', ')}`)
      }
    )()
  }

  const handleAutoSave = () => {
    console.log('[MetadataModal] Auto-save triggered')
  }

  const resetForm = () => {
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
    setCurrentStep('conditional')
    setDebugMessage('Esperando...')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-800">Add to Gallery</h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          {/* DEBUG BOX */}
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 rounded-lg">
            <p className="font-mono text-xs break-all">
              <strong>DEBUG:</strong> {debugMessage}
            </p>
          </div>

          <Form {...form}>
            <form>
              {currentStep === 'conditional' && (
                <ConditionalStep
                  form={form}
                  onComplete={handleConditionalComplete}
                />
              )}
              
              {currentStep === 'metadata' && (
                <>
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
                    onSubmit={handleSubmitClick}
                    isSaving={isUploading}
                  />
                </>
              )}
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}

export default MetadataModal