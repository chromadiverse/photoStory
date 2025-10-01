import { z } from 'zod'

export const GalleryMetadataSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  location: z.string().optional(),
  description: z.string().optional(),
  tags: z.string().optional(),
})

export type GalleryMetadata = z.infer<typeof GalleryMetadataSchema>