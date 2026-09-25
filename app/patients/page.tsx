"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function Home() {
  const [query, setQuery] = useState("");

  const patients = useLiveQuery(async () => {
    const all = await db.patients.toArray();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q)
    );
  }, [query]);

  const searching = query.trim() !== "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Patients</h1>
        <Link href="/patient/new" className="btn btn-primary">
          New patient
        </Link>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Search patients</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          enterKeyHint="search"
          className="field"
        />
      </label>

      {patients?.length === 0 && (
        <div className="animate-fade flex flex-col items-start gap-3 rounded-2xl bg-surface-2 px-5 py-8">
          <p className="text-lg font-medium">{searching ? "No patient matches that search." : "No patients yet."}</p>
          <p className="text-muted">
            {searching
              ? "Check the spelling or search by the 10-digit phone number."
              : "Add the first patient to start a screening."}
          </p>
          {!searching && (
            <Link href="/patient/new" className="btn btn-primary">
              Add a patient
            </Link>
          )}
        </div>
      )}

      {!!patients?.length && (
        <ul className="card divide-y divide-border overflow-hidden">
          {patients.map((p) => (
            <li key={p.id}>
              <Link
                href={`/patient?id=${p.id}`}
                className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors duration-150 hover:bg-surface-2 active:bg-surface-2"
              >
                <span className="text-lg font-medium">{p.name}</span>
                <span className="tabular-nums text-muted">{p.phone}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
