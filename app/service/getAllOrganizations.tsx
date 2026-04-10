import { createAdminClient } from "../utils/supabase/admin"; 
import { Organization } from "../types/orgaization"; 
import { unstable_cache } from "next/cache";

export const getAllOrganizations = async () => {
  return getAllOrganizationsCached();
};

const getAllOrganizationsCached = unstable_cache(
  async (): Promise<Organization[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("organizations")
      .select(
        `
      id,
      name,
      url,
      created_at,
      custom_navigation_url,
      media_assets,
      metadata,
      mission,
      history,
      dancers_organizations(dancer_id)
    `,
      )
      .order("name", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return data as Organization[];
  },
  ["all-organizations-v1"],
  { revalidate: 300, tags: ["org-read"] },
);