"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authErrorMessage, supabase } from "@/lib/supabase";

const field = "field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    router.replace("/patients");
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <p className="text-lg font-semibold tracking-tight text-accent">OraTrace</p>
      <h1 className="mb-2 text-3xl font-semibold">Dentist log in</h1>
      <label className="flex flex-col gap-1.5">
        <span className="label">Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Password</span>
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-2">
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="text-muted">
        New here? <Link href="/signup" className="inline-flex min-h-tap items-center font-medium text-accent underline underline-offset-4">Create an account</Link>
      </p>
    </form>
  );
}
