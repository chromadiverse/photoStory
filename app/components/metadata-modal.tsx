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

  const handleConditionalComplete = () => {
    setCurrentStep('metadata')
  }
const handleFormSubmit = async (data: GalleryMetadataFormData) => {
  alert('PASO 1: Submit iniciado')
  
  if (!data.title) {
    alert('ERROR: Falta el título')
    return
  }
  
  alert('PASO 2: Título: ' + data.title)
  
  try {
    alert('PASO 3: Llamando a onSubmit del Preview')
    await onSubmit(data)
    alert('PASO 4: Éxito! Cerrando modal')
    
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
    setCurrentStep('conditional')
    onClose()
  } catch (error: any) {
    alert('ERROR: ' + (error.message || 'Error desconocido'))
  }
}

  const handleAutoSave = () => {}

  const handleClose = () => {
    setCurrentStep('conditional')
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              {currentStep === 'conditional' && (
                <ConditionalStep
                  form={form}
                  onComplete={handleConditionalComplete}
                />
              )}
              
              {currentStep === 'metadata' && (
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
              )}
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}

export default MetadataModal