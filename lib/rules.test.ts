import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { overrideNote, suggest, type HabitInput, type Rules } from "./rules";

// The real, approved file: tests break if someone edits it into something inconsistent.
const rules: Rules = JSON.parse(readFileSync("public/rules.json", "utf8"));

const none: HabitInput = {
  smokingStatus: "never",
  smokelessType: "none",
  smokelessStatus: "never",
  arecaStatus: "never",
  alcoholStatus: "never",
};
const smoker: HabitInput = { ...none, smokingStatus: "current" };
const first = { isRecheck: false };
const ok = (klass: string) => ({ class: klass, abstain: false });

describe("base rules R1-R8", () => {
  it.each([
    ["R1", "healthy", none, "reassure", false],
    ["R2", "healthy", smoker, "reassure", true],
    ["R3", "variation", none, "reassure", false],
    ["R4", "variation", smoker, "reassure", true],
    ["R5", "opmd", none, "recheck14", false],
    ["R6", "opmd", smoker, "refer", true],
    ["R7", "oc", none, "refer", false],
    ["R8", "oc", smoker, "refer", true],
  ])("%s: %s", (id, klass, habits, action, counsel) => {
    const s = suggest(ok(klass), habits, first, rules);
    expect(s).toMatchObject({ ruleId: id, action, counsel });
    expect(s.reason).toBe(rules.base_rules.find((r) => r.id === id)!.description);
  });
});

describe("abstain (R0)", () => {
  it("gives no action and says so", () => {
    const s = suggest({ class: "healthy", abstain: true }, none, first, rules);
    expect(s).toEqual({
      action: null,
      counsel: false,
      ruleId: "R0",
      reason: "Model not confident enough to suggest an action. Use your clinical judgment.",
    });
  });
  it("still flags counseling when a habit is active", () => {
    expect(suggest({ class: "oc", abstain: true }, smoker, first, rules).counsel).toBe(true);
  });
  it("is never overridden by a heavy risk-factor load", () => {
    const heavy = { ...smoker, alcoholStatus: "current" as const, personalHistoryOpmdOrOc: true };
    const s = suggest({ class: "healthy", abstain: true }, heavy, first, rules);
    expect(s.action).toBeNull();
    expect(s.ruleId).toBe("R0");
  });
});

describe("points escalation", () => {
  it("previous OPMD/OC alone (3 pts) lifts reassure to recheck14", () => {
    const s = suggest(ok("healthy"), { ...none, personalHistoryOpmdOrOc: true }, first, rules);
    expect(s).toMatchObject({ action: "recheck14", ruleId: "POINTS-RECHECK", counsel: false });
    expect(s.reason).toContain("previous lesion (3 pts)");
    expect(s.reason).toContain("= 3 points");
  });
  it("smoking + alcohol + family history (5 pts) lifts reassure to refer", () => {
    const habits = { ...smoker, alcoholStatus: "current" as const, familyHistoryOralCancer: true };
    const s = suggest(ok("healthy"), habits, first, rules);
    expect(s).toMatchObject({ action: "refer", ruleId: "POINTS-REFER", counsel: true });
    expect(s.reason).toBe(
      "Escalated to Refer: current smoking (2 pts) + current alcohol use (2 pts) + family history of oral cancer (1 pt) = 5 points"
    );
  });
  it("lifts an OPMD recheck14 to refer at 5 pts", () => {
    const habits = { ...none, personalHistoryOpmdOrOc: true, poorlyFittingDenture: true, familyHistoryOralCancer: true };
    expect(suggest(ok("opmd"), habits, first, rules)).toMatchObject({ action: "refer", ruleId: "POINTS-REFER" });
  });
  it("leaves recheck14 alone between the two thresholds", () => {
    const s = suggest(ok("opmd"), { ...none, personalHistoryOpmdOrOc: true }, first, rules);
    expect(s).toMatchObject({ action: "recheck14", ruleId: "R5" });
  });
  it("never downgrades a refer, however few points", () => {
    expect(suggest(ok("oc"), none, first, rules)).toMatchObject({ action: "refer", ruleId: "R7" });
    const s = suggest(ok("oc"), { ...none, personalHistoryOpmdOrOc: true }, first, rules);
    expect(s).toMatchObject({ action: "refer", ruleId: "R7" });
  });
  it("counts quit habits as 1 pt but not as an active habit", () => {
    const quit = { ...none, smokingStatus: "quit" as const, smokelessType: "gutka" as const, smokelessStatus: "quit" as const, arecaStatus: "quit" as const };
    const s = suggest(ok("healthy"), quit, first, rules);
    expect(s).toMatchObject({ action: "recheck14", ruleId: "POINTS-RECHECK", counsel: false });
    expect(s.reason).toContain("past smoking (1 pt)");
  });
  it("ignores a stale smokeless status when the type is none", () => {
    const s = suggest(ok("healthy"), { ...none, smokelessStatus: "current" }, first, rules);
    expect(s).toMatchObject({ ruleId: "R1", counsel: false });
  });
});

describe("recheck", () => {
  it.each([
    ["worse", "RC1"],
    ["same", "RC2"],
  ] as const)("%s -> refer (%s), overriding class, abstain and points", (change, id) => {
    const s = suggest({ class: "healthy", abstain: true }, smoker, { isRecheck: true, change }, rules);
    expect(s).toMatchObject({ action: "refer", ruleId: id, counsel: true });
    expect(s.reason).toBe(rules.recheck_rules.find((r) => r.id === id)!.description);
  });
  it("better falls through to the normal rules instead of returning null", () => {
    const s = suggest(ok("healthy"), none, { isRecheck: true, change: "better" }, rules);
    expect(s).toMatchObject({ action: "reassure", ruleId: "R1" });
  });
  it("better still abstains when the model is not confident", () => {
    const s = suggest({ class: "healthy", abstain: true }, none, { isRecheck: true, change: "better" }, rules);
    expect(s.ruleId).toBe("R0");
  });
  it("a change is ignored when this is not a recheck", () => {
    const s = suggest(ok("healthy"), none, { isRecheck: false, change: "worse" }, rules);
    expect(s.ruleId).toBe("R1");
  });
});

describe("overrideNote", () => {
  it("is empty when the dentist followed the suggestion", () => {
    expect(overrideNote({ suggested: "refer", final: "refer" })).toBeNull();
  });
  it("flags an override", () => {
    expect(overrideNote({ suggested: "refer", final: "reassure" })).toBe("Dentist overrode suggestion");
  });
  it("flags a decision made without a suggestion", () => {
    expect(overrideNote({ suggested: null, final: "refer" })).toBe("Dentist's judgment — model abstained");
  });
});
