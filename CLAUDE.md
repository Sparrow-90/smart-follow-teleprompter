# CLAUDE.md — PROMPTER

Foundation notes for working on this repo. Read this first in a new session.

## What this is

**PROMPTER** — a minimalist **PWA teleprompter** whose differentiator is **Smart Follow**: on-device
speech recognition that tracks where the presenter is in the script and moves the text to match.
Full product spec: `PRD — PWA Teleprompter with Smart Follow.md`. Primary device is **tablet/iPad
(Safari)**. Principles: offline-first, on-device, private, zero-cost core (no paid APIs).

Core idea: *the teleprompter follows the presenter, not the other way around.*

## Current state (2026-08)

- **Phase 1 — Manual teleprompter: shipped** (branch `main`). Editor, Setup, Prompt Mode, Smooth Follow
  engine, presets, Mirror, Reading Marker, dark+light theme, installable offline PWA.
- **Smart Follow — integrated** into the real Setup→Prompt flow (live toggle, confidence status,
  manual override, re-anchor recovery). On-device Vosk speech → matcher → gentle word-level follow.
  Confirmed working live (Polish, Safari). `#lab` survives as a dev harness, not the product path.
  PRD Phase 3's remaining gap is **pause behaviour** — `tokenizeScript` still drops PAUSE blocks.

## Stack

React 18 · TypeScript · Vite 6 · Tailwind v4 (`@tailwindcss/vite`) · `vite-plugin-pwa` · Zustand ·
idb-keyval · Vitest 3 · Framer Motion (the `motion` package, imported from `motion/react`).
On-device speech: `vosk-browser` (WASM). Inter self-hosted.

## Architecture

```
src/
  screens/      EditorScreen, SetupScreen, PromptScreen, SmartFollowLabScreen (#lab POC harness)
  components/   editor/  setup/  prompt/  ui/
  engine/       SmoothFollowEngine (tested) + useSmoothFollow (rAF loop) + useWakeLock
  motion/       tokens — the whole app's motion vocabulary (`travel` spring / `change` ease)
  model/        document (script model + sanitizer, tested), reflowPastedText (tested),
                presets (+ resolvePreset, tested), settings
  state/        store (Zustand): view, scriptDoc, settings, hydrate/persist
  persistence/  storage (IndexedDB script + localStorage prefs)
  smartfollow/  tokenizeScript, matcher, positionMap (all pure + tested);
                stt/voskEngine, useVosk (mic → recognized words)
```

**Three hard boundaries:**
1. **Document model is the single source of truth** (`model/document.ts`). Editor serializes the
   contentEditable DOM → `ScriptDoc`; Prompt Mode renders from it; `tokenizeScript` tokenizes it for
   Smart Follow. Word indices in `PromptText wordIndices` align to `tokenizeScript`'s global indices.
2. **Smooth Follow runs imperatively outside React** — a rAF loop writes `transform: translateY` to a
   ref. Modes: `auto` (manual scroll), `follow` (Smart Follow eases to a target, velocity-limited).
3. **Framer Motion is confined to Editor + Setup + `ui/`.** `components/prompt/`, `engine/` and
   `smartfollow/` contain no `motion.*` at all — see the gotchas below for why.

**Smart Follow pipeline:** mic → **Vosk** (WASM, offline) → recent words → **matcher** (find position +
confidence, tolerant to paraphrase/skip/backtrack, resists false jumps) → target the matched **word's
visual line** (`[data-w]` rect) → **SmoothFollowEngine** follow mode eases there gently.

## Key decisions / gotchas

- **Preset sizes are authored for one tablet and fitted to the real screen** by `resolvePreset`.
  Two scales, deliberately: **text** grows by whichever viewport axis is tighter (height decides
  how many lines fit, and the presenter reads by lines), **the column** grows by width (width is
  the only thing limiting it — tying it to the tighter axis left a quarter of a wide screen empty).
  `PromptScreen` must derive `lineHeightPx` from the *resolved* preset, not `PRESETS[...]`: Smart
  Follow aims at a line with that number, so if the rendered text scales and it doesn't, the
  follow targets a line the presenter isn't reading. That coupling is why this can't be a CSS
  `vw` trick. `verify-preset-size.mjs` asserts the two still agree.
- **Paste is reflowed, because a PDF copy has no paragraphs.** Copying from a PDF gives a newline
  at every *visual* line ending, so block-per-line rendering turns one paragraph into eight.
  `reflowPastedText` rejoins them, keying on width rather than punctuation: hard wrapping pushes
  every line to the same length except a paragraph's last, so a short line that also closes a
  sentence is the real break. It bails out entirely unless the text looks hard-wrapped — typed
  text, lists and clean prose must come back untouched, and the tests pin that in both directions.
- **Follow the matched WORD's visual line, not its paragraph** — targeting the block froze the text
  inside multi-sentence paragraphs. `PromptText wordIndices` wraps words in `<span data-w={i}>`.
- **Motion is velocity-limited SmoothDamp** (gentle, capped speed, no snaps). Tunables: `maxFollowSpeed`,
  `followSmoothTime` in `SmoothFollowEngine`.
- **Commands use a GRAMMAR recognizer, not open speech.** A second `KaldiRecognizer` runs on the
  same loaded model, constrained to the command phrases (`smartfollow/voiceCommands.commandGrammarFor`).
  Open-vocabulary recognition of a short command is unreliable in Polish: asked to find "klik góra"
  among ~280k words it returns *"jeśli góra"*, or nothing — which is why four different wake words
  all failed before this. The grammar chooses between three phrases and `[unk]`, and gets it right.
  `[unk]` is **mandatory**: without it every utterance is force-fit to the nearest phrase and
  reading the script aloud fires commands continuously. Never mix languages in one grammar — every
  word must be in the loaded model's lexicon. `verify-grammar.mjs` pins all of this.
- **Speech engine = Vosk on-device**, NOT the browser Web Speech API (Safari's is broken for continuous
  use). No SharedArrayBuffer / cross-origin isolation needed.
- **Take the mic BEFORE loading the model, never after.** `useVosk.start()` runs `startMic()` →
  `load()` → `startRecognition()`, and `startMic` deliberately needs no model. On a hosted build
  the model is a 40–50MB download; awaiting it first strands `getUserMedia` and the `AudioContext`
  resume tens of seconds outside the user gesture, which Safari ties them to — the prompt never
  appears, or it does and the context stays suspended so nothing is ever heard. On localhost the
  download is instant, so this only ever breaks in production. Pinned by `useVosk.test.ts`
  ("start order") and `verify-mic-order.mjs`. `start()`'s catch must also `stop()` — the mic can
  already be live when the download fails.
- **Models are gitignored** (`public/models/`, ~40–50MB each). Run `scripts/fetch-models.sh` after clone.
  **Hosting builds from a clean clone, so they must fetch them too** — that is why `vercel-build`
  is `fetch-models.sh && build && verify-models.mjs`, and why `vercel.json` points the build
  command at it. Without the fetch the model 404s, `load()` throws *before* `startMic()`, and the
  browser never even asks for the mic — Smart Follow looks dead with no permission prompt.
  `verify-models.mjs` fails the build rather than shipping that silently.
- **`vosk-browser` is dynamically imported** in `stt/voskEngine.ts`. Its `dist/vosk.js` is 5.8MB; a
  static import puts it in the entry chunk, past workbox's 2MB precache limit, and the PWA build
  fails outright. It is pinned to a `vosk-engine-*` chunk (`build.rollupOptions.output.manualChunks`)
  because the workbox `globIgnores`/`runtimeCaching` rules match it by filename — rename one, rename
  both. The engine is runtime-cached on first use, not precached; the **models are still not cached
  at all**, so Smart Follow is not yet offline.
- **A press on the Prompt Mode chrome is the chrome's alone.** The controls and the top bar sit
  *inside* the viewport, so every press on a button also reaches the viewport's pointer handlers,
  which read it as a tap on the script. That tap lands on no `[data-prompter-line]`, which is the
  "tapped empty space" case — so pressing Play hid the whole interface, and hiding it puts
  `pointer-events-none` on the button *before* the browser dispatches `click`, swallowing the
  press entirely. Play looked dead unless the finger drifted the 6px that makes it a drag instead.
  Both chrome roots carry `data-prompt-chrome` and `onPointerDown`/`onPointerUp` early-return on
  it — guard both ends, or a second finger already dragging leaves `drag.active` true and the
  pointerup still hides. `verify-tap-controls.mjs` pins it, with **touchscreen taps**: a mouse
  click does not reproduce the swallowed click.
- **Framer owns `transform`; so does the scroll engine — never both on one element.** No `motion.*`
  may touch `contentRef`, the `[data-w]` word spans, or `FocusZone` (a static gradient *precisely* to
  avoid per-frame work). Prompt Mode is entered by an early `return` in `App.tsx` placed *before*
  `AnimatePresence`, so switching to it unmounts the animated subtree wholesale — that is what keeps
  the enter/exit a hard cut, and what keeps the mic and wake lock tied to `PromptScreen`'s unmount.
- **Framer animates in JS and ignores the `prefers-reduced-motion` CSS rule in `index.css`.**
  `<MotionConfig reducedMotion="user">` wrapping the whole tree in `App.tsx` is what guards it —
  it must stay above the Prompt Mode branch, not below it, or the guard misses the one screen
  where the invariant matters. The invariant it protects —
  the teleprompter still scrolls with the OS setting on — is asserted by `verify-motion.mjs`.
- **The theme cross-fade rule in `index.css` must stay inside `@layer base`.** `transition-property`
  is replaced, not merged, so unlayered it wipes out every Tailwind transition utility in the app
  (Prompt Mode's auto-hiding chrome stops fading). Specificity does not save it — unlayered beats
  layered, and `@import 'tailwindcss'` puts utilities in `@layer utilities`.
- **The segmented pill is a *raised* tile, not an accent fill** (same reasoning as EditorToolbar's
  pressed state). An inverting pill has no label colour that stays readable while it travels; a
  raised one needs no timing at all. Do not "fix" it back to `bg-accent`.
- TDD for pure logic (model, engine, matcher, tokenizer, positionMap). UI verified by driving the app
  with Playwright (see `.claude/skills/verify/SKILL.md`).
- Tablet-first; dark default + light theme; teleprompter scroll must NOT be disabled by
  `prefers-reduced-motion`.

## Commands

```bash
npm install
bash scripts/fetch-models.sh   # download Vosk PL/EN models to public/models (once)
npm run dev                    # dev server (Smart Follow POC at /#lab)
npm run build                  # typecheck + production build + PWA
npm test                       # unit tests
npm run typecheck

# Verification drivers (Playwright; dev server on :5173):
node scripts/verify.mjs         # Phase 1 full flow
node scripts/verify-follow.mjs  # gentle line-by-line follow
node scripts/verify-paragraph.mjs # follow advances within a paragraph
node scripts/verify-vosk.mjs    # Vosk loads + recognizes (uses public/test-*.wav from `say`)
node scripts/verify-bundle.mjs  # builds, then guards chunk shape + PWA precache (no server needed)
node scripts/verify-models.mjs  # guards that dist/ actually contains the Vosk models (run after a build)
node scripts/verify-mic-order.mjs # mic is taken before the model downloads (fake capture device)
node scripts/verify-paste.mjs   # a PDF paste lands as the paragraphs the PDF actually had
node scripts/verify-preset-size.mjs # presets fill the screen; lineHeightPx matches what renders
node scripts/verify-voice-commands.mjs # "Klik góra" / "Click up" move the script (no mic needed)
node scripts/verify-tap-controls.mjs # a tap on Play plays, and leaves the chrome up (touch input)
node scripts/verify-grammar.mjs # the grammar recognizer hears "klik góra" where open speech cannot
```

**Debugging what the recognizer actually heard:** open the app with `?debug=stt` and enter
Prompt Mode — a readout in the corner lists each recognized window, newest first: `G` lines come
from the grammar recognizer, `·` from open speech, green where a command matched. The models have
a closed lexicon, so a wake word outside it can never be returned however clearly it is spoken;
this is the only way to see what comes back instead.

## Roadmap / next

PRD Phase 3's last item: **PAUSE behaviour** for Smart Follow (see the gotcha above). Then Phase 4
device optimization on a real installed PWA. Still open: caching the 40–50MB models for true offline
Smart Follow, VAD gate, latency tuning, more languages.
See `docs`/PRD §63–74 and the memory notes for history.
