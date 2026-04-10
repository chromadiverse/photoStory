import React from "react";
import { FormField, FormItem, FormControl, FormMessage } from "./ui/form";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "../types/gallery-schema"; 

interface ConditionalStepProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  onComplete: () => void;
}

export const ConditionalStep: React.FC<ConditionalStepProps> = ({ form, onComplete }) => {
  const handleConditionalComplete = () => {
    form.trigger(["dateKnowledge", "hasOrganization", "isCreativeWork"]).then((isValid) => {
      if (isValid) {
        onComplete();
      }
    });
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Tell us about this media</h2>
      
      {/* Q1: Date Knowledge */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <h3 className="text-base font-medium">
            Do you know the date of this media?{" "}
            <span className="text-red-500">*</span>
          </h3>
        </div>
        <FormField
          control={form.control}
          name="dateKnowledge"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-3">
              <FormControl>
                <RadioGroup
                  onValueChange={(value: "exact" | "approximate") => {
                    field.onChange(value);
                    if (value === "exact") {
                      form.clearErrors(["dateMonth", "dateDay", "dateYear", "dateDecade"]);
                    } else if (value === "approximate") {
                      form.clearErrors("dateExact");
                    }
                  }}
                  value={field.value}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="exact" id="date-exact" />
                    <Label htmlFor="date-exact" className="font-normal cursor-pointer">Exact</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="approximate" id="date-approximate" />
                    <Label htmlFor="date-approximate" className="font-normal cursor-pointer">Approximate</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Q2: Organization */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <h3 className="text-base font-medium">
            Is this media associated with an Organization?{" "}
            <span className="text-red-500">*</span>
          </h3>
        </div>
        <FormField
          control={form.control}
          name="hasOrganization"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-3">
              <FormControl>
                <RadioGroup
                  onValueChange={(value: "yes" | "no") => {
                    field.onChange(value);
                    if (value === "yes") {
                      form.clearErrors(["organizationId", "organizationName"]);
                    }
                  }}
                  value={field.value}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="org-yes" />
                    <Label htmlFor="org-yes" className="font-normal cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="org-no" />
                    <Label htmlFor="org-no" className="font-normal cursor-pointer">No</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Q3: Creative Work */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <h3 className="text-base font-medium">
            Does this media depict a performance or creative work?{" "}
            <span className="text-red-500">*</span>
          </h3>
        </div>
        <p className="text-sm text-gray-600 -mt-2">
          For example: a performance, rehearsal, screendance, costume, designs/plans/notes, or other creative work.
        </p>
        <FormField
          control={form.control}
          name="isCreativeWork"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-3">
              <FormControl>
                <RadioGroup
                  onValueChange={(value: "yes" | "no") => {
                    field.onChange(value);
                    if (value === "yes") {
                      form.clearErrors(["workTitle", "artistsProduction", "genres"]);
                    }
                  }}
                  value={field.value}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="creative-yes" />
                    <Label htmlFor="creative-yes" className="font-normal cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="creative-no" />
                    <Label htmlFor="creative-no" className="font-normal cursor-pointer">No</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Button
        type="button"
        onClick={handleConditionalComplete}
        className="w-full sm:w-auto"
      >
        Continue to Metadata
      </Button>
    </div>
  );
};