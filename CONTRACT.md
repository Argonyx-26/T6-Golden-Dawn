# OraTrace — model/browser contract (v1)

Agreed between Quadri (model) and Rehan (app). Any change must be committed here first.
If the model does not match this exactly, Rehan's app gives wrong answers without an error.

## Inputs

| Item | Value |
|---|---|
| Input name | `input` |
| Shape | `[1, 3, 224, 224]`, float32 |
| Color order | RGB |
| Resize | whole image squashed to 224×224, **no crop** (a crop can cut the lesion out) |
| Normalize | mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]` |

Evaluation transform must match exactly:
`transforms.Resize((224, 224))`, `ToTensor()`, `Normalize(mean, std)`.
Augmentation is for training only.

## Outputs

| Output | Shape |
|---|---|
| `logits` | `[1, 4]` |
| `cam` | `[1, 4, 7, 7]` |

## Class order (never changes)

| Index | Class |
|---|---|
| 0 | healthy |
| 1 | variation |
| 2 | opmd |
| 3 | oc |

## Decision rule (app side)

1. `p = softmax(logits / T)`
2. If `max(p) < tau` → abstain ("see a dentist").
3. If predicted class is `healthy` or `variation` but `p[opmd] + p[oc] >= refer_floor` → abstain / refer.
4. Blur score of the input image below `blur_min` → warn image too blurry.

`T`, `tau`, `refer_floor`, `blur_min` live in `model_meta.json`, not baked into the ONNX.