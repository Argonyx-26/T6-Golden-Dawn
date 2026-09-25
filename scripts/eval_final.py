import argparse
import json
import os
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image
from torchvision import transforms

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
NUM_CLASSES = 4
CLASSES = ["healthy", "variation", "opmd", "oc"]
META = os.path.join(ROOT, "model", "model_meta.json")
ONNX = os.path.join(ROOT, "model", "oratrace.onnx")
LOCK = os.path.join(ROOT, "model", ".test_used.lock")
OUT_MD = os.path.join(ROOT, "model", "metrics.md")
OUT_PARITY = os.path.join(ROOT, "model", "parity.json")

EVAL_TF = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ]
)


def macro_f1(labels, preds, n=NUM_CLASSES):
    labels = np.asarray(labels); preds = np.asarray(preds)
    if len(labels) == 0:
        return 0.0
    fs = []
    for c in range(n):
        tp = int(np.sum((preds == c) & (labels == c)))
        fp = int(np.sum((preds == c) & (labels != c)))
        fn = int(np.sum((preds != c) & (labels == c)))
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        fs.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return float(np.mean(fs))


def rule(logits, T, tau, refer_floor):
    """CONTRACT v2 decision rule (sensitivity-first).

    p = calibrated softmax (temperature T).
    refer:      p[opmd] + p[oc] >= refer_floor            -> NOT cleared, app shows "Suspicious".
    low_conf:   max(p) < tau                              -> abstain, app shows "Not confident".
    answer:     safe low-risk call (neither refer nor low_conf).
    "Cleared as healthy" = answer AND argmax == healthy.
    """
    p = np.exp(logits / T)
    p /= p.sum(axis=1, keepdims=True)
    preds = p.argmax(axis=1)
    refer = p[:, 2] + p[:, 3] >= refer_floor
    low_conf = p.max(axis=1) < tau
    ans = (~refer) & (~low_conf)
    return ans, preds, p, refer


def per_class(labels, preds):
    out = {}
    for c in range(NUM_CLASSES):
        tp = int(np.sum((preds == c) & (labels == c)))
        fn = int(np.sum((preds != c) & (labels == c)))
        fp = int(np.sum((preds == c) & (labels != c)))
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        out[CLASSES[c]] = {"tp": tp, "fn": fn, "fp": fp, "precision": round(prec, 4), "recall": round(rec, 4)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-run test evaluation (default: once-only lock)")
    ap.add_argument("--onnx", default=ONNX, help="defaults to oratrace.onnx; pass oratrace_<arch>.onnx for a candidate")
    ap.add_argument("--split", default=os.path.join("data", "splits", "test.csv"))
    args = ap.parse_args()

    if os.path.exists(LOCK) and not args.force:
        print("TEST SET ALREADY USED (lock exists). Re-running would burn the once-only test set.")
        print("If you really mean it: delete", LOCK, "or pass --force.")
        sys.exit(1)

    meta = json.load(open(META))
    T, tau, refer_floor, blur_min = meta["T"], meta["tau"], meta["refer_floor"], meta["blur_min"]

    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(args.onnx, so, providers=["CPUExecutionProvider"])

    import pandas as pd

    df = pd.read_csv(os.path.join(ROOT, args.split))
    logits_all, y_all, blur_list = [], [], []
    for _, row in df.iterrows():
        img = Image.open(os.path.join(ROOT, row["path"])).convert("RGB")
        x = EVAL_TF(img).numpy().astype(np.float32)[None]
        logits, cam = sess.run(["logits", "cam"], {"input": x})
        logits_all.append(logits[0])
        y_all.append(int(row["label"]))
        gray = np.asarray(img.convert("L").resize((512, int(512 * img.height / img.width))))
        blur_list.append(float(np.asarray(cv2_laplacian(gray))))

    logits = np.stack(logits_all)
    y = np.array(y_all)

    ans, preds, p, refer = rule(logits, T, tau, refer_floor)
    cleared = ans & (preds == 0)  # app text: "No suspicious features detected"

    cov = float(ans.mean())
    f1_ans = macro_f1(y[ans], preds[ans])
    f1_all = macro_f1(y, preds)
    blur_warn = float(np.mean([b < blur_min for b in blur_list]))

    # Screen-level behaviour of the v2 rule (this is what a user actually sees).
    abn = y != 0
    screen = {
        "cleared_as_healthy_pool": float(cleared.mean()),
        "healthy_cleared": float(cleared[y == 0].mean()),          # % healthy shown "no suspicious"
        "abnormal_cleared": float(cleared[abn].mean()) if abn.any() else float("nan"),  # FN risk
        "screen_sensitivity_of_abnormal_not_cleared": float((~cleared)[abn].mean()) if abn.any() else float("nan"),
        "referred_frac": float(refer.mean()),
        "not_confident_frac": float((p.max(axis=1) < tau).mean()),
        "per_class_answered": {CLASSES[c]: int(np.sum(ans & (y == c))) for c in range(NUM_CLASSES)},
    }

    parity = {
        "onnx": os.path.basename(args.onnx),
        "split": os.path.basename(args.split),
        "T": T, "tau": tau, "refer_floor": refer_floor, "blur_min": blur_min,
        "n": int(len(y)),
        "coverage": round(cov, 4),
        "macro_f1_answered": round(f1_ans, 4),
        "macro_f1_all_preds": round(f1_all, 4),
        "blur_warn_frac": round(blur_warn, 4),
        "decision_rule": "v2 sensitivity-first (CONTRACT.md)",
        "screen": screen,
        "per_class": per_class(y, preds),
    }
    json.dump(parity, open(OUT_PARITY, "w"), indent=2)

    rows = "".join(
        f"| {c} | {v['tp'] + v['fp']} | {v['tp']} | {v['fn']} | {v['precision']:.3f} | {v['recall']:.3f} |\n"
        for c, v in parity["per_class"].items()
    )
    md = f"""# OraTrace — final test metrics (one-time evaluation)

Model: `{os.path.basename(args.onnx)}` on `{os.path.basename(args.split)}` (n={len(y)}).
`T={T}`, `tau={tau}`, `refer_floor={refer_floor}`, `blur_min={blur_min}`.
Decision rule: **v2 sensitivity-first** — `p[opmd]+p[oc] >= refer_floor` → "Suspicious / not cleared"
(overrides argmax); `max(p) < tau` → "Not confident". See `CONTRACT.md`.

| | coverage | macro-F1 (answered) | macro-F1 (all preds) | blur-warn frac |
|---|---|---|---|---|
| value | {cov:.3f} | {f1_ans:.3f} | {f1_all:.3f} | {blur_warn:.3f} |

## Screen-level behaviour (rule v2, what the app displays)

| metric | value |
|---|---|
| healthy shown "No suspicious features" | {screen['healthy_cleared']:.3f} |
| abnormal NOT cleared (screen sensitivity) | {screen['screen_sensitivity_of_abnormal_not_cleared']:.3f} |
| abnormal cleared as healthy (screen FN risk) | {screen['abnormal_cleared']:.3f} |
| referred (suspicious) | {screen['referred_frac']:.3f} |
| not confident (abstain) | {screen['not_confident_frac']:.3f} |
| answered per class (h/v/o/c) | {screen['per_class_answered']} |

## Per-class (raw argmax, no abstain — capability, not the shipped rule)

| class | pred | tp | fn | precision | recall |
|---|---|---|---|---|---|
{rows}
### Caveats
- Test split has **no class-3 (OC) samples** (patient-ID blocker; see
  `data/DATASET_NOTES.md`), so OC recall is unmeasurable on held-out data. OPMD recall
  above is the closest held-out measure of the disease signal.
- Tokenising the healthy-cleared rate and screen sensitivity: a "Suspicious" verdict here is a
  screening red flag (see a dentist), not a diagnosis.
- _Measured on the held-out test split; see `CONTRACT.md` for the decision rule._
"""
    open(OUT_MD, "w").write(md)
    open(LOCK, "w").write(json.dumps({"used_once": True, "onnx": os.path.basename(args.onnx), "rule": "v2", "note": "re-locked after model change"}))
    print(md)
    print("wrote", OUT_PARITY, OUT_MD, LOCK)


def cv2_laplacian(gray):
    # minimal separable 3x3 Laplacian variance, numpy-only (cv2 unavailable fallback safe)
    g = gray.astype(np.float64)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]])
    pad = np.pad(g, 1)
    lap = np.zeros_like(g)
    for i in range(3):
        for j in range(3):
            lap += k[i, j] * pad[i:i + g.shape[0], j:j + g.shape[1]]
    return lap.var()


if __name__ == "__main__":
    main()