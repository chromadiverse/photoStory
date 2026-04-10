import React from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema";

interface LocationSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  onAutoSave: () => void;
}

export const LocationSection: React.FC<LocationSectionProps> = ({
  form,
  onAutoSave,
}) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Location Information</h3>
        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
          Optional
        </span>
      </div>

      <FormField
        control={form.control}
        name="location"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
              Location
            </FormLabel>
            <FormDescription>
              Where this media was created or depicts (e.g., "New York City", "Paris, France", "Studio 54")
            </FormDescription>
            <FormControl>
              <Input
                placeholder="Enter location..."
                {...field}
                onBlur={() => {
                  onAutoSave();
                  form.trigger("location");
                }}
                className={fieldState.error ? "border-red-500" : ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};