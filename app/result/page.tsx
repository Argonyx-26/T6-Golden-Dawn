"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MOCK_VERSION } from "@/lib/model";
import { camSlice } from "@/lib/postprocess";
import { heatmapUrl } from "@/lib/heatmap";
import DecisionPanel from "@/components/DecisionPanel";

// Class order per CONTRACT.md.
const CLASS_LABELS = ["Healthy", "Normal variation", "OPMD", "Oral cancer"];

export default function ResultPage() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  );
}

function Result() {
  const captureId = Number(useSearchParams().get("captureId"));
  const capture = useLiveQuery(() => db.captures.get(captureId), [captureId]);
  const lesion = useLiveQuery(
    () => (capture ? db.lesions.get(capture.lesionId) : undefined),
    [capture]
  );
  const [showHeatmap, setShowHeatmap] = useState(false);
  // True when this lesion already had a photo before this one.
  const isRecheck = useLiveQuery(
    async () =>
      capture
        ? (await db.captures
            .where("lesionId")
            .equals(capture.lesionId)
            .filter((c) => c.takenAt < capture.takenAt)
            .count()) > 0
        : undefined,
    [capture]
  );
  // ponytail: blob URL never revoked (one per result view, freed on reload);
  // revoking in effect cleanup breaks the image under StrictMode's double effect.
  const photoUrl = useMemo(
    () => (capture ? URL.createObjectURL(capture.photo) : null),
    [capture]
  );

  const top = capture?.probs ? capture.probs.indexOf(Math.max(...capture.probs)) : -1;
  const heatmap = useMemo(
    () => (capture && top >= 0 ? heatmapUrl(camSlice(capture.modelOutput.cam, top)) : null),
    [capture, top]
  );

  if (capture === undefined) return null;
  if (capture === null || !capture.probs) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
        <h1 className="text-2xl font-semibold">
          {capture === null ? `Capture #${captureId} not found` : "This capture has no stored probabilities"}
        </h1>
        <Link href="/patients" className="btn btn-secondary self-start">
          Back to patients
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:px-8 md:py-10">
      <header className="flex flex-col gap-1 md:col-span-2">
        {lesion && (
          <Link href={`/patient?id=${lesion.patientId}`} className="btn btn-ghost -ml-3 self-start text-muted">
            Back to patient
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold md:text-4xl">Model output</h1>
          {capture.metaVersion === MOCK_VERSION && (
            <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold tracking-wide text-white">
              MOCK MODEL
            </span>
          )}
        </div>
        {lesion && <p className="text-muted capitalize">{lesion.site}</p>}
      </header>

      {/* Sticky on tablet/desktop so the photo stays beside the decision while scrolling to Save. */}
      <section aria-label="Photo" className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
        {photoUrl && (
          // Dark mat, same as /compare, so the photo reads at full weight on a projector.
          <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-foreground p-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
              <img
                src={photoUrl}
                alt="Captured lesion"
                className="block h-auto max-h-[60vh] w-auto max-w-full rounded-xl"
              />
              {heatmap && (
                // Always mounted so the toggle cross-fades instead of popping.
                // eslint-disable-next-line @next/next/no-img-element -- generated data URL
                <img
                  src={heatmap}
                  alt=""
                  className={`absolute inset-0 h-full w-full rounded-xl transition-opacity duration-200 ease-out ${
                    showHeatmap ? "opacity-[0.45]" : "opacity-0"
                  }`}
                />
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          aria-pressed={showHeatmap}
          onClick={() => setShowHeatmap((v) => !v)}
          className="choice self-start"
        >
          Heat-map {showHeatmap ? "on" : "off"}
        </button>
      </section>

      <div className="flex flex-col gap-6">
        <section aria-label="Model output" className="card flex flex-col gap-5 p-5 md:p-6">
          <div className="flex flex-col gap-1">
            <p className="label">Top class</p>
            <p className="flex items-baseline gap-3 text-2xl font-semibold">
              {CLASS_LABELS[top]}
              <span className="text-lg font-medium tabular-nums text-muted">
                {(capture.probs[top] * 100).toFixed(1)}%
              </span>
            </p>
          </div>

          {capture.abstain && (
            <p className="animate-enter rounded-xl border border-warning-border bg-warning-bg px-4 py-3 font-medium text-warning">
              Model not confident: your judgment
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {capture.probs.map((p, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className={i === top ? "font-semibold" : "text-muted"}>{CLASS_LABELS[i]}</span>
                  <span className={`tabular-nums ${i === top ? "font-semibold" : "text-muted"}`}>
                    {(p * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-2 rounded-full ${i === top ? "bg-accent" : "bg-border-strong"}`}
                    style={{ width: `${p * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* A recheck is decided on /compare (isRecheck + change); decisions are write-once per capture. */}
        {isRecheck === false && <DecisionPanel capture={capture} context={{ isRecheck: false }} />}
        {isRecheck && (
          <div role="status" className="card flex flex-col gap-3 p-5 md:p-6">
            <p className="text-muted">This lesion has an earlier photo. Decide on the change, not this photo alone.</p>
            <Link href={`/compare?lesionId=${capture.lesionId}`} className="btn btn-primary btn-lg">
              Compare with the earlier photo to decide
            </Link>
          </div>
        )}

        <p className="font-mono text-sm text-muted">Model version {capture.metaVersion}</p>
      </div>
    </div>
  );
}
