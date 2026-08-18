import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bwpmuknevcoshtufaytk.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    })
  : null;
