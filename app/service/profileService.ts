// services/profileService.ts

interface FetchDancerIdResult {
  data: string | null;
  error: any;
}

export const fetchDancerIdByUserId = async (
  supabaseClient: any,
  userId: string
): Promise<FetchDancerIdResult> => {
  if (!userId) {
    console.error("fetchDancerIdByUserId: userId is required");
    return { data: null, error: new Error("User ID is required") };
  }

  try {
    console.log("[fetchDancerIdByUserId] Querying for userId:", userId);
    
    // Use maybeSingle() instead of single() to avoid 406 errors when no record exists
    const { data, error } = await supabaseClient
      .from('dancers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(); // Changed from .single() to .maybeSingle()

    if (error) {
      console.error("Supabase error fetching dancer ID:", error);
      return { data: null, error };
    }

    if (!data) {
      console.warn(`No dancer found for user_id: ${userId}`);
      return { data: null, error: null };
    }

    console.log("[fetchDancerIdByUserId] Found dancer ID:", data.id);
    return { data: data.id, error: null };
  } catch (err) {
    console.error("Unexpected error in fetchDancerIdByUserId:", err);
    return { data: null, error: err };
  }
};