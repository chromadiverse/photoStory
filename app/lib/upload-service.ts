import { createClient } from './supabase/client'
import { GalleryMetadata } from './gallery-schema'

export async function saveGalleryMetadata(
  imagePath: string,
  imageUrl: string,
  metadata: GalleryMetadata,
  userId: string,
  fileName: string,
  fileType: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {


    // First, get the dancer_id from user_id (same as main app)
    const { data: dancerData, error: dancerError } = await supabase
      .from('dancers')
      .select('id')
      .eq('user_id', userId)
      .single()



    if (dancerError || !dancerData) {
      console.error('Error getting dancer:', dancerError)
      return { success: false, error: 'Dancer profile not found' }
    }

    const dancerId = dancerData.id


    // Prepare metadata object (matching main app structure exactly)
    const metadataObject = {
      file: imagePath, // IMPORTANT: Main app includes this
      title: metadata.title,
      date: metadata.date,
      location: metadata.location || undefined,
      companyGroup: metadata.companyGroup || undefined,
      choreographers: metadata.choreographers || undefined,
      dancersPerformers: metadata.dancersPerformers || undefined,
      genreStyle: metadata.genreStyle || undefined,
      musicSoundtrack: metadata.musicSoundtrack || undefined,
      directorProducer: metadata.directorProducer || undefined,
      description: metadata.description || undefined,
      keywords: metadata.keywords || undefined,
      rightsPermissions: metadata.rightsPermissions || undefined,
    }

    // Remove undefined values to keep the object clean
    const cleanMetadataObject = Object.fromEntries(
      Object.entries(metadataObject).filter(([_, value]) => value !== undefined)
    )



    const insertData = {
      dancer_id: dancerId,
      name: fileName,
      path: imagePath,
      type: fileType,
      metadata: cleanMetadataObject, // Store as actual object
      other_organizations: null
    }



    // Save to dancer_gallery_files table (matching main app)
    const { data: insertResult, error: dbError } = await supabase
      .from('dancer_gallery_files')
      .insert(insertData)
      .select()


    if (dbError) {
      console.error('Database error:', dbError)
      return { success: false, error: dbError.message }
    }


    return { success: true }
  } catch (error) {
    console.error('Unexpected error:', error)
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