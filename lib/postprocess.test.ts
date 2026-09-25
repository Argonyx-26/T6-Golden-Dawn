import { describe, expect, it } from "vitest";
import { camSlice, postprocess, softmax } from "./postprocess";

const meta = { T: 1, tau: 0.5, refer_floor: 0.2 };

describe("softmax", () => {
  it("sums to 1 and divides logits by T", () => {
    const p = softmax([2, 0, 0, 0], 2);
    const q = softmax([1, 0, 0, 0], 1);
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(1);
    p.forEach((v, i) => expect(v).toBeCloseTo(q[i]));
  });

  it("does not overflow on large logits", () => {
    expect(softmax([1000, 0, 0, 0], 1)[0]).toBeCloseTo(1);
  });
});

describe("postprocess", () => {
  it("returns the top class without abstaining when confident", () => {
    const r = postprocess([5, 0, 0, 0], meta);
    expect(r.top).toBe(0);
    expect(r.abstain).toBe(false);
  });

  it("abstains when max prob is below tau", () => {
    const r = postprocess([0.1, 0, 0, 0], meta); // ~0.27 max
    expect(r.abstain).toBe(true);
  });

  it("abstains when top is healthy/variation but opmd+oc reaches refer_floor", () => {
    // p ≈ [0.73, 0.03, 0.12, 0.12] -> top healthy, confident, opmd+oc ≈ 0.24
    const r = postprocess([3, 0, 1.4, 1.4], meta);
    expect(r.top).toBe(0);
    expect(Math.max(...r.probs)).toBeGreaterThan(meta.tau);
    expect(r.abstain).toBe(true);
  });

  it("does not apply the refer rule when top is opmd or oc", () => {
    const r = postprocess([0, 0, 5, 3], meta);
    expect(r.top).toBe(2);
    expect(r.abstain).toBe(false);
  });
});

describe("camSlice", () => {
  it("takes the class's 7x7 slice and min-max scales it to 0-1", () => {
    const cam = new Float32Array(4 * 49);
    for (let i = 0; i < 49; i++) cam[2 * 49 + i] = 10 + i * 2;
    const s = camSlice(cam, 2);
    expect(s.length).toBe(49);
    expect(s[0]).toBe(0);
    expect(s[48]).toBe(1);
    expect(s[24]).toBeCloseTo(0.5);
  });

  it("returns zeros (not NaN) for a flat slice", () => {
    const s = camSlice(new Float32Array(4 * 49).fill(3), 1);
    expect(Array.from(s).every((v) => v === 0)).toBe(true);
  });
});
