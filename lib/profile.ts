// Dentist identity cached from Supabase dentist_profiles after login. Read from localStorage everywhere else, so it works offline.
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  doctor_name: string | null;
  mobile: string | null;
  clinic_name: string | null;
  clinic_location: string | null;
};

const KEY = "oratrace_profile";

export function getProfile(): Profile | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function clearProfile(): void {
  localStorage.removeItem(KEY);
}

// One network call; a failure (offline, no row yet) leaves the cache untouched.
export async function cacheProfile(userId: string): Promise<void> {
  const { data } = await supabase
    .from("dentist_profiles")
    .select("id, doctor_name, mobile, clinic_name, clinic_location")
    .eq("id", userId)
    .maybeSingle();
  if (data) localStorage.setItem(KEY, JSON.stringify(data));
}
