import { createClient } from './supabase/client'
import { GalleryMetadata } from './gallery-schema'

export async function saveGalleryMetadata(
  imagePath: string,
  imageUrl: string,
  metadata: GalleryMetadata,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    // Save metadata to database
    const { error: dbError } = await supabase
      .from('gallery_items') // Make sure this table exists
      .insert({
        user_id: userId,
        title: metadata.title,
        date: metadata.date,
        location: metadata.location || null,
        description: metadata.description || null,
        tags: metadata.tags || null,
        image_url: imageUrl,
        image_path: imagePath,
        created_at: new Date().toISOString()
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