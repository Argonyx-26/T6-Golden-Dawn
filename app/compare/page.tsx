"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Capture } from "@/lib/db";
import { MOCK_VERSION } from "@/lib/model";
import { camSlice } from "@/lib/postprocess";
import { heatmapUrl } from "@/lib/heatmap";
import DecisionPanel from "@/components/DecisionPanel";

// Risk-score change (0-1) that counts as better/worse; smaller moves are "same". First guess, tune with the dentist.
const CHANGE_THRESHOLD = 0.05;

// Class order per CONTRACT.md.
const CLASS_LABELS = ["Healthy", "Normal variation", "OPMD", "Oral cancer"];

type Change = "better" | "same" | "worse";
const CHANGES: Change[] = ["better", "same", "worse"];
const CHANGE_LABEL: Record<Change, string> = { better: "Better", same: "Same", worse: "Worse" };
// Selected fill per change. Worse is red because it leads to refer (RC1).
const CHANGE_ON: Record<Change, string> = {
  better: "aria-pressed:border-accent aria-pressed:bg-accent",
  same: "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background",
  worse: "aria-pressed:border-danger aria-pressed:bg-danger",
};
const CHANGE_TEXT: Record<Change, string> = { better: "text-accent", same: "text-muted", worse: "text-danger" };

// Risk score = P(OPMD) + P(oral cancer), as a whole percent so the verdict matches the numbers on screen.
const riskPct = (c: Capture) => Math.round((c.probs[2] + c.probs[3]) * 100);
const dateText = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dayStart = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export default function ComparePage() {
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}

function Compare() {
  const lesionId = Number(useSearchParams().get("lesionId"));
  const lesion = useLiveQuery(() => db.lesions.get(lesionId), [lesionId]);
  const patient = useLiveQuery(
    () => (lesion ? db.patients.get(lesion.patientId) : undefined),
    [lesion]
  );
  const captures = useLiveQuery(
    async () =>
      (await db.captures.where("lesionId").equals(lesionId).sortBy("takenAt")).filter(
        (c) => c.probs
      ),
    [lesionId]
  );
  // Picked positions in `captures`; null = default (baseline / latest).
  const [pickLeft, setPickLeft] = useState<number | null>(null);
  const [pickRight, setPickRight] = useState<number | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  if (captures === undefined || lesion === undefined) return null;
  if (lesion === null) return <Notice title={`Lesion #${lesionId} not found.`} />;

  const backHref = `/patient?id=${lesion.patientId}`;
  if (captures.length < 2) {
    return (
      <Notice title="Not enough captures to compare yet">
        <p>
          This {lesion.site} lesion has {captures.length === 0 ? "no captures" : "1 capture"}. Take a recheck photo
          and it can be compared with the first one.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href={`/capture?patientId=${lesion.patientId}`} className="btn btn-primary">
            Take a recheck photo
          </Link>
          <Link href={backHref} className="btn btn-secondary">
            Back to {patient?.name ?? "patient"}
          </Link>
        </div>
      </Notice>
    );
  }

  const last = captures.length - 1;
  const li = Math.min(pickLeft ?? 0, last - 1);
  const ri = Math.max(pickRight ?? last, li + 1);
  const a = captures[li];
  const b = captures[ri];
  const days = Math.round((dayStart(b.takenAt) - dayStart(a.takenAt)) / 86_400_000);
  const mock = a.metaVersion === MOCK_VERSION || b.metaVersion === MOCK_VERSION;

  const label = (i: number) =>
    `Visit ${i + 1}, ${dateText(captures[i].takenAt)}${i === 0 ? " (baseline)" : i === last ? " (latest)" : ""}`;
  const select = "field w-auto pr-10";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 md:gap-12 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1">
          <Link href={backHref} className="btn btn-ghost -ml-3 self-start text-muted">
            {patient?.name ?? "Patient"}
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold capitalize md:text-4xl">
            {lesion.site} lesion
            {mock && (
              <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold tracking-wide text-white normal-case">
                MOCK MODEL
              </span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="left">Earlier photo</label>
          <select id="left" value={li} onChange={(e) => setPickLeft(Number(e.target.value))} className={select}>
            {captures.map((_, i) => (
              <option key={i} value={i} disabled={i >= ri}>{label(i)}</option>
            ))}
          </select>
          <span aria-hidden className="text-faint">vs</span>
          <label className="sr-only" htmlFor="right">Later photo</label>
          <select id="right" value={ri} onChange={(e) => setPickRight(Number(e.target.value))} className={select}>
            {captures.map((_, i) => (
              <option key={i} value={i} disabled={i <= li}>{label(i)}</option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={showHeatmap}
            onClick={() => setShowHeatmap((v) => !v)}
            className="choice font-medium"
          >
            Heat-map {showHeatmap ? "on" : "off"}
          </button>
        </div>
      </header>

      <div className="grid gap-10 md:grid-cols-2 md:gap-12">
        <Column capture={a} visit={li + 1} showHeatmap={showHeatmap} />
        <Column capture={b} visit={ri + 1} showHeatmap={showHeatmap} />
      </div>

      {/* Keyed by the pair: picking other photos resets the dentist's Better/Same/Worse and final choice. */}
      <Verdict key={`${a.id}-${b.id}`} later={b} riskA={riskPct(a)} riskB={riskPct(b)} days={days} />
    </div>
  );
}

function Verdict({ later, riskA, riskB, days }: { later: Capture; riskA: number; riskB: number; days: number }) {
  const delta = riskB - riskA;
  const t = Math.round(CHANGE_THRESHOLD * 100);
  const auto: Change = delta <= -t ? "better" : delta >= t ? "worse" : "same";
  const [picked, setPicked] = useState<Change | null>(null);
  const change = picked ?? auto;
  // A saved decision is final (write-once), so the change can't be re-picked for it.
  const decided = useLiveQuery(
    async () => (await db.decisions.where("captureId").equals(later.id!).count()) > 0,
    [later.id]
  );

  return (
    <>
      <section aria-label="Change between the two photos" className="card flex flex-col items-center gap-3 px-4 py-10 text-center md:py-12">
        <p className="text-xl text-muted">
          {days === 0 ? "Same day" : `${days} ${days === 1 ? "day" : "days"} apart`}
        </p>
        <p className="text-4xl font-semibold tabular-nums md:text-6xl">
          Risk score {riskA}% <span className="text-faint">→</span> {riskB}%
        </p>
        <p className={`text-xl font-medium tabular-nums ${CHANGE_TEXT[auto]}`}>
          {delta === 0 ? "No change" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} points`}
        </p>

        {decided === false && (
          <div className="mt-6 flex w-full flex-col items-center gap-3">
            <div role="group" aria-label="Change since the earlier photo" className="grid w-full max-w-xl grid-cols-3 gap-2 md:gap-3">
              {CHANGES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={change === c}
                  onClick={() => setPicked(c)}
                  className={`choice min-h-16 text-xl font-semibold ${CHANGE_ON[c]}`}
                >
                  {CHANGE_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="max-w-xl text-muted">
              {change === auto
                ? `Set from the risk score (a move of ${t} points or more counts). Tap another if you see it differently.`
                : `Changed by you. The risk score alone says ${CHANGE_LABEL[auto]}.`}
            </p>
          </div>
        )}
      </section>

      <div className="grid items-start gap-8 md:grid-cols-2 md:gap-12">
        <DecisionPanel capture={later} context={{ isRecheck: true, change }} />
      </div>
    </>
  );
}

function Column({
  capture,
  visit,
  showHeatmap,
}: {
  capture: Capture;
  visit: number;
  showHeatmap: boolean;
}) {
  // ponytail: blob URLs are never revoked (freed on reload); revoking in effect
  // cleanup breaks the image under StrictMode's double effect.
  const photoUrl = useMemo(() => URL.createObjectURL(capture.photo), [capture]);
  const top = capture.probs.indexOf(Math.max(...capture.probs));
  const heatmap = useMemo(
    () => heatmapUrl(camSlice(capture.modelOutput.cam, top)),
    [capture, top]
  );
  const score = riskPct(capture);

  return (
    <figure className="flex flex-col gap-6">
      {/* Dark mat so both photos read at the same weight on a projector. */}
      <div className="flex h-[52vh] min-h-72 items-center justify-center overflow-hidden rounded-2xl bg-foreground p-2">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
          <img
            src={photoUrl}
            alt={`Lesion photo, visit ${visit}`}
            className="block h-auto max-h-[calc(52vh-1rem)] w-auto max-w-full rounded-xl"
          />
          {/* Always mounted so the toggle cross-fades instead of popping. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img
            src={heatmap}
            alt=""
            className={`absolute inset-0 h-full w-full rounded-xl transition-opacity duration-200 ease-out ${
              showHeatmap ? "opacity-[0.45]" : "opacity-0"
            }`}
          />
        </div>
      </div>

      <figcaption className="flex flex-col gap-4">
        <div>
          <p className="text-2xl font-semibold">{dateText(capture.takenAt)}</p>
          <p className="text-muted">Visit {visit}</p>
        </div>
        <p className="text-xl">
          {CLASS_LABELS[top]}{" "}
          <span className="tabular-nums text-muted">{(capture.probs[top] * 100).toFixed(0)}%</span>
        </p>
        {capture.abstain && (
          <p className="self-start rounded-xl border border-warning-border bg-warning-bg px-4 py-2 font-medium text-warning">
            Model not confident: your judgment
          </p>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">Risk score</span>
            <span className="text-xl font-semibold tabular-nums">{score}%</span>
          </div>
          <div
            role="meter"
            aria-label="Risk score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            className="h-3 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-3 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
          </div>
          <div aria-hidden className="flex justify-between text-sm tabular-nums text-faint">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-16 text-lg text-muted">
      <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
      {children}
    </div>
  );
}
