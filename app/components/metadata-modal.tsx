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
  setDebugMessage('PASO 1: Submit iniciado')
  
  if (!data.title) {
    setDebugMessage('ERROR: Falta el título')
    return
  }
  
  setDebugMessage('PASO 2: Título: ' + data.title)
  
  try {
    setDebugMessage('PASO 3: Llamando a onSubmit...')
    await onSubmit(data)
    setDebugMessage('PASO 4: Submit completado, esperando upload...')
    
    // NO cerrar el modal aquí
    // Solo resetear el estado del step, pero mantener el modal abierto
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
    setCurrentStep('conditional')
    
    // El modal se cerrará cuando el upload termine y llame a onClose
  } catch (error: any) {
    setDebugMessage('ERROR: ' + (error.message || 'Error desconocido'))
  }
}
  const handleSubmitClick = () => {
    setDebugMessage('Botón Save Media clickeado')
    form.handleSubmit(handleFormSubmit)()
  }

  const handleAutoSave = () => {}

  const handleClose = () => {
    setCurrentStep('conditional')
    form.reset()
    setPeopleDepictedList([])
    setArtistsProductionList([])
    setGenreInput('')
    setShowGenreSuggestions(false)
    setDebugMessage('Esperando...')
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
          {/* DEBUG BOX - visible en el teléfono */}
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