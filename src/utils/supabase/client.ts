import { createBrowserClient } from "@supabase/ssr";

const DEFAULT_SUPABASE_URL = "https://mfomddfsooruegqinjks.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "sb_publishable_9y8dw8xPwwkHcG-fDXgiQw_RIyjGJEH";

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("your-project-id") &&
      !url.includes("YOUR_PROJECT_ID") &&
      !key.includes("your-supabase-anon-key") &&
      !key.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createBrowserClient(url, key);
}
