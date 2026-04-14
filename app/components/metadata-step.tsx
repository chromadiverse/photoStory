"use client";

import React, { RefObject } from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "./ui/form"
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "../types/gallery-schema"; 
import { DateSection } from "./formsteps/date-step"; 
import { LocationSection } from "./formsteps/location-step"; 
import { OrganizationSection } from "./formsteps/organization-step"; 
import { CreativeWorkSection } from "./formsteps/creativework-step"; 
import { DescriptionSection } from "./formsteps/description-step"; 
import { MediaCreatorSection } from "./formsteps/mediacreator-step"; 
import { PeopleDepictedSection } from "./formsteps/peopledepicted-step"; 
import { Organization } from "../types/orgaization";

interface MetadataStepProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  formRef: RefObject<HTMLDivElement | null>;
  organizations: Organization[];
  peopleDepictedList: string[];
  setPeopleDepictedList: (list: string[]) => void;
  artistsProductionList: any[];
  setArtistsProductionList: (list: any[]) => void;
  genreInput: string;
  setGenreInput: (value: string) => void;
  showGenreSuggestions: boolean;
  setShowGenreSuggestions: (value: boolean) => void;
  onAutoSave: () => void;
  onSubmit: () => void;
  isSaving: boolean;
}

export const MetadataStep: React.FC<MetadataStepProps> = ({
  form,
  formRef,
  organizations,
  peopleDepictedList,
  setPeopleDepictedList,
  artistsProductionList,
  setArtistsProductionList,
  genreInput,
  setGenreInput,
  showGenreSuggestions,
  setShowGenreSuggestions,
  onAutoSave,
  onSubmit,
  isSaving,
}) => {
  const dateKnowledge = form.watch("dateKnowledge");
  const hasOrganization = form.watch("hasOrganization");
  const isCreativeWork = form.watch("isCreativeWork");

  return (
    <div ref={formRef} className="space-y-6">
      <h2 className="text-xl font-semibold">Metadata</h2>

      {/* Non-conditional: Title - Always Required */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">General Information</h3>

        <FormField
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel
                className={fieldState.error ? "text-red-600 font-medium" : ""}
              >
                Title <span className="text-red-500">*</span>
              </FormLabel>
              <FormDescription>
                A short, informal title to help others recognize this item
              </FormDescription>
              <FormControl>
                <Input
                  placeholder="Title..."
                  {...field}
                  onBlur={onAutoSave}
                  className={fieldState.error ? "border-red-500" : ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* NON-CONDITIONAL: Location Section - Always shown, optional */}
      <LocationSection form={form} onAutoSave={onAutoSave} />

      {/* CONDITIONAL: Date Fields */}
      {dateKnowledge && (
        <DateSection
          form={form}
          dateKnowledge={dateKnowledge}
          onAutoSave={onAutoSave}
        />
      )}

      {/* CONDITIONAL: Organization Fields */}
      {hasOrganization === "yes" && (
        <OrganizationSection
          form={form}
          organizations={organizations}
          onAutoSave={onAutoSave}
        />
      )}

      {/* CONDITIONAL: Creative Work Fields */}
      {isCreativeWork === "yes" && (
        <CreativeWorkSection
          form={form}
          artistsProductionList={artistsProductionList}
          setArtistsProductionList={setArtistsProductionList}
          genreInput={genreInput}
          setGenreInput={setGenreInput}
          showGenreSuggestions={showGenreSuggestions}
          setShowGenreSuggestions={setShowGenreSuggestions}
          onAutoSave={onAutoSave}
        />
      )}

      {/* Non-conditional: Other fields */}
      <div className="space-y-4">
        {/* People Depicted - Repeatable */}
        <PeopleDepictedSection
          peopleDepictedList={peopleDepictedList}
          setPeopleDepictedList={setPeopleDepictedList}
          form={form}
          onAutoSave={onAutoSave}
        />

        {/* Description */}
        <DescriptionSection form={form} onAutoSave={onAutoSave} />

        {/* Media Creator */}
        <MediaCreatorSection form={form} onAutoSave={onAutoSave} />
      </div>

      <Button
        type="button"
        disabled={isSaving}
        className="w-full sm:w-auto"
        onClick={onSubmit}
      >
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Media
      </Button>
    </div>
  );
};