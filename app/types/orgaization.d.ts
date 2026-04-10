export type Organization = {
  id: string;
  name: string;
  url: string;
  created_at: string;
  parent_org_id?: string | null;
  custom_navigation_url: {
    url: string;
    name: string;
  } | null;
  media_assets: {
    logo: string;
    landing: string;
  } | null;
  metadata?: {
    location?: string | null;
    founded_year?: number | null;
    status?: "active" | "inactive" | "unknown" | null;
    website?: string | null;
  } | null;
  dancers_organizations: {
    dancer_id: string;
  }[];
  mission?: {
    title: string;
    description: string;
    images: {
      src: string;
      alt: string;
    }[];
  } | null;
  history?: {
    title: string;
    description: string;
    images: {
      src: string;
      alt: string;
    }[];
  } | null;
};
