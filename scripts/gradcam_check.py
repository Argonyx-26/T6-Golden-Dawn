import argparse
import os
import sys

import numpy as np
import onnxruntime as ort
import pandas as pd
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from scripts.ora_aug import build_eval_tf  # noqa: E402

NUM_CLASSES = 4
CLASSES = ["healthy", "variation", "opmd", "oc"]
CLS_COLOR = [(60, 200, 60), (60, 120, 220), (230, 150, 30), (220, 40, 40)]


def cam_colormap(cam):
    """1-D heat ramp (deep blue -> cyan -> yellow -> red)."""
    r = np.clip(1.5 - np.abs(4 * cam - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * cam - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * cam - 1), 0, 1)
    return np.stack([r, g, b], axis=-1)


def focus_stats(cam):
    """Crude focus proxies: peak location and mass concentration."""
    cam = cam - cam.min()
    cam = cam / (cam.max() + 1e-9)
    ys, xs = np.mgrid[0:7, 0:7]
    tot = cam.sum()
    cx = float((xs * cam).sum() / tot)
    cy = float((ys * cam).sum() / tot)
    center_mass = float(cam[1:6, 1:6].sum() / tot) if tot else 0.0
    peak_dx = cx - 3.0   # distance from 7x7 center in cells
    peak_dy = cy - 3.0
    return round(peak_dx, 2), round(peak_dy, 2), round(center_mass, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", default=os.path.join("model", "oratrace.onnx"))
    ap.add_argument("--split", default=os.path.join("data", "splits", "test.csv"))
    ap.add_argument("--n", type=int, default=10, help="num correct + num wrong")
    ap.add_argument("--out", default=os.path.join("model", "gradcam"))
    ap.add_argument("--limit", type=int, default=None, help="only inspect first N rows (smoke test)")
    args = ap.parse_args()

    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(os.path.join(ROOT, args.onnx), so, providers=["CPUExecutionProvider"])
    tf = build_eval_tf()

    df = pd.read_csv(os.path.join(ROOT, args.split))
    if args.limit:
        df = df.head(args.limit)
    os.makedirs(args.out, exist_ok=True)

    rows = []
    for i, r in df.iterrows():
        img = Image.open(os.path.join(ROOT, r["path"])).convert("RGB")
        x = tf(img).numpy().astype(np.float32)[None]
        logits, cam = sess.run(["logits", "cam"], {"input": x})
        y = int(r["label"])
        pred = int(logits[0].argmax())
        rows.append((i, img, logits[0], cam[0], y, pred))

    correct = [r for r in rows if r[4] == r[5]]
    wrong = [r for r in rows if r[4] != r[5]]
    sel_c = correct[: args.n]
    sel_w = wrong[: args.n]
    print(f"split n={len(df)} correct={len(correct)} wrong={len(wrong)}; picking {min(args.n, len(sel_c))} correct + {min(args.n, len(sel_w))} wrong")

    results = {"correct": [], "wrong": []}
    for tag, group in [("correct", sel_c), ("wrong", sel_w)]:
        stats = []
        for (i, img, logits, cam, y, pred) in group:
            k = pred  # CAM of the PREDICTED class (matches what the browser shows)
            cmap = cam[k].astype(np.float64)
            dx, dy, cmass = focus_stats(cmap)
            c224 = Image.fromarray(np.uint8(cam_colormap(cmap / (cmap.max() + 1e-9)) * 255)).resize((224, 224))
            base = np.asarray(img.convert("RGB").resize((224, 224))).astype(np.float64)
            ov = (0.55 * base + 0.45 * np.asarray(c224) * 255).astype(np.uint8)
            out = Image.fromarray(ov)
            d = ImageDraw.Draw(out)
            d.rectangle([2, 2, 220, 28], fill=(0, 0, 0))
            d.text((6, 6), f"true={CLASSES[y]} pred={CLASSES[pred]} class{k}", fill=CLS_COLOR[k])
            fname = os.path.join(args.out, f"{tag}_{i:04d}_t{CLASSES[y]}_p{CLASSES[pred]}.png")
            out.save(fname)
            stats.append((os.path.basename(fname), dx, dy, cmass, float(logits[k])))
            print(f"  [{tag}] {os.path.basename(fname)}: peak_off=({dx},{dy}) center_mass={cmass} logit={logits[k]:.2f} -> saved")
        results[tag] = stats
        if stats:
            cm = np.mean([s[3] for s in stats])
            print(f"  {tag} avg center-mass fraction: {cm:.2f}")

    import json

    json.dump({"onnx": os.path.basename(args.onnx), "split": os.path.basename(args.split),
               "n_correct": len(sel_c), "n_wrong": len(sel_w), "results": results},
              open(os.path.join(args.out, "gradcam_summary.json"), "w"), indent=2)
    print("wrote ->", os.path.join(args.out, "gradcam_summary.json"))


if __name__ == "__main__":
    main()