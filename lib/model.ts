// Client-only. Model I/O per CONTRACT.md: input "input" [1,3,224,224] RGB float32,
// outputs "logits" [1,4] and "cam" [1,4,7,7] (flattened to 196 floats).
import type { InferenceSession } from "onnxruntime-web";

export interface ClassifyResult {
  logits: number[];
  cam: Float32Array;
}

export interface ModelMeta {
  classes: string[];
  T: number;
  tau: number;
  refer_floor: number;
  blur_min: number;
  version: string;
}

// session null = mock model (public/models/oratrace.onnx missing).
export interface Model {
  session: InferenceSession | null;
  meta: ModelMeta;
}

export const MOCK_VERSION = "mock";

const MOCK_META: ModelMeta = {
  classes: ["healthy", "variation", "opmd", "oc"],
  T: 1,
  tau: 0.5,
  refer_floor: 0.2,
  blur_min: 100,
  version: MOCK_VERSION,
};

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SIZE = 224;

async function loadOrt() {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/ort/";
  // Static hosting sends no cross-origin-isolation headers, so
  // threaded/SharedArrayBuffer wasm is unavailable.
  ort.env.wasm.numThreads = 1;
  return ort;
}

function isHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
  return head.startsWith("<");
}

// Throws a human-readable Error on any failure; caller shows it with Retry.
export async function loadModel(): Promise<Model> {
  const res = await fetch("/models/oratrace.onnx");
  if (res.status === 404) return { session: null, meta: MOCK_META };
  if (!res.ok) throw new Error(`Could not fetch the model file (HTTP ${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isHtml(bytes)) {
    throw new Error(
      "public/models/oratrace.onnx is an HTML page, not a model. It was probably saved from a GitHub page instead of the raw file."
    );
  }

  const metaRes = await fetch("/models/model_meta.json");
  if (!metaRes.ok) throw new Error("public/models/model_meta.json is missing.");
  let meta: ModelMeta;
  try {
    meta = await metaRes.json();
  } catch {
    throw new Error("public/models/model_meta.json is not valid JSON.");
  }
  for (const k of ["T", "tau", "refer_floor", "blur_min"] as const) {
    if (typeof meta[k] !== "number") throw new Error(`model_meta.json: "${k}" must be a number.`);
  }
  if (!meta.version) throw new Error('model_meta.json: "version" is missing.');

  const ort = await loadOrt();
  const session = await ort.InferenceSession.create(bytes);
  const inputs = [...session.inputNames].sort().join(",");
  const outputs = [...session.outputNames].sort().join(",");
  if (inputs !== "input" || outputs !== "cam,logits") {
    throw new Error(
      `Model does not match CONTRACT.md. Expected input "input" and outputs "logits","cam"; got inputs [${inputs}] and outputs [${outputs}].`
    );
  }
  return { session, meta };
}

// Whole image squashed to 224x224, no crop, RGB, CHW, (v/255 - mean) / std.
function preprocess(img: HTMLImageElement): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const t = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      t[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return t;
}

export async function classify(model: Model, img: HTMLImageElement): Promise<ClassifyResult> {
  if (!model.session) {
    const logits = Array.from({ length: 4 }, () => Math.random() * 4 - 2);
    const cam = new Float32Array(4 * 7 * 7);
    for (let i = 0; i < cam.length; i++) cam[i] = Math.random();
    return { logits, cam };
  }
  const ort = await loadOrt();
  const input = new ort.Tensor("float32", preprocess(img), [1, 3, SIZE, SIZE]);
  const out = await model.session.run({ input });
  const logits = Array.from(out.logits.data as Float32Array);
  const cam = new Float32Array(out.cam.data as Float32Array);
  if (logits.length !== 4 || cam.length !== 4 * 49) {
    throw new Error(`Unexpected model output sizes: logits ${logits.length}, cam ${cam.length}.`);
  }
  return { logits, cam };
}
