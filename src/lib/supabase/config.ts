const fallbackUrl = "https://bwpmuknevcoshtufaytk.supabase.co";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackUrl;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
