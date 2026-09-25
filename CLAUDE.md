# OraTrace

Dentist-facing, fully offline oral lesion screening + 14-day follow-up app. Argonyx'26 hackathon, must demo offline by Friday morning.

## Stack
- Next.js App Router + TypeScript + Tailwind, `output: 'export'` (static files, no server)
- onnxruntime-web for inference, Dexie + dexie-react-hooks for local storage
- Supabase Auth is the one permitted network dependency, used only for dentist sign-in (client-side @supabase/supabase-js calls). All clinical data — patients, habits, lesions, captures, decisions, recalls — stays local in Dexie and is NEVER sent to Supabase or any other network endpoint. Auth session check must use supabase.auth.getSession() (reads local cache, no network call), never getUser() (network call), so the app stays usable offline after the first login until the token expires.

## Rules
- Dev OS is Windows. Setup/copy steps are Node scripts run via `npm`, never bash-only commands.
- Static export can't serve IDs that only exist in IndexedDB — never use `[id]` routes. Use query params (`/patient?id=3`) and wrap every `useSearchParams` user in `<Suspense>`.
- Anything touching `window`, IndexedDB, canvas, or onnxruntime goes in a `'use client'` component. Import `onnxruntime-web` dynamically.
- Every "now"/"today" goes through `now()` in `lib/clock.ts` (real time + demo day offset). Never call `new Date()` or `Date.now()` for current time anywhere else.
- Never create a folder named `data/` or `datasets/` anywhere (gitignored).
- The model interface is `CONTRACT.md`. Never change it without asking Rehan.
- The UI never says "diagnosis". It shows model output, a rule-based SUGGESTED action, and the dentist's FINAL action, logged separately.
- Simplest thing that works. No new dependency unless it removes real code.
- Teammate Quadri trains the model on `quadri/model` (`model/` folder) — never touch that branch/folder.

## After every task
`npm run build` must pass, commit on `rehan/app` with a descriptive message, then update Status below (done / next / known issues, max 6 lines).

## Status
- Done: quality gate (`lib/quality.ts`) + `/capture` flow; real model wiring in `lib/model.ts` (contract preprocess, input/output name check, 404 → mock, HTML/bad-meta → error); `components/ModelProvider.tsx` loads the session once at app start (banner + Retry), `useModel()`; `lib/postprocess.ts` softmax/abstain/camSlice (TDD, `npm test`); capture stores `probs`, `abstain`, `metaVersion`; `/result` shows photo, % bars, top class, yellow abstain badge, 7×7 heat-map toggle (45%), red MOCK MODEL tag when `metaVersion === "mock"`; `/settings` (demo day offset, reminder window; WhatsApp message greets the patient by name and gives the clinic phone), `DemoBanner`, `lib/recall.ts` (status + wa.me link, tested), recall status + WhatsApp button on patient page, capture marks pending recall done; rule engine (dentist-approved table in `public/rules.json` v1.0, fetched at runtime; `lib/rules.ts` `suggest(result, habits, context, rules)` + `loadRules()`, TDD, 26 tests) and `components/DecisionPanel.tsx` on `/result` (Suggested card with rule id + reason, counsel note, 3 final-action buttons, optional reason on override; saves `decisions` {captureId, suggested, ruleId, rulesVersion, final, reason, decidedAt}; final "Recheck in 14 days" creates the real recall; temp recall button deleted; patient page lists decisions per lesion with the override note); `Habit` gained 3 risk-factor flags (family history, previous OPMD/OC, poorly fitting denture) + checkboxes in `HabitFields`. Verified in a browser (all paths).
- Auth: Supabase email+password dentist sign-in (`lib/supabase.ts`, `/login`, `/signup` → `dentist_profiles`, `components/AuthGate.tsx` via getSession, Log out in `/settings`; schema in `supabase/schema.sql`, run manually). Dentist must log in once with internet before going offline for the rest of a session; session is cached locally and survives Wi-Fi loss until the token expires. Clinic identity now comes from the `dentist_profiles` row cached in localStorage `oratrace_profile` (`lib/profile.ts`, fetched once by AuthGate on first login, cleared on logout; clinic phone = the dentist's `mobile`); Settings clinic name/phone fields removed. Real Supabase round-trip (signup/login/profile fetch) not yet verified.
- Compare: `/compare?lesionId=N` — baseline vs latest (pickers for any two), equal photos on a dark mat, dates + "N days apart", per-photo class / abstain / risk bar (probs[2]+probs[3], whole %), one heat-map toggle, "Risk score A% → B%"; auto Better/Same/Worse from the delta (`CHANGE_THRESHOLD = 0.05` at top of file), dentist can override; `DecisionPanel` gets `{isRecheck: true, change}` for the later capture and saves the decision on it. `/result` on a recheck capture shows "Compare with the earlier photo to decide" instead of a first-visit decision. Verified in a browser (auto + overrides, RC1/RC2 refer, pickers, heat-map, save, <2 captures notice).
- Landing: `public/landing.html` (scroll-scrubbed `public/tooth-scrub.mp4`, served at `/landing.html`; `/` meta-refreshes there, patient list at `/patients`). Redesign pass (uncommitted, visual only): tokens + `.btn/.choice/.field/.card/.label` + motion tokens (`--ease-out-strong`, `--duration-*`, `animate-enter/fade`) in `globals.css`; muted text token replaces failing `foreground/60`; AppHeader (in AuthGate) for wayfinding; DemoBanner no longer yellow; done on every app/ route + DecisionPanel (refer = red, abstain = yellow), sticky photo on /result, lesion cards link to latest result with "No decision yet", capture names the patient; `DESIGN.md` documents the system; impeccable detect clean, critique 23/40 before fixes; verified in a browser except /compare with 2 photos (no such data on :3000).
- Next: tune `CHANGE_THRESHOLD` with the dentist; decision isn't stored with the chosen change (only implied by RC1/RC2/base rule id).
- Known issues: a decision is write-once per capture (no edit/undo); habits saved before the 3 risk-factor flags read as "no" until edited; WhatsApp click-through and recall→done on capture not verified in a real browser; `public/models/*` are currently GitHub HTML pages, not the real files (re-download raw) — real-model path is unverified; refer rule uses `>=` per CONTRACT.md; preprocessing uses canvas default resampling (not PIL bilinear+antialias); blur_min uncalibrated; habits form has no unsaved-changes guard; offline, getSession() returns null once the access token expires (Supabase default JWT expiry 1h — raise it in dashboard for demo) → bounced to /login; pre-existing lint error in `app/patient/page.tsx`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
