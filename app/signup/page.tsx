"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authErrorMessage, supabase } from "@/lib/supabase";

const field = "field";

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", mobile: "", dob: "", clinic: "", location: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password });
      if (error) return setError(authErrorMessage(error));
      // With "Confirm email" on, Supabase hides duplicates by returning a user with no identities.
      if (data.user?.identities?.length === 0) return setError("An account with this email already exists. Log in instead.");
      if (!data.session || !data.user)
        return setError("Account created, but Supabase requires email confirmation. Turn off Auth → Sign In / Providers → Email → \"Confirm email\" for this app, or confirm and log in.");

      const { error: profileError } = await supabase.from("dentist_profiles").insert({
        id: data.user.id,
        doctor_name: f.name.trim(),
        mobile: f.mobile,
        dob: f.dob,
        clinic_name: f.clinic.trim(),
        clinic_location: f.location.trim() || null,
      });
      if (profileError) return setError(`Account created, but saving your profile failed: ${authErrorMessage(profileError)}`);
      router.replace("/patients");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <p className="text-lg font-semibold tracking-tight text-accent">OraTrace</p>
      <h1 className="mb-2 text-3xl font-semibold">Create dentist account</h1>
      <label className="flex flex-col gap-1.5">
        <span className="label">Doctor&apos;s name</span>
        <input type="text" required autoComplete="name" value={f.name} onChange={set("name")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Email</span>
        <input type="email" required autoComplete="email" value={f.email} onChange={set("email")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Password (at least 6 characters)</span>
        <input type="password" required minLength={6} autoComplete="new-password" value={f.password} onChange={set("password")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Mobile number</span>
        <input
          type="tel"
          required
          pattern="[6-9][0-9]{9}"
          title="10-digit Indian mobile number"
          maxLength={10}
          value={f.mobile}
          onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, "") })}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Date of birth</span>
        <input type="date" required value={f.dob} onChange={set("dob")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Clinic name</span>
        <input type="text" required value={f.clinic} onChange={set("clinic")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Clinic location (optional)</span>
        <input type="text" value={f.location} onChange={set("location")} className={field} />
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-2">
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-muted">
        Already registered? <Link href="/login" className="inline-flex min-h-tap items-center font-medium text-accent underline underline-offset-4">Log in</Link>
      </p>
    </form>
  );
}
