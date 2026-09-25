import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "splits", "train.csv")
OUT = os.path.join(ROOT, "data", "splits", "train_balanced.csv")
N_PER_CLASS = 60
TARGET = [0, 1, 2, 3]
SEED = 42


def main():
    df = pd.read_csv(SRC)
    rows = []
    for c in TARGET:
        sub = df[df["label"] == c].copy()
        n_pat = sub["subject_id"].nunique()
        if n_pat >= N_PER_CLASS:
            # max patient diversity: N distinct patients, one image each
            pats = sub["subject_id"].drop_duplicates().sample(n=N_PER_CLASS, random_state=SEED)
            keep = sub[sub["subject_id"].isin(pats)].groupby("subject_id").head(1)
            assert keep["subject_id"].nunique() == N_PER_CLASS
        else:
            # all patients at least once, then fill remainder (repetition is fine:
            # on-the-fly augmentation makes repeats yield different variants)
            keep = sub.groupby("subject_id").head(1)
            fill = sub.sample(n=N_PER_CLASS - len(keep), random_state=SEED, replace=True)
            keep = pd.concat([keep, fill], ignore_index=True)
        keep = keep.head(N_PER_CLASS)
        rows.append(keep)

    bal = pd.concat(rows, ignore_index=True)
    counts = bal["label"].value_counts().reindex([0, 1, 2, 3], fill_value=0)
    print("balanced train manifest:")
    for c in TARGET:
        print(f"  class {c}: {int(counts[c])} rows, {bal.loc[bal.label==c, 'subject_id'].nunique()} patients")
    print("  total rows:", len(bal))

    bal[["path", "label", "subject_id", "patient_known", "filename"]].to_csv(OUT, index=False)

    # safeguards: patient-level separation vs val/test and identical content
    va = pd.read_csv(os.path.join(ROOT, "data", "splits", "val.csv"))
    te = pd.read_csv(os.path.join(ROOT, "data", "splits", "test.csv"))
    assert not set(bal["subject_id"]) & set(va["subject_id"])
    assert not set(bal["subject_id"]) & set(te["subject_id"])
    assert set(bal["path"]) <= set(pd.read_csv(SRC)["path"])
    print("safeguards OK: no patient shared with val/test; every row is an original train image")
    print("saved ->", OUT)


if __name__ == "__main__":
    main()