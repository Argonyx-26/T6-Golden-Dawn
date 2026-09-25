"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheProfile, getProfile } from "@/lib/profile";

const PUBLIC_PATHS = ["/", "/login", "/signup"]; // "/" only forwards to the static landing page
let triedFor: string | null = null; // don't refetch on every navigation if the profile row is missing

// Static export has no middleware, so gating is client-side. getSession() reads the local cache (no network),
// which keeps the app usable offline after one online login, until the access token expires.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const open = PUBLIC_PATHS.includes(pathname);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (open) return;
    let live = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id;
      if (uid && getProfile()?.id !== uid && triedFor !== uid) {
        triedFor = uid;
        // First login on this browser (or a different dentist): fetch the profile once. Cap the wait so a dead network can't block the app.
        await Promise.race([cacheProfile(uid), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
      }
      if (!live) return;
      if (uid) setAuthed(true);
      else router.replace("/login");
    });
    return () => {
      live = false;
    };
  }, [open, pathname, router]);

  if (open) return children;
  if (authed)
    return (
      <>
        <AppHeader />
        {children}
      </>
    );
  return (
    <p role="status" className="animate-fade p-6 text-center text-sm text-muted">
      Checking sign-in…
    </p>
  );
}

// Wayfinding for signed-in screens: the wordmark always leads home, Settings is one tap away.
function AppHeader() {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className="btn btn-ghost text-muted aria-[current=page]:text-foreground"
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-1.5 md:px-8">
        <Link href="/patients" className="btn btn-ghost -ml-3 text-lg font-semibold tracking-tight text-foreground">
          OraTrace
        </Link>
        <div className="flex items-center gap-1">
          {link("/patients", "Patients")}
          {link("/settings", "Settings")}
        </div>
      </nav>
    </header>
  );
}
