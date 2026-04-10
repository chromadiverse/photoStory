/**
 * Controlled vocabulary for role categories.
 * Used for searchable categorization across organization affiliation roles
 * and gallery metadata (Artists & Production, Creator of this Media).
 */
export const ROLE_CATEGORIES = [
  "Artist",
  "Artistic Direction & Administration",
  "Education & Training",
  "Executive & General Management",
  "Community & Public Programs",
  "Production & Technical",
  "Development & Fundraising",
  "Marketing & Communications",
  "Operations & Administration",
  "Research, Archives & Documentation",
  "Board & Governance",
  "Student / Trainee",
  "Other",
] as const;

export const ROLE_CATEGORY_OTHER = "Other" as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
