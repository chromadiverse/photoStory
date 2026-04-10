import React from "react";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "../ui/form";
import { Textarea } from "../ui/textarea"; 
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema"; 

interface DescriptionSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  onAutoSave: () => void;
}

export const DescriptionSection: React.FC<DescriptionSectionProps> = ({ form, onAutoSave }) => {
  return (
    <FormField
      control={form.control}
      name="description"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>Description</FormLabel>
          <FormDescription>
            1000 character maximum
          </FormDescription>
          <FormControl>
            <Textarea
              placeholder="Describe this media..."
              className={`resize-none min-h-24 ${fieldState.error ? "border-red-500" : ""}`}
              maxLength={1000}
              {...field}
              onBlur={onAutoSave}
            />
          </FormControl>
          <div className="text-xs text-gray-500 text-right">
            {field.value?.length || 0}/1000
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};