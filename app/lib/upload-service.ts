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

    // Prepare metadata object (matching main app structure)
    const metadataObject = {
      title: metadata.title,
      date: metadata.date,
      location: metadata.location || null,
      description: metadata.description || null,
      tags: metadata.tags || null,
    }

    // Save to dancer_gallery_files table (matching main app)
    const { error: dbError } = await supabase
      .from('dancer_gallery_files')
      .insert({
        dancer_id: dancerId,
        name: fileName,
        path: imagePath,
        type: fileType,
        metadata: JSON.stringify(metadataObject), // Store as JSON string
        created_at: new Date().toISOString(),
        other_organizations: null
      })

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
  // Adjust this based on your S3/CloudFlare setup
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT || process.env.S3_ENDPOINT
  return `${endpoint}/${bucketName}/${imagePath}`
}