// Pure. Decision rule from CONTRACT.md; class order 0 healthy, 1 variation, 2 opmd, 3 oc.
import type { ModelMeta } from "./model";

export function softmax(logits: number[], T: number): number[] {
  const z = logits.map((l) => l / T);
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function postprocess(
  logits: number[],
  meta: Pick<ModelMeta, "T" | "tau" | "refer_floor">
) {
  const probs = softmax(logits, meta.T);
  const top = probs.indexOf(Math.max(...probs));
  const abstain =
    probs[top] < meta.tau || (top <= 1 && probs[2] + probs[3] >= meta.refer_floor);
  return { probs, top, abstain };
}

export function camSlice(cam: Float32Array, cls: number): Float32Array {
  const s = cam.slice(cls * 49, cls * 49 + 49);
  let min = Infinity;
  let max = -Infinity;
  for (const v of s) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const range = max - min;
  return s.map((v) => (range > 0 ? (v - min) / range : 0));
}
