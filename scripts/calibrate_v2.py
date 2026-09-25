import argparse
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import pandas as pd
from PIL import Image
from scipy.optimize import minimize_scalar
from scipy.special import softmax

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from scripts.ora_aug import build_eval_tf  # noqa: E402

NUM_CLASSES = 4
CLASSES = ["healthy", "variation", "opmd", "oc"]


def macro_f1(labels, preds):
    fs = []
    for c in range(NUM_CLASSES):
        tp = int(np.sum((preds == c) & (labels == c)))
        fp = int(np.sum((preds == c) & (labels != c)))
        fn = int(np.sum((preds != c) & (labels == c)))
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        fs.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return float(np.mean(fs))


def rule_states(p, tau, refer_floor):
    """Returns per-sample decision outcome under CONTRACT v2 rule."""
    pred = p.argmax(1)
    refer = (p[:, 2] + p[:, 3]) >= refer_floor
    low = p.max(1) < tau
    answer = (~refer) & (~low)
    return answer, pred, refer, low


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", default=os.path.join("model", "oratrace_v2.onnx"))
    ap.add_argument("--split", default=os.path.join("data", "splits", "val.csv"))
    ap.add_argument("--refer-floor", type=float, default=0.05)
    ap.add_argument("--min-coverage", type=float, default=0.55)
    ap.add_argument("--max-tau", type=float, default=0.45)
    args = ap.parse_args()

    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(os.path.join(ROOT, args.onnx), so, providers=["CPUExecutionProvider"])
    tf = build_eval_tf()

    df = pd.read_csv(os.path.join(ROOT, args.split))
    logits, y = [], []
    for _, row in df.iterrows():
        img = Image.open(os.path.join(ROOT, row["path"])).convert("RGB")
        x = tf(img).numpy().astype(np.float32)[None]
        lg, _ = sess.run(["logits", "cam"], {"input": x})
        logits.append(lg[0])
        y.append(int(row["label"]))
    logits = np.stack(logits)
    y = np.array(y)
    print(f"{os.path.basename(args.onnx)}  split={os.path.basename(args.split)}  n={len(y)}")
    print(f"class counts: {dict(zip(CLASSES, [(y==c).sum() for c in range(NUM_CLASSES)]))}")

    # temperature scaling (min val NLL)
    def nll(logT):
        T = float(np.exp(logT))
        sm = softmax(logits / T, axis=1)
        return float(-np.log(sm[np.arange(len(y)), y] + 1e-12).mean())

    res = minimize_scalar(nll, bounds=(-3, 3), method="bounded")
    T = float(np.exp(res.x))
    print(f"fitted T = {T:.4f}  (val NLL {res.fun:.4f})")

    pcal = softmax(logits / T, axis=1)
    nll1 = float(-np.log(softmax(logits, axis=1)[np.arange(len(y)), y] + 1e-12).mean())
    print(f"val NLL T=1: {nll1:.4f}  -> calibration gain {nll1 - res.fun:.4f}")

    print(f"\nsweep tau (refer_floor={args.refer_floor}):")
    print(f"{'tau':>6} {'cov%':>6} {'abst%':>6} {'F1(all)':>8}")
    best = (None, -1, 0)
    taus = np.round(np.arange(0.05, args.max_tau + 1e-9, 0.05), 2)
    for tau in taus:
        ans, pred, refer, low = rule_states(pcal, float(tau), args.refer_floor)
        cov = ans.mean()
        mf = macro_f1(y, pred)
        print(f"{tau:6.2f} {100*cov:6.1f} {100*(1-cov):6.1f} {mf:8.4f}")
        if cov >= args.min_coverage and mf > best[1]:
            best = (tau, mf, cov)
    if best[0] is None:
        tau = 0.20
        print(f"no tau with coverage>={args.min_coverage}; defaulting tau={tau}")
    else:
        tau = best[0]
        print(f"picked tau={tau:.2f} (F1 {best[1]:.4f}, coverage {100*best[2]:.1f}%)")

    ans, pred, refer, low = rule_states(pcal, tau, args.refer_floor)
    print(f"\nhonest app behaviour on this split (tau={tau}, rf={args.refer_floor}, T={T:.4f}):")
    for c in range(NUM_CLASSES):
        sub_y = y[y == c]
        print(f"  class {CLASSES[c]:8s} n={len(sub_y):3d}  answered={int(np.sum(ans[y==c])):3d}  "
              f"referred={int(np.sum(refer[y==c])):3d}  abstained={int(np.sum(low[y==c])):3d}")
    print(f"  macro recall (all preds, no gate):", end=" ")
    recs = []
    for c in range(NUM_CLASSES):
        tp = int(np.sum((pred == c) & (y == c)))
        fn = int(np.sum((pred != c) & (y == c)))
        recs.append(tp / (tp + fn) if tp + fn else 0.0)
        print(f"{CLASSES[c]}={recs[-1]:.3f}", end="  ")
    print(f"| mean = {np.mean(recs):.4f}")

    with open(os.path.join(ROOT, "model", "calibration_v2.json"), "w") as f:
        json.dump({"T": round(T, 5), "tau": round(tau, 2), "refer_floor": args.refer_floor,
                   "val_nll_T": res.fun, "val_nll_1": nll1,
                   "onnx": os.path.basename(args.onnx), "split": os.path.basename(args.split)}, f, indent=2)
    print("wrote model/calibration_v2.json")


if __name__ == "__main__":
    main()