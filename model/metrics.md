# OraTrace — final test metrics (one-time eval x2, S1 decision-rule change)

Model: `oratrace.onnx` on `test.csv` (n=342).
`T=1.875938208266764`, `tau=0.45`, `refer_floor=0.05`, `blur_min=45.7`.
Decision rule: **v2 sensitivity-first** — `p[opmd]+p[oc] >= refer_floor` → "Suspicious / not cleared"
(overrides argmax); `max(p) < tau` → "Not confident". See `CONTRACT.md`.

| | coverage | macro-F1 (answered) | macro-F1 (all preds) | blur-warn frac |
|---|---|---|---|---|
| value | 0.494 | 0.304 | 0.399 | 0.000 |

## Screen-level behaviour (rule v2, what the app displays)

| metric | value |
|---|---|
| healthy shown "No suspicious features" | 0.495 |
| abnormal NOT cleared (screen sensitivity) | 0.884 |
| abnormal cleared as healthy (screen FN risk) | 0.116 |
| referred (suspicious) | 0.506 |
| not confident (abstain) | 0.058 |
| answered per class (h/v/o/c) | {'healthy': 161, 'variation': 6, 'opmd': 2, 'oc': 0} |

## Per-class (raw argmax, no abstain — capability, not the shipped rule)

| class | pred | tp | fn | precision | recall |
|---|---|---|---|---|---|
| healthy | 267 | 253 | 46 | 0.948 | 0.846 |
| variation | 43 | 8 | 17 | 0.186 | 0.320 |
| opmd | 25 | 10 | 8 | 0.400 | 0.556 |
| oc | 7 | 0 | 0 | 0.000 | 0.000 |

### Caveats
- Test split has **no class-3 (OC) samples** (patient-ID blocker; see
  `data/DATASET_NOTES.md`), so OC recall is unmeasurable on held-out data. OPMD recall
  above is the closest held-out measure of the disease signal.
- Tokenising the healthy-cleared rate and screen sensitivity: a "Suspicious" verdict here is a
  screening red flag (see a dentist), not a diagnosis.
- _Measured on the held-out test split; see `CONTRACT.md` for the decision rule._
