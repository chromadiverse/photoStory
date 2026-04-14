// gallery-metadata-schema.ts
import { z } from "zod";
import { ImageGallery } from "./image-gallery"; 
import { Organization } from "./orgaization";
import {
  ROLE_CATEGORIES,
} from "../constants/role-categories"
const optionalRoleCategorySchema = z
  .union([z.enum(ROLE_CATEGORIES), z.literal("")])
  .optional();

export type FormStep =
  | "uploadType"
  | "upload"
  | "conditional"
  | "metadata"
  | "complete";

export const GalleryMetadataSchema = z
  .object({
  uploadType: z.enum(["single", "multiple"]).optional(),


    collection_name: z.string().optional(),
    dateKnowledge: z
      .enum(["exact", "approximate"])
      .refine((val) => val !== undefined, {
        message: "Please select date knowledge",
      }),

    dateExact: z.string().optional(),
    dateMonth: z.string().optional(),
    dateDay: z.string().optional(),
    dateYear: z.string().optional(),
    dateDecade: z.string().optional(),

    hasOrganization: z.enum(["yes", "no"]).refine((val) => val !== undefined, {
      message: "Please select organization option",
    }),
    organizationId: z.string().optional(),
    organizationName: z.string().optional(),

    isCreativeWork: z.enum(["yes", "no"]).refine((val) => val !== undefined, {
      message: "Please select creative work option",
    }),
    workTitle: z.string().optional(),
    artistsProduction: z
      .array(
        z
          .object({
            name: z.string().optional(),
            displayTitle: z.string().optional(),
            role: z.string().optional(),
            roleCategory: optionalRoleCategorySchema,
            roleCategoryOther: z.string().optional(),
          })
          // Only require displayTitle if name is filled
          .refine(
            (data) => {
              const hasName = (data.name ?? "").trim().length > 0;
              if (!hasName) return true;
              return (data.displayTitle ?? data.role ?? "").trim().length > 0;
            },
            {
              message:
                "Role/contribution is required when adding a collaborator",
              path: ["displayTitle"],
            },
          ),
      )
      .optional(),
    genres: z.array(z.string()).optional(),

    title: z.string().min(1, "Title is required"),
    peopleDepicted: z.array(z.string()).optional(),
    description: z
      .string()
      .max(1000, "Description must be 1000 characters or less")
      .optional(),
    location: z.string().optional(),

    mediaCreator: z
      .object({
        name: z.string(),
        displayTitle: z.string().optional(),
        role: z.string().optional(),
        roleCategory: optionalRoleCategorySchema,
        roleCategoryOther: z.string().optional(),
      })
      .optional()
      .refine(
        (data) => {
          if (!data) return true;
          const hasAny =
            data?.name?.trim() ||
            data?.displayTitle?.trim() ||
            data?.role?.trim();
          if (!hasAny) return true;
          const hasName = !!data?.name?.trim();
          const hasTitle = !!(data?.displayTitle ?? data?.role ?? "").trim();
          return hasName && hasTitle;
        },
        {
          message:
            "Both name and role must be provided if either is filled",
        },
      ),
  })
 
  .refine(
    (data) => {
      if (data.dateKnowledge === "exact") {
        return !!data.dateExact && data.dateExact.trim().length > 0;
      }
      return true;
    },
    {
      message: "Exact date is required",
      path: ["dateExact"],
    },
  )
  .refine(
    (data) => {
      if (data.dateKnowledge === "approximate") {
        const hasApproximateDate =
          !!data.dateMonth?.trim() ||
          !!data.dateDay?.trim() ||
          !!data.dateYear?.trim() ||
          !!data.dateDecade?.trim();
        return hasApproximateDate;
      }
      return true;
    },
    {
      message: "At least one approximate date field is required",
      path: ["dateMonth"],
    },
  )
  .refine(
    (data) => {
      if (data.hasOrganization === "yes") {
        return !!data.organizationId?.trim() || !!data.organizationName?.trim();
      }
      return true;
    },
    {
      message: "Organization selection or name is required",
      path: ["organizationId"],
    },
  )
  .refine(
    (data) => {
      if (data.isCreativeWork === "yes") {
        return data.genres && data.genres.length > 0;
      }
      return true;
    },
    {
      message: "At least one genre must be selected for creative works",
      path: ["genres"],
    },
  )
  .refine(
    (data) => {
      if (data.isCreativeWork === "yes" && data.artistsProduction) {
        return data.artistsProduction.every((artist) => {
          const hasName = (artist.name ?? "").trim().length > 0;
          if (!hasName) return true;
          return (artist.displayTitle ?? artist.role ?? "").trim().length > 0;
        });
      }
      return true;
    },
    {
      message: "When adding a collaborator, a role/contribution is required",
      path: ["artistsProduction"],
    },
  )
  .refine(
    (data) => {
      if (data.uploadType === "multiple") {
        return data.collection_name && data.collection_name.trim().length > 0;
      }
      return true;
    },
    {
      message: "Collection name is required for multiple uploads",
      path: ["collection_name"],
    },
  );

export type GalleryMetadataFormData = z.infer<typeof GalleryMetadataSchema>;

export type ArtistProductionItem = {
  name: string;
  displayTitle?: string;
  role?: string;
  roleCategory?: string;
  roleCategoryOther?: string;
};

export type FileInfo = {
  name: string;
  path: string;
  type: string;
  documentType: string;
};

export interface ImageGalleryFormProps {
  mode?: "create" | "edit";
  galleryId?: string;
  galleryValues?: ImageGallery | null;
  filePath?: string;
  nameFile?: string;
  fileType?: string;
  setOpen?: (isOpen: boolean) => void;
  onSuccess?: () => void;
  organizations?: Organization[];
  onModalClose?: () => void;
}