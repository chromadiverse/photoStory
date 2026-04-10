import React from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { FormDescription } from "../ui/form";
import { Plus, X } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema"; 

interface PeopleDepictedSectionProps {
  peopleDepictedList: string[];
  setPeopleDepictedList: (list: string[]) => void;
  form: UseFormReturn<GalleryMetadataFormData>;
  onAutoSave: () => void;
}

export const PeopleDepictedSection: React.FC<PeopleDepictedSectionProps> = ({
  peopleDepictedList,
  setPeopleDepictedList,
  form,
  onAutoSave,
}) => {
  return (
    <div className="space-y-2">
      <Label>People Depicted</Label>
      <FormDescription>Names only, no roles</FormDescription>
      
      {peopleDepictedList.map((person, index) => (
        <div key={index} className="flex gap-2">
          <Input
            placeholder="Name"
            value={person}
            onChange={(e) => {
              const newList = [...peopleDepictedList];
              newList[index] = e.target.value;
              setPeopleDepictedList(newList);
              form.setValue("peopleDepicted", newList.filter(p => p));
            }}
            onBlur={onAutoSave}
          />
          {peopleDepictedList.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const newList = peopleDepictedList.filter((_, i) => i !== index);
                setPeopleDepictedList(newList);
                form.setValue("peopleDepicted", newList.filter(p => p));
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setPeopleDepictedList([...peopleDepictedList, ""]);
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Another Person
      </Button>
    </div>
  );
};