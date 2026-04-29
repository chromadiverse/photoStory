import { createClient } from './supabase/client'
import { GalleryMetadataFormData } from '../types/gallery-schema'; 

export async function saveGalleryMetadata(
  imagePath: string,
  imageUrl: string,
  metadata: GalleryMetadataFormData,
  userId: string,
  fileName: string,
  fileType: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  
  console.log('📦 [saveGalleryMetadata] Iniciando...')
  console.log('📦 userId:', userId)
  console.log('📦 imagePath:', imagePath)
  console.log('📦 fileName:', fileName)
  console.log('📦 metadata:', metadata)

  try {
    // First, get the dancer_id from user_id
    console.log('📦 Buscando dancer para userId:', userId)
    const { data: dancerData, error: dancerError } = await supabase
      .from('dancers')
      .select('id')
        .eq('id', userId)
      .single()

    if (dancerError || !dancerData) {
      console.error('❌ Error getting dancer:', dancerError)
      return { success: false, error: 'Dancer profile not found' }
    }

    const dancerId = dancerData.id
    console.log('✅ Dancer encontrado - ID:', dancerId)

    // Prepare metadata object matching the new schema
    const metadataObject: Record<string, any> = {
      title: metadata.title,
      description: metadata.description || undefined,
      location: metadata.location || undefined,
    }

    // Date handling
    if (metadata.dateKnowledge === 'exact' && metadata.dateExact) {
      metadataObject.dateType = 'exact'
      metadataObject.dateValue = metadata.dateExact
    } else if (metadata.dateKnowledge === 'approximate') {
      metadataObject.dateType = 'approximate'
      metadataObject.dateMonth = metadata.dateMonth || undefined
      metadataObject.dateDay = metadata.dateDay || undefined
      metadataObject.dateYear = metadata.dateYear || undefined
      metadataObject.dateDecade = metadata.dateDecade || undefined
    }

    // Organization handling
    if (metadata.hasOrganization === 'yes') {
      if (metadata.organizationId) {
        metadataObject.organizationId = metadata.organizationId
      } else if (metadata.organizationName) {
        metadataObject.organizationName = metadata.organizationName
      }
    }

    // Creative work handling
    if (metadata.isCreativeWork === 'yes') {
      if (metadata.workTitle) {
        metadataObject.workTitle = metadata.workTitle
      }
      if (metadata.artistsProduction && metadata.artistsProduction.length > 0) {
        metadataObject.artistsProduction = metadata.artistsProduction
      }
      if (metadata.genres && metadata.genres.length > 0) {
        metadataObject.genres = metadata.genres
      }
    }

    // People depicted
    if (metadata.peopleDepicted && metadata.peopleDepicted.length > 0) {
      metadataObject.peopleDepicted = metadata.peopleDepicted
    }

    // Media creator
    if (metadata.mediaCreator && metadata.mediaCreator.name) {
      metadataObject.mediaCreator = metadata.mediaCreator
    }

    // Remove undefined values to keep the object clean
    const cleanMetadataObject = Object.fromEntries(
      Object.entries(metadataObject).filter(([_, value]) => value !== undefined && value !== null && value !== '')
    )

    console.log('📦 cleanMetadataObject:', cleanMetadataObject)

    const insertData = {
      dancer_id: dancerId,
      name: fileName,
      path: imagePath,
      type: fileType,
      metadata: cleanMetadataObject,
      other_organizations: null
    }

    console.log('📦 Insertando en dancer_gallery_files:', insertData)

    // Save to dancer_gallery_files table
    const { data: insertResult, error: dbError } = await supabase
      .from('dancer_gallery_files')
      .insert(insertData)
      .select()

    if (dbError) {
      console.error('❌ Database error:', dbError)
      console.error('❌ Detalle:', dbError.message, dbError.code, dbError.details)
      return { success: false, error: dbError.message }
    }

    console.log('✅ Registro insertado:', insertResult)
    return { success: true }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }
  }
}

// Helper function to construct the full image URL
export function getImageUrl(imagePath: string, bucketName: string): string {
  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!r2PublicUrl) throw new Error('NEXT_PUBLIC_R2_PUBLIC_URL is not defined')
  return `${r2PublicUrl}/${bucketName}/${imagePath}`
}