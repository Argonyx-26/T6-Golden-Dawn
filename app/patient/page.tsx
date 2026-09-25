"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { ACTION_LABEL, overrideNote } from "@/lib/rules";
import { getReminderDays, recallStatus, waLink } from "@/lib/recall";
import { getProfile } from "@/lib/profile";
import HabitFields, { type HabitFormValue } from "@/components/HabitFields";
import type { RecallStatus } from "@/lib/recall";

// Overdue is the one recall state that is a danger; the rest stay in the neutral/accent family.
const STATUS_TONE: Record<RecallStatus, string> = {
  upcoming: "bg-surface text-muted",
  reminder: "bg-accent-soft text-accent",
  "due today": "bg-accent text-accent-foreground",
  overdue: "bg-danger text-white",
};

export default function PatientPage() {
  return (
    <Suspense>
      <PatientDetail />
    </Suspense>
  );
}

function PatientDetail() {
  const searchParams = useSearchParams();
  const id = Number(searchParams.get("id"));

  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  const habit = useLiveQuery(() => db.habits.where("patientId").equals(id).first(), [id]);
  const lesions = useLiveQuery(
    () => db.lesions.where("patientId").equals(id).toArray(),
    [id]
  );

  const recalls = useLiveQuery(async () => {
    const ids = (lesions ?? []).map((l) => l.id!);
    const all = await db.recalls.where("lesionId").anyOf(ids).toArray();
    return all.filter((r) => r.status === "pending");
  }, [lesions]);

  const captureCounts = useLiveQuery(async () => {
    const counts: Record<number, number> = {};
    for (const l of lesions ?? []) {
      counts[l.id!] = await db.captures.where("lesionId").equals(l.id!).count();
    }
    return counts;
  }, [lesions]);

  // Latest capture per lesion, so an undecided result is always one tap away.
  const latestCapture = useLiveQuery(async () => {
    const latest: Record<number, number> = {};
    for (const l of lesions ?? []) {
      const last = await db.captures.where("lesionId").equals(l.id!).sortBy("takenAt");
      if (last.length) latest[l.id!] = last[last.length - 1].id!;
    }
    return latest;
  }, [lesions]);

  // Saved decisions per lesion (via its captures), oldest first.
  const history = useLiveQuery(async () => {
    const caps = await db.captures.where("lesionId").anyOf((lesions ?? []).map((l) => l.id!)).toArray();
    const lesionOf = new Map(caps.map((c) => [c.id!, c.lesionId]));
    const decisions = await db.decisions.where("captureId").anyOf([...lesionOf.keys()]).sortBy("decidedAt");
    return decisions.map((d) => ({ ...d, lesionId: lesionOf.get(d.captureId)! }));
  }, [lesions]);

  const profile = getProfile(); // cached at login; AuthGate only renders this page after that
  const [draft, setDraft] = useState<HabitFormValue | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (habit && !editing) {
      const { id: _id, patientId: _patientId, ...rest } = habit;
      setDraft(rest);
    }
  }, [habit, editing]);

  async function saveHabits() {
    if (!draft || !habit?.id) return;
    await db.habits.update(habit.id, draft);
    setEditing(false);
  }

  if (!patient) {
    return (
      <p role="status" className="animate-fade p-6 text-center text-muted">
        Loading patient…
      </p>
    );
  }

  const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/patients" className="btn btn-ghost -ml-3 self-start text-muted">
            All patients
          </Link>
          <h1 className="text-3xl font-semibold">{patient.name}</h1>
          <p className="text-muted">
            {patient.age} yrs · <span className="capitalize">{patient.sex}</span> ·{" "}
            <span className="tabular-nums">{patient.phone}</span>
          </p>
        </div>
        <Link href={`/capture?patientId=${id}`} className="btn btn-primary btn-lg">
          New capture
        </Link>
      </header>

      <section aria-labelledby="lesions" className="flex flex-col gap-3">
        <h2 id="lesions" className="text-xl font-semibold">
          Lesions
        </h2>
        {lesions?.length === 0 && (
          <p className="rounded-2xl bg-surface-2 px-5 py-6 text-muted">
            No lesions recorded yet. Start with a new capture.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {lesions?.map((l) => {
            const recall = recalls?.find((r) => r.lesionId === l.id);
            const status = recall && recallStatus(recall.dueDate, now(), getReminderDays());
            const decisions = history?.filter((d) => d.lesionId === l.id) ?? [];
            const latestId = latestCapture?.[l.id!];
            const undecided = latestId !== undefined && history !== undefined && !decisions.some((d) => d.captureId === latestId);
            return (
              <li key={l.id} className="card flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold capitalize">{l.site}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      <span className="tabular-nums">
                        {captureCounts?.[l.id!] ?? 0} {captureCounts?.[l.id!] === 1 ? "photo" : "photos"}
                      </span>
                      {undecided && (
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 font-semibold text-accent">No decision yet</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {latestId !== undefined && (
                      <Link
                        href={`/result?captureId=${latestId}`}
                        className={`btn ${undecided ? "btn-primary" : "btn-secondary"}`}
                      >
                        Latest result
                      </Link>
                    )}
                    {(captureCounts?.[l.id!] ?? 0) >= 2 && (
                      <Link href={`/compare?lesionId=${l.id}`} className="btn btn-secondary">
                        Compare photos
                      </Link>
                    )}
                  </div>
                </div>

                {recall && status && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Recall {dateText(recall.dueDate)}</span>
                      <span className={`rounded-md px-2 py-0.5 text-sm font-semibold capitalize ${STATUS_TONE[status]}`}>
                        {status}
                      </span>
                    </p>
                    {status !== "upcoming" && (
                      <a
                        href={waLink({
                          phone: patient.phone,
                          name: patient.name,
                          clinic: profile?.clinic_name || "your dentist's clinic",
                          clinicPhone: profile?.mobile ?? "",
                          due: recall.dueDate,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                      >
                        WhatsApp reminder
                      </a>
                    )}
                  </div>
                )}

                {decisions.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                    {decisions.map((d) => {
                      const note = overrideNote(d);
                      return (
                        <li key={d.id} className="text-muted">
                          <span className="tabular-nums">{dateText(d.decidedAt)}</span>
                          {" · "}
                          <strong className={d.final === "refer" ? "text-danger" : "text-foreground"}>
                            {ACTION_LABEL[d.final]}
                          </strong>
                          {note && ` — ${note}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="habits" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="habits" className="text-xl font-semibold">
            Habits and risk factors
          </h2>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">
              Edit
            </button>
          )}
        </div>
        {draft && (
          <>
            {/* Native disabled fieldset: read-only until Edit, so nothing looks tappable that isn't. */}
            <fieldset disabled={!editing} className="min-w-0">
              <HabitFields value={draft} onChange={editing ? setDraft : () => {}} />
            </fieldset>
            {editing && (
              <div className="animate-enter sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-background/95 px-4 py-3">
                <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-lg">
                  Cancel
                </button>
                <button type="button" onClick={saveHabits} className="btn btn-primary btn-lg">
                  Save habits
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
