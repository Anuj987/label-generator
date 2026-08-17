import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Role, UserProfile } from "@/lib/types";

const DISPLAY_NAME: Record<Role, string> = {
  admin: "Anuj",
  packing: "Somnath",
  delivery: "Mayur",
};

function isRole(value: string): value is Role {
  return value === "admin" || value === "packing" || value === "delivery";
}

export async function fetchStaffProfileByAuthId(authUserId: string): Promise<UserProfile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,active,auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.active === false) return null;
  if (!isRole(String(data.role))) return null;

  const role = data.role as Role;
  return {
    id: String(data.id),
    name: DISPLAY_NAME[role] || String(data.name),
    role,
  };
}

export async function signInWithEmailPassword(email: string, password: string) {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase Auth is not configured");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error("Login failed");

  const profile = await fetchStaffProfileByAuthId(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error("This account is not linked to an Operations Console staff user.");
  }

  return profile;
}

export async function signOutStaff() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSessionStaffProfile(): Promise<UserProfile | null> {
  if (!supabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  const authUserId = data.session?.user?.id;
  if (!authUserId) return null;
  return fetchStaffProfileByAuthId(authUserId);
}
