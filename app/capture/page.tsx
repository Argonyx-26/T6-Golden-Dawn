"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { SITES, type Site } from "@/lib/sites";
import { assessQuality, type QualityResult } from "@/lib/quality";
import { classify } from "@/lib/model";
import { postprocess } from "@/lib/postprocess";
import { useModel } from "@/components/ModelProvider";
import { now } from "@/lib/clock";

const POSITIONING: Record<Site, string> = {
  "buccal left":
    "Retract the left cheek outward and photograph the inner cheek lining.",
  "buccal right":
    "Retract the right cheek outward and photograph the inner cheek lining.",
  "tongue lateral":
    "Ask the patient to protrude the tongue, hold the tip with gauze, and photograph the side border.",
  "floor of mouth":
    "Ask the patient to lift the tongue tip to the roof of the mouth and photograph the floor beneath it.",
  gingiva: "Retract the lip or cheek and photograph the gum margin directly.",
  palate:
    "Ask the patient to tilt the head back and open wide, and photograph the roof of the mouth.",
};

const REJECTION_MESSAGE: Record<NonNullable<QualityResult["reason"]>, string> = {
  blur: "Photo is too blurry to assess. Hold the camera steady and refocus.",
  brightness: "Exposure is off (too dark or too bright). Adjust lighting and retake.",
  glare: "Too much glare or reflection on the lesion. Reposition the light and retake.",
};

const MAX_STORED_WIDTH = 1024;

function toJpegBlob(img: HTMLImageElement, maxDim: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode photo"))),
      "image/jpeg",
      0.85
    );
  });
}

export default function CapturePage() {
  return (
    <Suspense>
      <CaptureFlow />
    </Suspense>
  );
}

function CaptureFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = Number(searchParams.get("patientId"));

  const patient = useLiveQuery(() => db.patients.get(patientId), [patientId]);
  const model = useModel();
  const meta = model?.meta;
  const [site, setSite] = useState<Site | null>(null);
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [existingLesionId, setExistingLesionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setQuality(null);
    setExistingLesionId(null);
    setError(null);
    imageRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !meta || !site) return;
    setError(null);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read photo"));
      img.src = URL.createObjectURL(file);
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Camera preview not supported on this device.");
      return;
    }
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = assessQuality(data, meta.blur_min);
    setQuality(result);
    imageRef.current = img;

    if (result.pass) {
      const matches = await db.lesions.where({ patientId, site }).toArray();
      const existing = matches.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
      if (existing?.id) {
        setExistingLesionId(existing.id);
      } else {
        void save(null);
      }
    }
  }

  async function save(lesionChoice: "recheck" | "new" | null) {
    if (!site || !model || !imageRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const lesionId =
        lesionChoice === "recheck" && existingLesionId
          ? existingLesionId
          : ((await db.lesions.add({ patientId, site })) as number);

      const blob = await toJpegBlob(imageRef.current, MAX_STORED_WIDTH);
      const modelOutput = await classify(model, imageRef.current);
      const { probs, abstain } = postprocess(modelOutput.logits, model.meta);
      const captureId = (await db.captures.add({
        lesionId,
        takenAt: now(),
        lesionPhoto: blob,
        modelOutput,
        probs,
        abstain,
        metaVersion: model.meta.version,
      })) as number;
      await db.recalls
        .where("lesionId")
        .equals(lesionId)
        .filter((r) => r.status === "pending")
        .modify({ status: "done" });

      router.push(`/result?captureId=${captureId}`);
    } catch (e) {
      setError(`Could not save the capture: ${e instanceof Error ? e.message : e}`);
      setSaving(false);
    }
  }

  const backToPatient = (
    <Link href={`/patient?id=${patientId}`} className="btn btn-ghost -ml-3 self-start text-muted">
      Back to {patient?.name ?? "patient"}
    </Link>
  );

  if (!site) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-1">
          {backToPatient}
          <h1 className="text-3xl font-semibold">New capture</h1>
          <p className="text-muted">
            {patient ? `For ${patient.name}. ` : ""}Choose the site to photograph.
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {SITES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSite(s)}
              className="choice min-h-16 justify-start px-5 text-left text-lg capitalize"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (existingLesionId) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        <div className="card animate-enter flex flex-col gap-4 p-5 md:p-6">
          <h1 className="text-2xl font-semibold">Existing lesion found</h1>
          <p className="text-muted">
            A lesion is already recorded at <span className="text-foreground">{site}</span>. Is this a recheck of
            that lesion, or a new one?
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={saving} onClick={() => save("recheck")} className="btn btn-secondary btn-lg">
              Recheck existing
            </button>
            <button type="button" disabled={saving} onClick={() => save("new")} className="btn btn-primary btn-lg">
              New lesion
            </button>
          </div>
          {saving && (
            <p role="status" className="text-muted">
              Running the model and saving…
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-1">
        {backToPatient}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-semibold capitalize">{site}</h1>
            {patient && <p className="text-muted">{patient.name}</p>}
          </div>
          <button type="button" onClick={() => setSite(null)} className="btn btn-ghost">
            Change site
          </button>
        </div>
      </header>

      <p className="rounded-2xl bg-surface-2 px-5 py-4 text-lg">{POSITIONING[site]}</p>

      {!quality?.pass && (
        <label className="btn btn-primary btn-lg has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-45">
          {meta ? (quality ? "Take another photo" : "Take photo") : "Waiting for the model to load…"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={!meta}
            onChange={handleFile}
            className="sr-only"
          />
        </label>
      )}

      {quality && !quality.pass && (
        <div role="alert" className="animate-enter flex flex-col gap-3 rounded-2xl border border-danger-border bg-danger-bg p-5">
          <p className="text-lg font-semibold text-danger">Photo rejected</p>
          <p className="text-danger">{REJECTION_MESSAGE[quality.reason!]}</p>
          <button type="button" onClick={reset} className="btn btn-secondary self-start">
            Retake
          </button>
        </div>
      )}

      {quality?.pass && saving && (
        <div role="status" className="animate-enter flex flex-col gap-1 rounded-2xl border border-accent/25 bg-accent-soft p-5">
          <p className="text-lg font-semibold text-accent">Photo passed the quality check</p>
          <p className="text-muted">Running the model and saving…</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger">
          {error}
        </p>
      )}

      {quality && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showNumbers}
            onClick={() => setShowNumbers((v) => !v)}
            className="btn btn-ghost -ml-3 self-start"
          >
            {showNumbers ? "Hide" : "Show"} quality numbers
          </button>
          {showNumbers && (
            <dl className="animate-fade grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-xl bg-surface-2 px-4 py-3 text-muted">
              <dt>Blur score</dt>
              <dd className="tabular-nums text-foreground">{quality.blur.toFixed(1)}</dd>
              <dt>Brightness</dt>
              <dd className="tabular-nums text-foreground">{quality.brightness.toFixed(1)}</dd>
              <dt>Glare</dt>
              <dd className="tabular-nums text-foreground">{quality.glarePct.toFixed(1)}%</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
