---
name: OraTrace
description: Offline oral lesion screening and 14-day follow-up for dentists, used standing at the chair.
colors:
  background: "#f3f5f6"
  surface: "#ffffff"
  surface-2: "#eaeff1"
  foreground: "#15232a"
  muted: "#55646b"
  faint: "#7b878d"
  border: "#d5dde0"
  border-strong: "#b7c3c8"
  accent: "#0d6b72"
  accent-hover: "#0a5a60"
  accent-soft: "#e2f0f1"
  warning: "#7a5300"
  warning-bg: "#fdf2c4"
  warning-border: "#e8c64d"
  danger: "#b42318"
  danger-bg: "#fde8e6"
  danger-border: "#f2b8b2"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  data:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
rounded:
  control: "12px"
  card: "16px"
spacing:
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "{spacing.tap}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "{spacing.tap}"
  choice-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  choice-refer-selected:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
  badge-not-confident:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
---

# Design System: OraTrace

## Overview

**Creative North Star: "The Chairside Instrument"**

OraTrace is a clinical tool, not a brochure. It should feel like a well-made dental instrument: quiet, exact and trustworthy. The dentist reads it standing up, gloved, on a tablet or projector, often mid-conversation with a patient. The interface steps back. Only the photo, the model output and the decision carry weight.

The base is a cool slate neutral with a single teal accent for actions and selection. Color beyond that is reserved for meaning. The source of truth is `app/globals.css`.

**Key characteristics:** one accent; semantic color that is never decorative; 44px minimum tap targets; photos on a dark mat; data in tabular numerals; motion only when state changes.

## Colors

### Primary
- **Chairside Teal** (#0d6b72): primary actions, selected choices, the top-class probability bar, risk meters. Hover darkens to #0a5a60. #e2f0f1 is the soft tint for "passed" and selection highlights.

### Neutral
- **Clinic Mist** (#f3f5f6): page background. **White** (#ffffff): cards and controls. **Inset** (#eaeff1): read-only notes, counsel note, hover on secondary.
- **Ink** (#15232a): text; also the dark photo mat. **Muted** (#55646b): secondary text, 5.6:1. **Faint** (#7b878d): decorative only (arrows, axis ticks), never body copy.

### Named Rules
**The Load-Bearing Color Rule.** Yellow (`warning*`) means one thing: the model is not confident. Red (`danger*`) means refer, or a danger/error state (mock model, rejected photo, failed load, overdue recall). Nothing else is ever yellow or red, including the demo clock, which is ink.

## Typography

**Font:** Geist (self-hosted by next/font, works offline). **Data/IDs:** Geist Mono, only for rule IDs and the model version.

Hierarchy: page title 30–36px/600, tight tracking; section titles 20px/600; body 16px/1.5 (inputs are 16px so iOS never zooms); labels 14px/500 in muted. Every percentage, date and phone number uses `tabular-nums`.

## Layout

Single column on phones (16px gutter). From `md`, /result and /compare go to two columns: photo left, output and decision right; /compare puts both photos side by side. Content max width 6xl (1152px) for image screens and 3xl or xl for lists and forms. The app header carries the wordmark (home), Patients and Settings.

## Elevation & Depth

Nearly flat. Cards sit on a soft, ink-tinted shadow plus a 6% hairline ring (`--shadow-card`); there are no hard borders on cards. Photos sit on a dark ink mat so both compare images read at equal weight on a projector.

## Shapes

Controls 12px radius, cards 16px, photo mats 16px with 12px images inside (concentric).

## Components

- `.btn` + `.btn-primary | -secondary | -danger | -ghost`, `.btn-lg`: 44px minimum, press scale 0.98 on `:active`, hover only on hover-capable pointers.
- `.choice`: segmented or option button; selection is `aria-pressed="true"` (teal). Refer selected overrides to red. A `fieldset disabled` makes choices read-only while keeping the selection legible.
- `.field`: 48px input, 16px text, accent border on focus.
- `.card`, `.label`: surface container and muted small label.

Motion tokens: `--ease-out-strong` cubic-bezier(0.23, 1, 0.32, 1), `--duration-press` 120ms, `--duration-fast` 160ms, `--duration-base` 220ms; `animate-enter` (6px rise + fade) and `animate-fade`. Reduced motion keeps fades and drops movement.

## Do's and Don'ts

- **Do** animate only a state change: quality-gate verdict, heat-map cross-fade, decision recorded, reason field appearing.
- **Don't** animate lists, probability bars, risk meters or page navigation. The dentist is reading data during a timed demo.
- **Do** put secondary text in `text-muted`. **Don't** use `text-foreground/60` or lower for text; it fails contrast.
- **Don't** use the word "diagnosis". Show model output, a rule-based suggested action and the dentist's final action, separately.
