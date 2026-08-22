# PROMPTER

A minimalist **PWA teleprompter** that follows the presenter. The long-term differentiator is
**Smart Follow** (on-device speech recognition that tracks your position in the script).

> The presenter shouldn't follow the teleprompter. The teleprompter should follow the presenter.

See the full product definition in [`PRD — PWA Teleprompter with Smart Follow.md`](./PRD%20—%20PWA%20Teleprompter%20with%20Smart%20Follow.md).

## Status — Phase 1 (Manual Teleprompter)

This repository currently implements **Phase 1: a complete manual teleprompter, no AI**. Smart Follow
is a separate, POC-gated cycle (its speech model/runtime must come from on-device benchmarks).

**In Phase 1:** Script Editor (Bold, PAUSE, autosave) · Setup (Close/Standard/Distance presets, live
preview, Mirror, Reading Marker, theme) · Prompt Mode (Focus Zone spotlight, eased Smooth Follow,
manual scrub, controls, Wake Lock) · dark + light themes · installable, offline-first PWA.

Flow: **Editor → Setup → Prompt** (Prompt enters paused; press ▶ to start; Exit → Editor).

## Stack

React 18 · TypeScript · Vite 6 · Tailwind CSS v4 (`@tailwindcss/vite`) · `vite-plugin-pwa` ·
Zustand · idb-keyval · Vitest. Inter is self-hosted (offline). The Smooth Follow Engine runs
imperatively (rAF + DOM ref) outside React; Phase 2's speech recognition will run in a Web Worker.

## Commands

```bash
npm install
npm run dev          # dev server
npm run build        # typecheck + production build (+ PWA service worker)
npm run preview      # serve the production build (needed to exercise the service worker)
npm test             # unit tests (document model + engine)
npm run typecheck

node scripts/gen-icons.mjs     # regenerate PWA icons (uses Playwright/Chromium)
node scripts/verify.mjs        # drive the full UI flow, screenshots to /tmp/prompter (dev server on :5188)
node scripts/verify-pwa.mjs    # verify offline + theme persistence (preview server on :5199)
```

## Structure

```
src/
  screens/     EditorScreen, SetupScreen, PromptScreen
  components/  editor/  setup/  prompt/  ui/
  engine/      SmoothFollowEngine (tested) + useSmoothFollow + useWakeLock
  model/       document (script model + sanitizer, tested), presets, settings
  state/       store (Zustand)
  persistence/ storage (IndexedDB script + localStorage prefs)
```

The **document model** (`model/document.ts`) is the single source of truth: the editor serializes the
contentEditable DOM into it, Prompt Mode renders from it, and it's what Smart Follow will tokenize.
