import argparse
import json
import os
import random
import sys
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import timm  # noqa: E402

from scripts.ora_aug import build_eval_tf, build_train_aug  # noqa: E402

NUM_CLASSES = 4
CLASSES = ["healthy", "variation", "opmd", "oc"]


class SplitDS(Dataset):
    def __init__(self, csv_path, transform):
        import pandas as pd

        self.df = pd.read_csv(csv_path)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        row = self.df.iloc[i]
        img = Image.open(os.path.join(ROOT, row["path"])).convert("RGB")
        return self.transform(img), int(row["label"])


class FocalLoss(nn.Module):
    """Focal loss (gamma>=0) with optional label smoothing.

    factor = (1 - p_t)^gamma per-sample re-weights; with gamma=0 it reverts to
    plain (label-smoothed) cross-entropy.
    """

    def __init__(self, gamma=2.0, label_smoothing=0.05, reduction="mean"):
        super().__init__()
        self.gamma = float(gamma)
        self.ls = float(label_smoothing)
        self.reduction = reduction

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(
            logits, targets, label_smoothing=self.ls, reduction="none"
        )
        pt = logits.softmax(dim=1).gather(1, targets[:, None]).squeeze(1)
        loss = (1.0 - pt).pow(self.gamma) * ce
        return loss.mean() if self.reduction == "mean" else loss


def macro_recall(labels, preds, n=NUM_CLASSES):
    labels = np.asarray(labels)
    preds = np.asarray(preds)
    present = np.unique(labels)
    ret = []
    for c in present:
        tp = int(np.sum((preds == c) & (labels == c)))
        fn = int(np.sum((preds != c) & (labels == c)))
        ret.append(tp / (tp + fn) if tp + fn else 0.0)
    return float(np.mean(ret)) if ret else 0.0, [round(r, 4) for r in ret], [int(c) for c in present]


def macro_f1(labels, preds, n=NUM_CLASSES):
    labels = np.asarray(labels)
    preds = np.asarray(preds)
    fs = []
    for c in range(n):
        tp = int(np.sum((preds == c) & (labels == c)))
        fp = int(np.sum((preds == c) & (labels != c)))
        fn = int(np.sum((preds != c) & (labels == c)))
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        fs.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return float(np.mean(fs))


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def balanced_sampler(ds, seed=42):
    """Equal per-epoch class representation, sampling from the FULL train pool
    (keeps 1516 healthy patients for diversity instead of deleting to N=60)."""
    counts = ds.df["label"].value_counts().reindex(range(NUM_CLASSES), fill_value=0)
    if (counts == 0).any():
        raise ValueError(f"every class needed for balanced sampling; counts={dict(counts)}")
    w = (1.0 / counts.to_numpy().astype(float))[ds.df["label"].to_numpy()]
    gen = torch.Generator().manual_seed(seed)
    draws = {c: round(len(ds.df) / NUM_CLASSES) for c in range(NUM_CLASSES)}
    print(f"balanced sampler (replacement, seed={seed}): expected draws/epoch {draws} of {len(ds.df)}")
    return WeightedRandomSampler(w, num_samples=len(ds.df), replacement=True, generator=gen)


def run_epoch(model, loader, criterion, optimizer, device, train):
    model.train(train)
    losses, all_y, all_p = [], [], []
    with torch.set_grad_enabled(train):
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            out = model(x)
            loss = criterion(out, y)
            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            losses.append(loss.item())
            all_y.append(y.cpu().numpy())
            all_p.append(out.argmax(dim=1).cpu().numpy())
    y = np.concatenate(all_y)
    p = np.concatenate(all_p)
    rec, _, _ = macro_recall(y, p)
    return float(np.mean(losses)), rec, macro_f1(y, p)


def freeze_backbone(model):
    for p in model.parameters():
        p.requires_grad = False
    for p in model.get_classifier().parameters():
        p.requires_grad = True


def unfreeze_all(model):
    for p in model.parameters():
        p.requires_grad = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arch", default="efficientnet_b0", choices=("efficientnet_b0", "mobilenetv3_large_100"))
    ap.add_argument("--train-csv", default=os.path.join("data", "splits", "train.csv"))
    ap.add_argument("--val-csv", default=os.path.join("data", "splits", "val.csv"))
    ap.add_argument("--balance", dest="balance", action="store_true", default=True, help="equal per-epoch class draws over the full train pool")
    ap.add_argument("--no-balance", dest="balance", action="store_false", help="plain shuffle on the given train csv")
    ap.add_argument("--epochs-frozen", type=int, default=3)
    ap.add_argument("--epochs-unfreeze", type=int, default=10)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--lr-frozen", type=float, default=1e-3)
    ap.add_argument("--lr-unfreeze", type=float, default=1e-4)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--loss", default="ce", choices=("ce", "focal"))
    ap.add_argument("--gamma", type=float, default=2.0)
    ap.add_argument("--label-smoothing", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--resume", default=None, help="continue from a best_v2 checkpoint (keeps current stage/phase)")
    ap.add_argument("--out", default=os.path.join("model", "checkpoints"))
    args = ap.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(os.cpu_count() or 4)
    print(f"device={device} threads={os.cpu_count() or 4} seed={args.seed} arch={args.arch} loss={args.loss}")

    train_ds = SplitDS(os.path.join(ROOT, args.train_csv), build_train_aug())
    val_ds = SplitDS(os.path.join(ROOT, args.val_csv), build_eval_tf())
    if args.balance:
        train_ld = DataLoader(train_ds, batch_size=args.batch_size, sampler=balanced_sampler(train_ds, args.seed))
    else:
        train_ld = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_ld = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)
    tr_counts = train_ds.df["label"].value_counts().reindex(range(NUM_CLASSES), fill_value=0)
    va_counts = val_ds.df["label"].value_counts().reindex(range(NUM_CLASSES), fill_value=0)
    print(f"train rows/class {dict(zip(CLASSES, tr_counts.tolist()))} -> {len(train_ds)}")
    print(f"val   rows/class {dict(zip(CLASSES, va_counts.tolist()))} -> {len(val_ds)}")

    model = timm.create_model(args.arch, pretrained=True, num_classes=NUM_CLASSES).to(device)
    if args.loss == "focal":
        crit = FocalLoss(gamma=args.gamma, label_smoothing=args.label_smoothing)
    else:
        crit = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)

    os.makedirs(args.out, exist_ok=True)
    log_rows = []
    best = {"rec": -1.0, "path": None, "epoch": 0}
    no_improve = 0

    stages = [
        ("frozen", args.epochs_frozen, args.lr_frozen, freeze_backbone),
        ("unfrozen", args.epochs_unfreeze, args.lr_unfreeze, unfreeze_all),
    ]

    resume_state = None
    if args.resume and os.path.exists(args.resume):
        ck = torch.load(args.resume, map_location=device)
        assert ck.get("arch") == args.arch, f"resume arch mismatch: {ck.get('arch')}"
        model.load_state_dict(ck["model"])
        rstage = ck["stage"]
        rsi = [s[0] for s in stages].index(rstage)
        prev_total = sum(s[1] for s in stages[:rsi])
        rdone = int(ck["epoch"]) - prev_total
        assert 0 <= rdone < stages[rsi][1], f"bad resume point epoch {ck.get('epoch')} stage {rstage}"
        best = {"rec": float(ck.get("val_macro_recall", -1.0)),
                "path": os.path.join(args.out, f"best_v2_{args.arch}.pt"),
                "epoch": int(ck["epoch"])}
        resume_state = {"si": rsi, "done": rdone}
        print(f"resume: continue {rstage} at phase-epoch {rdone}/{stages[rsi][1]}, "
              f"best so far val_rec={best['rec']:.4f} @ ep {best['epoch']}", flush=True)

    for i, (name, epochs, lr, prep) in enumerate(stages):
        prev_total = sum(s[1] for s in stages[:i])
        if resume_state is not None and i < resume_state["si"]:
            continue
        prep(model)
        opt = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=lr, weight_decay=1e-4)
        if resume_state is not None and i == resume_state["si"]:
            start_e, use_cosine = resume_state["done"], False
            print(f"\n== phase {name}: resumed at epoch {start_e}/{epochs}, constant lr={lr:.0e} ==", flush=True)
        else:
            start_e, use_cosine = 0, True
            print(f"\n== phase {name}: {epochs} epochs, lr={lr:.0e} ==", flush=True)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs) if use_cosine else None
        for e in range(start_e, epochs):
            g = prev_total + e + 1
            t0 = time.time()
            trl, _trr, trf = run_epoch(model, train_ld, crit, opt, device, True)
            val, vrr, vf = run_epoch(model, val_ld, crit, None, device, False)
            if sched is not None:
                sched.step()
            dt = time.time() - t0
            row = {"stage": name, "epoch": g, "tl": round(trl, 4), "tf": round(trf, 4),
                   "vl": round(val, 4), "vf": round(vf, 4), "vrec": round(vrr, 4), "secs": round(dt, 1)}
            log_rows.append(row)
            print(f"[{name}] ep {g:02d}  tr_l {trl:.4f} tr_F1 {trf:.4f} | val_l {val:.4f} val_F1 {vf:.4f} "
                  f"val_macroRec {vrr:.4f}  ({dt:.0f}s)", flush=True)
            if vrr > best["rec"]:
                best = {"rec": vrr, "path": os.path.join(args.out, f"best_v2_{args.arch}.pt"),
                        "epoch": g}
                torch.save({"model": model.state_dict(), "arch": args.arch, "stage": name, "epoch": g,
                            "phase_done": e + 1, "val_macro_recall": vrr, "val_macro_f1": vf,
                            "loss": args.loss, "label_smoothing": args.label_smoothing, "seed": args.seed},
                           best["path"])
                no_improve = 0
            else:
                no_improve += 1
                if no_improve >= args.patience:
                    print(f"  early stop (no val macro-recall improvement for {args.patience})", flush=True)
                    break
        if resume_state is not None and i == resume_state["si"]:
            resume_state = None  # only one phase is resumed; later phases run fresh
    df = pd.DataFrame(log_rows)
    out_csv = os.path.join(args.out, f"train_log_v2_{args.arch}.csv")
    df.to_csv(out_csv, index=False)
    summary = {
        "arch": args.arch, "loss": args.loss, "gamma": args.gamma,
        "label_smoothing": args.label_smoothing, "seed": args.seed,
        "best_epoch": best["epoch"], "best_val_macro_recall": best["rec"],
        "best_ckpt": os.path.basename(best["path"]), "train_csv": args.train_csv,
        "note": "early stop + save on val macro-recall (present classes only; OC absent from val).",
    }
    with open(os.path.join(args.out, f"train_summary_v2_{args.arch}.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print("\nBEST val macro-recall:", round(best["rec"], 4), "->", best["path"])
    print("log ->", out_csv)
    print("summary ->", summary)


if __name__ == "__main__":
    main()