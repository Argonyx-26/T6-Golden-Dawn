"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import PatientAvatar from "@/components/PatientAvatar";

export default function PatientListPage() {
  const [query, setQuery] = useState("");
  const patients = useLiveQuery(async () => {
    const all = await db.patients.toArray();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  }, [query]);
  const searching = query.trim() !== "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-1">
        <Link href="/patients" className="btn btn-ghost -ml-3 self-start text-muted">Back</Link>
        <h1 className="text-3xl font-semibold">Existing patients</h1>
        <p className="text-muted">Search by name or phone, then open the full patient record.</p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Search patients</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone" enterKeyHint="search" className="field" />
      </label>

      {patients?.length === 0 && (
        <div className="animate-fade flex flex-col items-start gap-3 rounded-2xl bg-surface-2 px-5 py-8">
          <p className="text-lg font-medium">{searching ? "No patient matches that search." : "No patients yet."}</p>
          <p className="text-muted">{searching ? "Check the spelling or search by the 10-digit phone number." : "Add the first patient to start a screening."}</p>
          {!searching && <Link href="/patient/new" className="btn btn-primary">Add a patient</Link>}
        </div>
      )}

      {!!patients?.length && (
        <ul className="card divide-y divide-border overflow-hidden">
          {patients.map((p) => (
            <li key={p.id}>
              <Link href={`/patient?id=${p.id}`} className="flex min-h-20 items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2">
                <PatientAvatar profilePhoto={p.profilePhoto} label={p.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-lg font-medium">{p.name}</span>
                  <span className="text-sm text-muted">{p.age} yrs · {p.sex}</span>
                </span>
                <span className="tabular-nums text-muted">{p.phone}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
