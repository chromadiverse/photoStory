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
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Plus, X } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import {
  GalleryMetadataFormData,
  ArtistProductionItem,
} from "../../types/gallery-schema";
import { GENRES } from "@/app/lib/constants/gallery-constants"; 
import { RoleEntryFields } from "../shared/role-entry"; 

interface CreativeWorkSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  artistsProductionList: ArtistProductionItem[];
  setArtistsProductionList: (list: ArtistProductionItem[]) => void;
  genreInput: string;
  setGenreInput: (value: string) => void;
  showGenreSuggestions: boolean;
  setShowGenreSuggestions: (value: boolean) => void;
  onAutoSave: () => void;
}

export const CreativeWorkSection: React.FC<CreativeWorkSectionProps> = ({
  form,
  artistsProductionList,
  setArtistsProductionList,
  genreInput,
  setGenreInput,
  showGenreSuggestions,
  setShowGenreSuggestions,
  onAutoSave,
}) => {
  const selectedGenres = form.watch("genres") || [];
  const createEmptyArtist = (): ArtistProductionItem => ({
    name: "",
    displayTitle: "",
    roleCategory: undefined,
    roleCategoryOther: "",
  });

  const isArtistBlank = (artist: ArtistProductionItem) =>
    !(artist.name ?? "").trim() &&
    !(artist.displayTitle ?? artist.role ?? "").trim() &&
    !(artist.roleCategory ?? "").trim() &&
    !(artist.roleCategoryOther ?? "").trim();

  // Handle adding a new artist
  const handleAddArtist = () => {
    const newList = [...artistsProductionList, createEmptyArtist()];
    setArtistsProductionList(newList);
    form.setValue("artistsProduction", newList as any, {
      shouldValidate: true,
    });
  };

  // Handle removing an artist
  const handleRemoveArtist = (index: number) => {
    const newList = artistsProductionList.filter((_, i) => i !== index);
    setArtistsProductionList(newList);
    form.setValue("artistsProduction", newList as any, {
      shouldValidate: true,
    });
  };

  // Handle artist field change
  const handleArtistChange = (
    index: number,
    field: keyof ArtistProductionItem,
    value: string,
  ) => {
    const newList = [...artistsProductionList];
    if (field === "roleCategory") {
      newList[index].roleCategory = value || undefined;
    } else {
      newList[index][field] = value;
    }
    setArtistsProductionList(newList);
    form.setValue("artistsProduction", newList as any, {
      shouldValidate: true,
    });
  };

  // Handle removing a genre
  const handleRemoveGenre = (index: number) => {
    const newGenres = selectedGenres.filter(
      (_: string, i: number) => i !== index,
    );
    form.setValue("genres", newGenres, { shouldValidate: true });
    onAutoSave();
  };
  // Handle selecting a genre from suggestions
  const handleSelectGenre = (genre: string) => {
    const newGenres = [...selectedGenres, genre];
    form.setValue("genres", newGenres, { shouldValidate: true });
    setGenreInput("");
    setShowGenreSuggestions(false);
    onAutoSave();
  };

  // Handle adding a custom genre
  const handleAddCustomGenre = () => {
    if (genreInput.trim()) {
      const newGenres = [...selectedGenres, genreInput.trim()];
      form.setValue("genres", newGenres, { shouldValidate: true });
      setGenreInput("");
      setShowGenreSuggestions(false);
      onAutoSave();
    }
  };

  // Filter genres for suggestions
  const filteredGenres = GENRES.filter(
    (g) =>
      g.toLowerCase().includes(genreInput.toLowerCase()) &&
      !selectedGenres.includes(g),
  );

  // Check if genre is already in the list
  const isGenreExisting = GENRES.some(
    (g) => g.toLowerCase() === genreInput.toLowerCase(),
  );

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Creative Work Details</h3>
      </div>

      {/* Title of Work - Optional */}
      <FormField
        control={form.control}
        name="workTitle"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel
              className={fieldState.error ? "text-red-600 font-medium" : ""}
            >
              Title of Work
            </FormLabel>
            <FormDescription>
              The title of the performance or creative work depicted (optional)
            </FormDescription>
            <FormControl>
              <Input
                placeholder="Work title (if known)..."
                {...field}
                onBlur={() => {
                  onAutoSave();
                  form.trigger("workTitle");
                }}
                className={fieldState.error ? "border-red-500" : ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Artists and Production - Repeatable and Optional */}
      <div className="space-y-2">
        <Label
          className={`text-base font-medium ${
            form.formState.errors.artistsProduction ? "text-red-600" : ""
          }`}
        >
          Artists and Production
        </Label>
        <p className="text-sm text-gray-600">
          Add anyone who contributed creatively or in production (optional)
        </p>

        {artistsProductionList.map((artist, index) => {
          const artistError = form.formState.errors.artistsProduction?.[
            index
          ] as
            | {
                name?: { message?: string };
                displayTitle?: { message?: string };
                roleCategory?: { message?: string };
                roleCategoryOther?: { message?: string };
              }
            | undefined;
          const displayTitle = (artist.displayTitle ??
            artist.role ??
            "") as string;
          const roleCategory = (artist.roleCategory ?? "") as string;
          const roleCategoryOther = (artist.roleCategoryOther ?? "") as string;

          return (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-4">
                <div>
                  <Label>Name (if known)</Label>
                  <Input
                    placeholder="Name (if known)"
                    value={artist.name}
                    onChange={(e) =>
                      handleArtistChange(index, "name", e.target.value)
                    }
                    onBlur={onAutoSave}
                    className={
                      artistError?.name ? "border-red-500 mt-1" : "mt-1"
                    }
                  />
                  {artistError?.name && (
                    <p className="text-sm text-red-500 mt-1">
                      {artistError.name.message}
                    </p>
                  )}
                </div>
  <RoleEntryFields
  displayTitle={displayTitle}
  roleCategory={roleCategory}
  roleCategoryOther={roleCategoryOther}
  onDisplayTitleChange={(v) =>
    handleArtistChange(index, "displayTitle", v)
  }
  onRoleCategoryChange={(v) =>
    handleArtistChange(index, "roleCategory", v)
  }
  onRoleCategoryOtherChange={(v) =>
    handleArtistChange(index, "roleCategoryOther", v)
  }
  displayTitlePlaceholder="e.g., Choreographer"
  displayTitleLabel="Role / Contribution"
  displayTitleError={!!artistError?.displayTitle}
  roleCategoryError={!!artistError?.roleCategory}
  roleCategoryOtherError={!!artistError?.roleCategoryOther}
  nameFieldValue={artist.name}
  required={false}
/>
              </div>
              {(artistsProductionList.length > 1 || isArtistBlank(artist)) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveArtist(index)}
                  aria-label="Remove artist"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddArtist}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another
        </Button>

        {form.formState.errors.artistsProduction?.message && (
          <p className="text-sm text-red-500 mt-1">
            {form.formState.errors.artistsProduction.message}
          </p>
        )}
      </div>

      {/* Genre - Multi-select - REQUIRED */}
      <div className="space-y-2">
        <Label
          className={`text-base font-medium ${
            form.formState.errors.genres ? "text-red-600" : ""
          }`}
        >
          Dance Genre / Form <span className="text-red-500">*</span>
        </Label>
        <FormDescription>
          Start typing to see existing terms or add your own (required for
          creative works)
        </FormDescription>

        {selectedGenres.length > 0 ? (
          <div className="space-y-2">
            {selectedGenres.map((genre: string, index: number) => (
              <div
                key={`${genre}-${index}`}
                className="flex gap-2 items-center"
              >
                <Input
                  value={genre}
                  disabled
                  className="flex-1 bg-gray-50"
                  readOnly
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveGenre(index)}
                  aria-label={`Remove ${genre}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No genres selected yet</p>
        )}

        <div className="relative">
          <Input
            placeholder="Type to search or add genre..."
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onFocus={() => setShowGenreSuggestions(true)}
            aria-label="Search or add genre"
          />

          {showGenreSuggestions && genreInput && (
            <div
              className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto"
              role="listbox"
            >
              {filteredGenres.map((genre: string) => (
                <div
                  key={genre}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleSelectGenre(genre)}
                  role="option"
                  tabIndex={0}
                >
                  {genre}
                </div>
              ))}

              {genreInput.trim() && !isGenreExisting && (
                <div
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-t flex items-center gap-2"
                  onClick={handleAddCustomGenre}
                  role="option"
                  tabIndex={0}
                >
                  <Plus className="h-4 w-4" />
                  Add "{genreInput}" as a new genre/form
                </div>
              )}
            </div>
          )}
        </div>

        {form.formState.errors.genres && (
          <p className="text-sm text-red-500 mt-1">
            {form.formState.errors.genres.message}
          </p>
        )}
      </div>
    </div>
  );
};
