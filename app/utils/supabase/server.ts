import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTES } from "@/utils/routes";

const isReadonlyCookieMutationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes(
    "Cookies can only be modified in a Server Action or Route Handler"
  );
};

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // In Server Components, Next.js exposes read-only cookies.
            // Supabase may still attempt a refresh write; ignore this known case.
            if (!isReadonlyCookieMutationError(error)) {
              console.error("Unexpected cookie write error", error);
            }
          }
        },
      },
    }
  );
};

export const createClientAndUser = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.HOME);
  return { supabase, userId: user?.id };
};

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
