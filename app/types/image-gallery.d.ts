import { z } from "zod";
import {
  ImageGalleryFormSchema,
  UpdateImageGalleryFormSchema,
  ImageGallerySchema,
} from "@/zod/image-gallery";

export type FileDetail = {
  name: string;
  path: string;
  fileType: string;
};

// Base type for all gallery operations
export type ImageGallery = z.infer<typeof ImageGallerySchema>;

// Create type - file is required
export type ImageGalleryCreate = z.infer<typeof ImageGalleryFormSchema>;

// Update type - file is optional
export type ImageGalleryUpdate = z.infer<typeof UpdateImageGalleryFormSchema>;

// Metadata type (without file)
export type ImageGalleryMetadata = Omit<ImageGallery, "file">;

// Organization fields type for easier handling
export type ImageGalleryOrganization = {
  organizationId?: string;
  otherOrganization?: string;
};
