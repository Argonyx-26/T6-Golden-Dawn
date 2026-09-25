# OraTrace

Oral lesion screening and follow-up assistant for dentists — built for Argonyx'26 at RV University.

India carries close to a third of the world's oral cancer burden, and most cases are still
caught at stage III or IV, not because the disease is hidden but because early lesions look
almost identical to harmless ones and the 14-day recheck routinely gets forgotten.

OraTrace runs fully offline in the browser. A dentist takes a guided photo, an on-device
model sorts it into healthy / variation / OPMD / suspicious — or says it isn't confident
enough to guess — and the app tracks the patient back for a 14-day recheck instead of
relying on memory.

## How it works
1. Habit + risk intake
2. Guided photo capture, with a quality gate that rejects blurry or badly lit shots
3. On-device triage (ONNX Runtime Web) with a heat-map and an explicit "not confident" state
4. A transparent rule table suggests an action; the dentist makes the final call
5. 14-day recall scheduling and a side-by-side comparison view

## Run it locally
\`\`\`bash
npm install
npm run build
npx serve out
\`\`\`
Works fully offline once loaded — no backend, no API keys.

## Model
Trained on the public [SMART-OM dataset](https://www.nature.com/articles/s41597-026-06954-5),
patient-level train/val/test split. Metrics, dataset details and training code are in `/model`.

## Limitations
Not a diagnostic device — only a biopsy can confirm oral cancer. Trained on one dataset,
mostly one population, and not clinically validated. It flags and tracks; the dentist decides.

## Team
The Golden Dawn — Rehan Ismail Ahmed, Syed Mohammed Quadri

## License
AGPL-3.0 — see [LICENSE](LICENSE)****
