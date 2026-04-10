import React from "react";
import {
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema"; 
import { RoleEntryFields } from "../shared/role-entry"; 
import { cn } from "@/lib/utils";

interface MediaCreatorSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  onAutoSave: () => void;
}

export const MediaCreatorSection: React.FC<MediaCreatorSectionProps> = ({
  form,
  onAutoSave,
}) => {
  const mediaCreator = (form.watch("mediaCreator") || {}) as {
    displayTitle?: string;
    role?: string;
    roleCategory?: string;
    roleCategoryOther?: string;
  };
  const displayTitle = (mediaCreator.displayTitle ??
    mediaCreator.role ??
    "") as string;
  const roleCategory = (mediaCreator.roleCategory ?? "") as string;
  const roleCategoryOther = (mediaCreator.roleCategoryOther ?? "") as string;

  return (
    <div className="space-y-4">
      <Label>Creator of this Media (e.g. photographer, videographer)</Label>
      <p className="text-sm text-gray-600">
        Both name and role (display title + category) are optional, but if you
        fill one, please fill all
      </p>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="mediaCreator.name"
          render={({ field, fieldState }) => (
            <FormItem>
              <Label>Name</Label>
              <FormControl>
                <Input
                  placeholder="Name"
                  {...field}
                  onBlur={onAutoSave}
                  className={cn(
                    "bg-surface mt-1",
                    fieldState.error && "border-red-500",
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
    <RoleEntryFields
  displayTitle={displayTitle}
  roleCategory={roleCategory}
  roleCategoryOther={roleCategoryOther}
  onDisplayTitleChange={(v) => {
    form.setValue("mediaCreator.displayTitle", v, { shouldValidate: true });
    form.setValue("mediaCreator.role", v, { shouldValidate: true });
    onAutoSave();
  }}
  onRoleCategoryChange={(v) => {
    form.setValue("mediaCreator.roleCategory", v as any, { shouldValidate: true });
    onAutoSave();
  }}
  onRoleCategoryOtherChange={(v) => {
    form.setValue("mediaCreator.roleCategoryOther", v, { shouldValidate: true });
    onAutoSave();
  }}
  displayTitlePlaceholder="e.g., Photographer"
  displayTitleLabel="Role / Contribution"
  nameFieldValue={form.watch("mediaCreator.name")}
  required={false}
/>
      </div>
      {form.formState.errors.mediaCreator && (
        <p className="text-sm text-red-500">
          {form.formState.errors.mediaCreator.message}
        </p>
      )}
    </div>
  );
};
