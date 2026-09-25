import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_image(path):
    with Image.open(path) as image:
        image.load()
        return {"width": image.width, "height": image.height, "mode": image.mode}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--dest", default=str(ROOT / "data" / "external_oc"))
    parser.add_argument("--train-out", default=str(ROOT / "data" / "splits" / "train_oc_augmented.csv"))
    parser.add_argument("--manifest", default=str(ROOT / "model" / "extra_oc_manifest.json"))
    parser.add_argument("--label", type=int, default=3)
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    dest = Path(args.dest).expanduser().resolve()
    train_out = Path(args.train_out).expanduser().resolve()
    manifest_out = Path(args.manifest).expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"source directory does not exist: {source}")
    if args.label != 3:
        raise SystemExit("external oral-cancer imports must use label 3")

    source_files = sorted(
        p for p in source.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )
    if not source_files:
        raise SystemExit(f"no supported images found under {source}")

    existing = ROOT / "data" / "splits" / "train.csv"
    base = pd.read_csv(existing)
    known_hashes = set()
    for rel in pd.concat([
        pd.read_csv(ROOT / "data" / "splits" / "val.csv"),
        pd.read_csv(ROOT / "data" / "splits" / "test.csv"),
        base,
    ])["path"]:
        path = ROOT / rel
        if path.exists():
            known_hashes.add(digest(path))

    rows = []
    records = []
    seen = {}
    duplicates = []
    overlaps = []
    for source_path in source_files:
        rel_source = source_path.relative_to(source).as_posix()
        sha = digest(source_path)
        info = inspect_image(source_path)
        record = {
            "source_relative": rel_source,
            "sha256": sha,
            "width": info["width"],
            "height": info["height"],
            "mode": info["mode"],
            "label": args.label,
        }
        if sha in seen:
            duplicates.append({"sha256": sha, "kept": seen[sha], "skipped": rel_source})
            continue
        if sha in known_hashes:
            overlaps.append({"sha256": sha, "source_relative": rel_source})
            continue
        seen[sha] = rel_source
        suffix = source_path.suffix.lower()
        destination = dest / f"{sha[:16]}{suffix}"
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or digest(destination) != sha:
            shutil.copy2(source_path, destination)
        rel_repo = destination.relative_to(ROOT).as_posix()
        subject_id = f"EXTOC{sha[:12]}"
        rows.append({
            "path": rel_repo,
            "label": args.label,
            "subject_id": subject_id,
            "patient_known": 0,
            "filename": rel_source,
        })
        record["repo_path"] = rel_repo
        records.append(record)

    if not rows:
        raise SystemExit("no new unique class-3 images remained after deduplication")

    augmented = pd.concat([base, pd.DataFrame(rows)], ignore_index=True)
    val = pd.read_csv(ROOT / "data" / "splits" / "val.csv")
    test = pd.read_csv(ROOT / "data" / "splits" / "test.csv")
    assert not set(augmented["subject_id"]) & set(val["subject_id"])
    assert not set(augmented["subject_id"]) & set(test["subject_id"])
    assert augmented["path"].is_unique
    assert (augmented.loc[augmented["label"] == args.label, "patient_known"] == 0).all()
    train_out.parent.mkdir(parents=True, exist_ok=True)
    augmented.to_csv(train_out, index=False)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source_name": source.name,
        "source_files": len(source_files),
        "unique_added": len(rows),
        "duplicates_skipped": duplicates,
        "existing_dataset_overlaps_skipped": overlaps,
        "label": args.label,
        "class_name": "oc",
        "split_policy": "train_only; source has no verified patient IDs",
        "train_csv": str(train_out.relative_to(ROOT)),
        "records": records,
    }
    manifest_out.write_text(json.dumps(manifest, indent=2) + "\n")
    counts = augmented["label"].value_counts().reindex(range(4), fill_value=0)
    print(f"source_images={len(source_files)} unique_added={len(rows)} duplicates={len(duplicates)} overlaps={len(overlaps)}")
    print(f"train_rows={len(augmented)} counts={dict(zip(['healthy', 'variation', 'opmd', 'oc'], counts.tolist()))}")
    print(f"train_csv={train_out}")
    print(f"manifest={manifest_out}")


if __name__ == "__main__":
    main()
