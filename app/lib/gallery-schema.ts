import { z } from 'zod'

export const GalleryMetadataSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  location: z.string().optional(),
  companyGroup: z.string().optional(),
  choreographers: z.string().optional(),
  dancersPerformers: z.string().optional(),
  genreStyle: z.string().optional(),
  musicSoundtrack: z.string().optional(),
  directorProducer: z.string().optional(),
  description: z.string().optional(),
  keywords: z.string().optional(),
  rightsPermissions: z.string().optional(),
})

export type GalleryMetadata = z.infer<typeof GalleryMetadataSchema>