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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema"; 
import { Organization } from "@/app/types/orgaization"; 

interface OrganizationSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  organizations: Organization[];
  onAutoSave: () => void;
}

export const OrganizationSection: React.FC<OrganizationSectionProps> = ({
  form,
  organizations,
  onAutoSave,
}) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Organization</h3>
      </div>
      
      <FormField
        control={form.control}
        name="organizationId"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
              Select Organization <span className="text-red-500">*</span>
            </FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("organizationName", "");
                form.clearErrors("organizationName");
                onAutoSave();
                form.trigger("organizationId");
              }}
              value={field.value}
            >
              <FormControl>
                <SelectTrigger className={fieldState.error ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent className="z-[60]">
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="text-sm text-gray-500 text-center my-2">- OR -</div>

      <div className="space-y-2">
        <FormLabel>
          Add new Organization <span className="text-red-500">*</span>
        </FormLabel>
        <FormDescription>
          If the organization doesn't appear in the list above
        </FormDescription>
        <Input
          placeholder="Organization name..."
          value={form.watch("organizationName") || ""}
          onChange={(e) => {
            form.setValue("organizationName", e.target.value);
            form.setValue("organizationId", "");
            form.clearErrors("organizationId");
          }}
          onBlur={() => {
            onAutoSave();
            form.trigger("organizationName");
          }}
          className={form.formState.errors.organizationName ? "border-red-500" : ""}
        />
      
        {form.formState.errors.organizationName && (
          <p className="text-sm font-medium text-destructive">
            {form.formState.errors.organizationName.message}
          </p>
        )}
      </div>
    </div>
  );
};