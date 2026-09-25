"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Capture } from "@/lib/db";
import { addDays, now } from "@/lib/clock";
import { ACTION_LABEL, loadRules, overrideNote, suggest, type Action, type Context, type Rules } from "@/lib/rules";
import { emptyHabitForm } from "@/components/HabitFields";

// Class order per CONTRACT.md; keys match `class` in rules.json.
const CLASS_KEYS = ["healthy", "variation", "opmd", "oc"];
const ACTIONS: Action[] = ["reassure", "recheck14", "refer"];
// Red is reserved for refer (and danger states); the other actions stay neutral.
const ACTION_TONE: Record<Action, string> = { reassure: "", recheck14: "", refer: "text-danger" };

// SUGGESTED (rule-based) + FINAL (dentist) action for one capture, logged separately in db.decisions.
export default function DecisionPanel({ capture, context }: { capture: Capture; context: Context }) {
  const captureId = capture.id!;
  const habit = useLiveQuery(async () => {
    const lesion = await db.lesions.get(capture.lesionId);
    return lesion ? ((await db.habits.where("patientId").equals(lesion.patientId).first()) ?? null) : null;
  }, [capture.lesionId]);
  const decision = useLiveQuery(
    async () => (await db.decisions.where("captureId").equals(captureId).first()) ?? null,
    [captureId]
  );

  const [rules, setRules] = useState<Rules | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadRules().then(setRules, (e: Error) => setRulesError(e.message));
  }, [attempt]);

  if (rulesError) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger-border bg-danger-bg p-5 text-danger">
        <p>{rulesError}</p>
        <button
          type="button"
          onClick={() => {
            setRulesError(null);
            setAttempt((n) => n + 1);
          }}
          className="btn btn-secondary self-start"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!rules || habit === undefined || decision === undefined) return null;

  const top = capture.probs.indexOf(Math.max(...capture.probs));
  const s = suggest({ class: CLASS_KEYS[top], abstain: capture.abstain }, habit ?? emptyHabitForm, context, rules);

  async function save() {
    if (!choice || !rules) return;
    setSaving(true);
    setSaveError(null);
    try {
      await db.transaction("rw", db.decisions, db.recalls, async () => {
        await db.decisions.add({
          captureId,
          suggested: s.action,
          ruleId: s.ruleId,
          rulesVersion: rules.version,
          final: choice,
          reason: choice === s.action ? "" : reason.trim(),
          decidedAt: now(),
        });
        if (choice === "recheck14") {
          await db.recalls.add({ lesionId: capture.lesionId, dueDate: addDays(now(), 14), status: "pending" });
        }
      });
    } catch (e) {
      setSaveError(`Could not save the decision: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  }

  if (decision) {
    const note = overrideNote(decision);
    return (
      <section aria-live="polite" className="card animate-enter flex flex-col gap-3 p-5 md:p-6">
        <h2 className="label">Decision recorded</h2>
        <p className={`text-3xl font-semibold ${ACTION_TONE[decision.final]}`}>{ACTION_LABEL[decision.final]}</p>
        <p className="text-muted">
          Suggested: {decision.suggested ? ACTION_LABEL[decision.suggested] : "none (model not confident)"}
          <span className="font-mono text-sm"> · Rule {decision.ruleId}</span>
        </p>
        {note && <p className="font-medium">{note}</p>}
        {decision.reason && <p className="text-muted">Reason: {decision.reason}</p>}
        {decision.final === "recheck14" && (
          <p className="rounded-xl bg-surface-2 px-4 py-3">A 14-day recall was created for this lesion.</p>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="card flex flex-col gap-3 p-5 md:p-6">
        <h2 className="label">Suggested action</h2>
        {s.action ? (
          <>
            <p className={`text-3xl font-semibold ${ACTION_TONE[s.action]}`}>{ACTION_LABEL[s.action]}</p>
            <p>{s.reason.replaceAll("->", "→")}</p>
          </>
        ) : (
          <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 font-medium text-warning">
            Model not confident: no suggestion. This is your clinical judgment.
          </p>
        )}
        {s.counsel && (
          <p className="rounded-xl bg-surface-2 px-4 py-3">Active habit: discuss cessation with the patient.</p>
        )}
        <p className="font-mono text-sm text-muted">
          Rule {s.ruleId} · rules v{rules.version}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Your final action</h2>
        <div role="group" aria-label="Final action" className="flex flex-col gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={choice === a}
              onClick={() => setChoice(a)}
              className={`choice min-h-14 justify-between px-5 text-lg font-medium ${
                s.action === a ? "border-accent" : ""
              } ${a === "refer" ? "aria-pressed:border-danger aria-pressed:bg-danger" : ""}`}
            >
              {ACTION_LABEL[a]}
              {s.action === a && <span className="text-sm font-normal opacity-80">Suggested</span>}
            </button>
          ))}
        </div>

        {choice && choice !== s.action && (
          <label className="animate-enter flex flex-col gap-1.5">
            <span className="label">{s.action ? "Why not the suggestion?" : "Reason"} (optional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="field" />
          </label>
        )}

        {saveError && (
          <p role="alert" className="text-danger">
            {saveError}
          </p>
        )}
        <button type="button" disabled={!choice || saving} onClick={save} className="btn btn-primary btn-lg">
          {saving ? "Saving…" : "Save final decision"}
        </button>
        <p className="text-sm text-muted">A saved decision is final and can&apos;t be edited.</p>
      </section>
    </>
  );
}
