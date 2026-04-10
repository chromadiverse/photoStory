"use client";

import React from "react";
import { Input } from "../ui/input"; 
import { Label } from "../ui/label"; 
import { cn } from "@/lib/utils";

interface RoleEntryFieldsProps {
  displayTitle: string;
  roleCategory: string;
  roleCategoryOther?: string;
  onDisplayTitleChange: (value: string) => void;
  onRoleCategoryChange: (value: string) => void;
  onRoleCategoryOtherChange?: (value: string) => void;
  displayTitlePlaceholder?: string;
  displayTitleLabel?: string;
  roleCategoryLabel?: string;
  displayTitleError?: boolean;
  roleCategoryError?: boolean;
  roleCategoryOtherError?: boolean;
  required?: boolean;
  className?: string;
  /** When provided, role/contribution fields are hidden until this has a value */
  nameFieldValue?: string;
}

/**
 * Composes Display Title field.
 * Role Category fields are kept in props for backward compatibility but not rendered here.
 * Used across organization affiliation roles and gallery metadata.
 */
export function RoleEntryFields({
  displayTitle,
  onDisplayTitleChange,
  displayTitlePlaceholder = "e.g., Lead Scenic Designer",
  displayTitleLabel = "Display Title",
  displayTitleError = false,
  required = true,
  className,
  nameFieldValue,
}: RoleEntryFieldsProps) {
  const showFields = nameFieldValue === undefined || nameFieldValue.trim().length > 0;

  if (!showFields) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="display-title">
          {displayTitleLabel}{" "}
          {required && <span className="text-red-500">*</span>}
        </Label>
        <Input
          id="display-title"
          value={displayTitle}
          onChange={(e) => onDisplayTitleChange(e.target.value)}
          placeholder={displayTitlePlaceholder}
          className={cn("bg-surface", displayTitleError && "border-red-500")}
        />
      </div>
    </div>
  );
}