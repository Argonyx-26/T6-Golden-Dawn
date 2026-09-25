"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { getDayOffset, now, setDayOffset } from "@/lib/clock";
import { getReminderDays, setReminderDays } from "@/lib/recall";
import { clearProfile } from "@/lib/profile";
import { useDayOffset } from "@/components/DemoBanner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const noop = () => () => {};

export default function SettingsPage() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <Settings /> : null;
}

function Settings() {
  const offset = useDayOffset();
  const router = useRouter();
  const [days, setDays] = useState(() => String(getReminderDays()));

  const btn = "btn btn-secondary tabular-nums";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <section aria-labelledby="clock" className="card flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="clock" className="text-xl font-semibold">
            Demo clock
          </h2>
          <p className="text-muted">
            App date{" "}
            <strong className="text-foreground">
              {now().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </strong>{" "}
            <span className="tabular-nums">(offset {offset} days)</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className={btn} onClick={() => setDayOffset(getDayOffset() - 1)}>−1 day</button>
          <button className={btn} onClick={() => setDayOffset(getDayOffset() + 1)}>+1 day</button>
          <button className={btn} onClick={() => setDayOffset(getDayOffset() + 14)}>+14 days</button>
          <button className={btn} onClick={() => setDayOffset(0)}>Reset</button>
        </div>
      </section>

      <section aria-labelledby="recalls" className="card flex flex-col gap-3 p-5 md:p-6">
        <h2 id="recalls" className="text-xl font-semibold">
          Recalls
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="label">Reminder window (days before due)</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== "" && n >= 0) setReminderDays(n);
            }}
            className="field max-w-40 tabular-nums"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/patients" className="btn btn-ghost -ml-3">
          Back to patients
        </Link>
        <button
          className="btn btn-secondary"
          onClick={async () => {
            // Clears the local session even offline (only the server-side revoke fails then).
            await supabase.auth.signOut();
            clearProfile();
            router.replace("/login");
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
