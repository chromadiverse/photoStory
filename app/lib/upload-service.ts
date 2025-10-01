import { createClient } from './supabase/client'
import { GalleryMetadata } from './gallery-schema'

export async function uploadImageToGallery(
  imageBlob: Blob,
  metadata: GalleryMetadata,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    // Generate unique filename
    const timestamp = Date.now()
    const filename = `${userId}/${timestamp}.jpg`

    // Upload image to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('gallery') // Make sure this bucket exists in Supabase
      .upload(filename, imageBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return { success: false, error: uploadError.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('gallery')
      .getPublicUrl(filename)

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
        image_url: urlData.publicUrl,
        image_path: filename,
        created_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Database error:', dbError)
      // Try to delete the uploaded image if DB insert fails
      await supabase.storage.from('gallery').remove([filename])
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