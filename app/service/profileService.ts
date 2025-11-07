// services/profileService.ts
import { createClient } from '../lib/supabase/client';

interface FetchDancerIdResult {
  data: string | null; // Just the dancer ID as string
  error: any;
}

/**
 * Fetches the dancer ID for the currently authenticated user.
 * @param supabaseClient - An initialized Supabase client instance
 * @param userId - The authenticated user's ID (user.id from auth)
 * @returns An object containing the dancer ID or an error
 */
export const fetchDancerIdByUserId = async (
  supabaseClient: any,
  userId: string
): Promise<FetchDancerIdResult> => {
  if (!userId) {
    console.error("fetchDancerIdByUserId: userId is required");
    return { data: null, error: new Error("User ID is required") };
  }

  try {
    const { data, error, status } = await supabaseClient
      .from('dancers')
      .select('id') // Only select the ID field
      .eq('user_id', userId)
      .single();

    if (error && status !== 406) {
      console.error("Supabase error fetching dancer ID:", error);
      return { data: null, error };
    }

    if (!data) {
      console.warn(`No dancer found for user_id: ${userId}`);
      return { data: null, error: null };
    }

    // Return just the dancer ID string
    return { data: data.id, error: null };
  } catch (err) {
    console.error("Unexpected error in fetchDancerIdByUserId:", err);
    return { data: null, error: err };
  }
};