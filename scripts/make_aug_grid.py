import os
import sys

import pandas as pd
import torch
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from scripts.ora_aug import build_train_aug, deaug_tensor  # noqa: E402

CLASSES = ["healthy", "variation", "opmd", "oc"]
MANIFEST = os.path.join(ROOT, "data", "splits", "train_balanced.csv")
OUT = os.path.join(ROOT, "model", "aug_grid.png")
IMGS_PER_CLASS = 5
SIZE = 224
LABEL_H = 28
BG = (235, 235, 235)


def main():
    df = pd.read_csv(MANIFEST)
    aug = build_train_aug()
    torch.manual_seed(7)

    ncols = 1 + IMGS_PER_CLASS
    canvas = Image.new("RGB", (ncols * SIZE, 4 * (LABEL_H + SIZE)), BG)
    draw = ImageDraw.Draw(canvas)

    for c in range(4):
        row_df = df[df["label"] == c]
        path = os.path.join(ROOT, row_df["path"].iloc[0])
        base = Image.open(path).convert("RGB").resize((SIZE, SIZE))
        draw.text((6, c * (LABEL_H + SIZE) + 8), CLASSES[c], fill=(0, 0, 0))
        for j in range(1 + IMGS_PER_CLASS):
            x0 = j * SIZE
            y0 = c * (LABEL_H + SIZE) + LABEL_H
            if j == 0:
                tile = base
            else:
                t = aug(base)
                tile = Image.fromarray(
                    (deaug_tensor(t).permute(1, 2, 0).numpy() * 255).astype("uint8")
                )
            canvas.paste(tile, (x0, y0))

    canvas.save(OUT)
    print("saved ->", OUT, "| grid", 4, "classes x", ncols, "columns")


if __name__ == "__main__":
    main()