---
name: verify
description: Build, launch, and drive the PROMPTER PWA to observe changes end-to-end (browser-driven).
---

# Verifying PROMPTER

This is a browser-based PWA (React + Vite). Verify by driving the real UI with Playwright
(already a devDependency; Chromium is installed) and capturing screenshots — not by running tests.

## Handles

- **UI flow (dev):** `npx vite --port 5188 &` then `node scripts/verify.mjs`
  → drives Editor → Setup → Prompt, saves shots to `/tmp/prompter/*.png`. Read those images.
- **PWA offline + theme (prod):** `npm run build && npx vite preview --port 5199 &` then
  `node scripts/verify-pwa.mjs` → confirms service worker, light-theme persistence, and offline reload.
  The service worker only runs in the **preview/build** server, never in `vite dev`.
- **Prompt Restart + tap-to-jump (dev):** `node scripts/verify-prompt.mjs` → asserts Restart eases to
  top and pauses, tap-to-jump recenters a tapped line at ~40%, and a tap while controls are hidden only
  reveals them (no jump).
- **Smart Follow lab (dev):** `node scripts/verify-lab.mjs` → seeds a script, opens the hidden `#lab`
  harness (reach via `window.location.hash='#lab'`; a `hashchange` listener switches views), types a
  "spoken" phrase, and asserts the matched line eases to ~40% with high confidence, while a garbled
  phrase does NOT move the position (false-jump resistance). Matcher/tokenizer/positionMap are pure and
  covered by unit tests (`src/smartfollow/*.test.ts`). For responsive/mobile layout, drive Setup at 360×640 / 844×390 and assert the
  `button "Start Prompt"` bottom ≤ viewport height (it's pinned outside the `.overflow-y-auto` region).

## Drive the surface

- Editor: type into `getByRole('textbox', { name: 'Script' })`; Bold = `button "Bold selection"`,
  PAUSE = `button "Pause"` (exact), New = `button "New"`. Word count = `getByText(/words$/)`.
- Setup: presets are `role=radio` (Close/Standard/Distance); toggles by label text (Mirror, Reading
  Marker, Light theme). Smart Follow is intentionally disabled ("Coming soon").
- Prompt: enters **paused**; `button "Play"`/"Pause", "Slower"/"Faster", "Exit". The scrolling element
  is `[data-prompter-text]`; read its `getComputedStyle(...).transform` before/after Play to confirm motion.

## Gotchas

- Screenshot scripts must live under `scripts/` (project `node_modules`), not `/tmp`, so `playwright` resolves.
- Autosave is debounced (~250ms) — `sleep(400)` before asserting word count or persistence.
- Inserting a PAUSE mid-script nests the following line in a wrapper `<div>` (execCommand); the document
  serializer handles this — regression covered in `src/model/document.test.ts`.
