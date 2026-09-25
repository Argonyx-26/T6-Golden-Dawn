import argparse
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import torch
import torchvision.transforms as T
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import timm  # noqa: E402

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
NUM_CLASSES = 4
CLASSES = ["healthy", "variation", "opmd", "oc"]
MANIFEST = os.path.join(ROOT, "model", "parity_images.json")

# EXACT eval transform mandated by CONTRACT.md (must be byte-identical across
# training, calibration, export parity and the browser app).
CONTRACT_TF = T.Compose(
    [
        T.Resize((224, 224)),  # whole-image squash, NO crop
        T.ToTensor(),
        T.Normalize(MEAN, STD),
    ]
)


def softmax(x):
    x = np.asarray(x, dtype=np.float64)
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


@torch.no_grad()
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default=os.path.join("model", "checkpoints", "best_efficientnet_b0.pt"))
    ap.add_argument("--onnx", default=os.path.join("model", "oratrace.onnx"))
    ap.add_argument("--split", default=os.path.join("data", "splits", "train.csv"))
    ap.add_argument("--n-per-class", type=int, default=5, help="fixed 20 images = 5/class")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--tol", type=float, default=1e-3, help="max abs diff allowed on softmax probs")
    args = ap.parse_args()

    device = torch.device("cpu")
    ck = torch.load(args.ckpt, map_location=device)
    arch = ck.get("arch", "densenet121")
    model = timm.create_model(arch, pretrained=False, num_classes=NUM_CLASSES).to(device)
    model.load_state_dict(ck["model"])
    model.eval()
    print(f"torch model: {arch} (ckpt epoch {ck.get('epoch')}, val macro-F1 {ck.get('val_macro_f1')})")

    so = ort.SessionOptions()
    so.log_severity_level = 3
    sess = ort.InferenceSession(args.onnx, so, providers=["CPUExecutionProvider"])

    import pandas as pd

    df = pd.read_csv(os.path.join(ROOT, args.split))
    chosen = {}
    for c in range(NUM_CLASSES):
        sub = df[df["label"] == c].sample(n=args.n_per_class, random_state=args.seed)
        chosen[c] = sub
    sel = pd.concat(chosen.values()).reset_index(drop=True)
    if args.n_per_class * NUM_CLASSES == 20:
        manifest = [{"path": p, "label": int(l)} for p, l in zip(sel["path"], sel["label"])]
        json.dump(manifest, open(MANIFEST, "w"), indent=2)
        print("wrote fixed 20-image manifest ->", MANIFEST)

    max_logits, max_prob = 0.0, 0.0
    for _, row in sel.iterrows():
        img = Image.open(os.path.join(ROOT, row["path"])).convert("RGB")
        x = CONTRACT_TF(img).unsqueeze(0)
        tw = model(x).numpy()
        ow = sess.run(["logits"], {"input": x.numpy().astype(np.float32)})[0]
        dl = float(np.max(np.abs(tw - ow)))
        dp = float(np.max(np.abs(softmax(tw) - softmax(ow))))
        max_logits = max(max_logits, dl)
        max_prob = max(max_prob, dp)
        flag = "OK" if dp <= args.tol else "FAIL"
        ti, oi = int(tw[0].argmax()), int(ow[0].argmax())
        print(f"  {os.path.basename(row['path']):28s} true={CLASSES[int(row['label'])]:8s}"
              f" torch logit {ti}={tw[0, ti]:.3f}  onnx logit {oi}={ow[0, oi]:.3f}"
              f"  max|dl|={dl:.2e} max|dp|={dp:.2e} {flag}")

    print(f"\nover {len(sel)} images: max |logit diff| = {max_logits:.3e}, max |prob diff| = {max_prob:.3e}")
    assert max_prob <= args.tol, f"PARITY FAIL: prob diff {max_prob:.3e} > {args.tol}"
    print("PARITY PASS: torch == onnx within", args.tol)


if __name__ == "__main__":
    main()