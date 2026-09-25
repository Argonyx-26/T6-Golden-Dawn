import { createClient } from "@supabase/supabase-js";

// Auth only. Never send clinical data (anything in lib/db.ts) through this client.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && key);

// Placeholders keep `next build` working before .env.local is filled in; calls then fail with the "not configured" message.
export const supabase = createClient(url || "https://not-configured.supabase.co", key || "not-configured");

export function authErrorMessage(e: { message: string; code?: string; name?: string }, configured = supabaseConfigured): string {
  if (!configured) return "Sign-in isn't configured: add the Supabase URL and anon key to .env.local, then rebuild.";
  if (e.name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(e.message))
    return "Can't reach the sign-in server. Check your internet connection and try again.";
  switch (e.code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Log in instead.";
    case "weak_password":
      return `Password is too weak. ${e.message}`;
    case "email_not_confirmed":
      return "Confirm your email first (check your inbox), then log in.";
  }
  return e.message;
}
