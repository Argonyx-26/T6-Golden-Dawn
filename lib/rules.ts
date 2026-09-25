// Rule engine: SUGGESTED action from the model's class + habits. Pure apart from loadRules().
// The table itself lives in public/rules.json (approved by the dentist, editable without touching this file).
export type Action = "reassure" | "recheck14" | "refer";
type Status = "current" | "quit" | "never";

export const ACTION_LABEL: Record<Action, string> = {
  reassure: "Reassure",
  recheck14: "Recheck in 14 days",
  refer: "Refer for biopsy",
};

export interface Rules {
  version: string;
  base_rules: { id: string; class: string; activeHabit: boolean; action: Action; description: string }[];
  abstain_rule: { id: string };
  points: Record<string, number>;
  escalation_thresholds: { recheck14: number; refer: number };
  recheck_rules: { id: string; change: string; action: Action | null; description: string }[];
}

// Subset of the Habit row (lib/db.ts); the three risk-factor flags are absent on older rows.
export interface HabitInput {
  smokingStatus: Status;
  smokelessType: string;
  smokelessStatus: Status;
  arecaStatus: Status;
  alcoholStatus: Status;
  familyHistoryOralCancer?: boolean;
  personalHistoryOpmdOrOc?: boolean;
  poorlyFittingDenture?: boolean;
}

export interface Suggestion {
  action: Action | null;
  counsel: boolean;
  ruleId: string;
  reason: string;
}

export interface Context {
  isRecheck: boolean;
  change?: "better" | "same" | "worse";
}

const ABSTAIN_REASON = "Model not confident enough to suggest an action. Use your clinical judgment.";

// A smokeless status is stale when the type was reset to "none", so it doesn't count.
function habitStatuses(h: HabitInput): [key: string, noun: string, status: Status][] {
  return [
    ["smoking", "smoking", h.smokingStatus],
    ["smokeless", "smokeless tobacco use", h.smokelessType === "none" ? "never" : h.smokelessStatus],
    ["areca", "areca nut use", h.arecaStatus],
    ["alcohol", "alcohol use", h.alcoholStatus],
  ];
}

const hasActiveHabit = (h: HabitInput) => habitStatuses(h).some(([, , s]) => s === "current");

function riskFactors(h: HabitInput, points: Rules["points"]): { label: string; pts: number }[] {
  const all = [
    ...habitStatuses(h).map(([key, noun, s]) => ({
      label: `${s === "current" ? "current" : "past"} ${noun}`,
      pts: points[`${key}_${s}`] ?? 0,
    })),
    { label: "family history of oral cancer", pts: h.familyHistoryOralCancer ? points.family_history_oral_cancer ?? 0 : 0 },
    { label: "personal history of a previous lesion", pts: h.personalHistoryOpmdOrOc ? points.personal_history_opmd_or_oral_cancer ?? 0 : 0 },
    { label: "poorly fitting denture", pts: h.poorlyFittingDenture ? points.poorly_fitting_denture ?? 0 : 0 },
  ];
  return all.filter((f) => f.pts > 0);
}

export function suggest(
  result: { class: string; abstain: boolean },
  habits: HabitInput,
  context: Context,
  rules: Rules
): Suggestion {
  const counsel = hasActiveHabit(habits);

  // 1. A recheck that is worse or unchanged overrides everything, abstain included.
  if (context.isRecheck && (context.change === "worse" || context.change === "same")) {
    const row = rules.recheck_rules.find((r) => r.change === context.change)!;
    return { action: row.action, counsel, ruleId: row.id, reason: row.description };
  }

  // 2. No default means no default, whatever the points say.
  if (result.abstain) {
    return { action: null, counsel, ruleId: rules.abstain_rule.id, reason: ABSTAIN_REASON };
  }

  // 3. Base rule from class + any active habit.
  const base = rules.base_rules.find((r) => r.class === result.class && r.activeHabit === counsel);
  if (!base) throw new Error(`rules.json has no base rule for class "${result.class}".`);

  // 4-5. Risk-factor points can only escalate, never downgrade.
  const factors = riskFactors(habits, rules.points);
  const total = factors.reduce((sum, f) => sum + f.pts, 0);
  const t = rules.escalation_thresholds;
  const up: Action | null =
    total >= t.refer && base.action !== "refer"
      ? "refer"
      : total >= t.recheck14 && base.action === "reassure"
        ? "recheck14"
        : null;
  if (up) {
    const list = factors.map((f) => `${f.label} (${f.pts} ${f.pts === 1 ? "pt" : "pts"})`).join(" + ");
    return {
      action: up,
      counsel,
      ruleId: up === "refer" ? "POINTS-REFER" : "POINTS-RECHECK",
      reason: `Escalated to ${up === "refer" ? "Refer" : "Recheck in 14 days"}: ${list} = ${total} points`,
    };
  }
  return { action: base.action, counsel, ruleId: base.id, reason: base.description };
}

// Shown in the lesion history next to a saved decision; null when the dentist followed the suggestion.
export function overrideNote(d: { suggested: Action | null; final: Action }): string | null {
  if (d.suggested === null) return "Dentist's judgment — model abstained";
  return d.suggested === d.final ? null : "Dentist overrode suggestion";
}

async function fetchRules(): Promise<Rules> {
  const res = await fetch("/rules.json");
  if (!res.ok) throw new Error(`Could not fetch rules.json (HTTP ${res.status}).`);
  let rules: Rules;
  try {
    rules = await res.json();
  } catch {
    throw new Error("public/rules.json is not valid JSON.");
  }
  const t = rules.escalation_thresholds;
  if (
    !rules.version ||
    !Array.isArray(rules.base_rules) ||
    !rules.abstain_rule?.id ||
    typeof rules.points !== "object" ||
    typeof t?.recheck14 !== "number" ||
    typeof t?.refer !== "number" ||
    !["worse", "same"].every((c) => rules.recheck_rules?.some((r) => r.change === c))
  ) {
    throw new Error("public/rules.json is missing required sections (see the approved table).");
  }
  return rules;
}

let cached: Promise<Rules> | null = null;
// One fetch per page load; a failure is not cached so Retry works.
export function loadRules(): Promise<Rules> {
  cached ??= fetchRules().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
