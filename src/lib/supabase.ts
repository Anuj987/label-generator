import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export { supabaseConfigured } from "@/lib/supabase/config";

export const supabase = supabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : null;
