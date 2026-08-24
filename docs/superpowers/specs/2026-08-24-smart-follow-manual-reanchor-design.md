# Smart Follow — Manual Re-anchor

Design spec · 2026-08-24 · branch `smart-follow-recovery`

## The problem

A presenter is reading with Smart Follow on. Mid-sentence they fumble a line. By the time
they want to redo it, their own speech has already scrolled the text past it. They want to
pull the script back to that line and take it again — without restarting the session.

Today they cannot. Three defects block it, and the first is fatal.

### 1. The engine fights the finger

`SmoothFollowEngine.tick()` honours the `scrubbing` flag only in `auto` mode. The `follow`
branch ignores it:

```js
if (this.mode === 'follow') {
  this.position = this.smoothDampFollow(this.position, this.targetPosition, dt)
  this.position = clamp(this.position, 0, this.maxPosition)
  return                      // no scrubbing check
}
```

`scrubBy()` writes `position` on pointer-move; the next animation frame pulls it straight
back toward `targetPosition`. The drag is undone ~60×/second, so the text cannot be moved
by hand at all while Smart Follow runs.

This directly violates PRD §37: *"AI nigdy nie powinno walczyć ze scrollowaniem wykonywanym
przez użytkownika."*

`glideTo()` (tap-to-jump, Restart) has the same end state — `gliding` is checked before
`mode`, so the glide plays out and then follow mode snaps the text back to its stale target.

### 2. Manual moves never reach the matcher

`indexRef` in `useSmartFollow` is the matcher's belief about where the presenter is. Nothing
outside `onWords` ever writes it. So even with defect 1 fixed, the next recognized words
would match near the *old* index and drag the text forward again.

PRD §37 requires the opposite: after a manual move the system re-establishes position and
resumes following from there.

### 3. Stale backward-deadband memory

`lastTargetRef` (`applyBackwardDeadband`) still holds the pre-drag, far-forward target. After
a manual move it is meaningless and can only mislead.

## Scenario this spec serves

> Presenter stumbles → text has already scrolled past the line → presenter drags the script
> back to that line with a finger → releases → speaks the line again → Smart Follow carries
> on from there.

## Decisions

Settled during brainstorming; recorded here so the plan does not relitigate them.

| Question | Decision | Why |
| --- | --- | --- |
| Voice or hand? | **Hand.** Presenter physically moves the text. | Predictable; he decides, the app obeys. No false backward jumps from repeated phrases. |
| Which gesture? | **Swipe / drag**, not tap. | Cannot misfire, so no stray-touch guard is needed. Already built mechanically. Natural for the short distances this scenario involves. |
| When does voice resume? | **Immediately on release.** | Chosen for responsiveness over caution. |
| Guarding the "immediately" choice | **Local-only matching for a short window after re-anchor.** | He is likely still talking ("sorry, let me take that again"). Keeps the instant response but stops a stray phrase teleporting him across the script. |
| How is position recovered? | **Read it off the screen** at the Focus Zone anchor. | WYSIWYG — the line under the marker is the line he chose. Reuses existing geometry. No new state to invalidate. |

### Rejected alternatives

- **Scroll-offset → word index map.** Precompute every word's offset, binary-search it.
  Pure and DOM-free, but needs rebuilding on resize, rotation, preset and font-size change —
  real invalidation surface for no gain, since the target word is by definition on screen.
- **Let voice re-find the place globally after a manual move.** Contradicts the decision
  above: a global search could land him somewhere he did not choose.
- **Require an explicit Play tap to resume.** Breaks the one-interaction rule of PRD §36.

## Non-goals

- Voice-driven backtracking beyond what the matcher already does (PRD §33).
- Section/chapter navigation or any non-linear jumping (PRD §34 territory).
- Tap-to-jump becoming a live one-tap gesture during reading — deliberately left two-step.
- Fixing `start()` hard-resetting `indexRef` to 0, so pause/resume loses your place
  (`useSmartFollow.ts:99`). Real bug, different scenario. Logged, not fixed here.
- Any new on-screen control, button, or status string. PRD §38 keeps status subtle; the text
  visibly moving under the presenter's finger is the feedback.

## Design

Four small, independently testable changes plus one wiring change.

### `engine/SmoothFollowEngine.ts` — stop fighting the finger

Follow mode gains a scrubbing guard:

```js
if (this.mode === 'follow') {
  if (this.scrubbing) { this.velocity = 0; return }   // the finger owns the position
  ...
}
```

`setScrubbing(false)` adopts the current position as the target when in follow mode, and
zeroes velocity. Without this the engine would glide forward to its stale target the instant
the finger lifts.

Putting the adopt inside `setScrubbing` rather than in a separate method is deliberate: a
caller that forgets to call the extra method reintroduces exactly the class of bug being
fixed here. The invariant is "after a manual move, the target is what the user chose", and it
belongs with the state change that ends the manual move.

Also expose a `scrubbing` getter so the Smart Follow loop can tell when a drag is in progress.

### `smartfollow/positionMap.ts` — which word is at the marker

```ts
export function wordIndexAtAnchor(
  viewportEl: Element | null | undefined,
  anchor?: number,
): number | null
```

Probes the horizontal centre of `[data-prompter-column]` at `anchor` (default `FOCUS_ANCHOR`,
0.4) of the viewport height and resolves a token index, in order:

1. `elementFromPoint` → `closest('[data-w]')` → its index.
2. Otherwise `closest('[data-prompter-line]')` → that line's first `[data-w]`.
3. Otherwise the `[data-prompter-line]` whose rect is nearest the anchor Y → its first
   `[data-w]`. Covers landing on a PAUSE block or inter-block margin.
4. Otherwise `null` — caller holds its current index.

Mirror needs no special handling: `elementFromPoint` works in visual coordinates and mirrored
text still occupies the same place on screen.

The nearest-line arithmetic is extracted as a pure helper taking measured tops/bottoms, so
step 3 is unit-testable without a DOM.

### `smartfollow/matcher.ts` — a local-only mode

`MatchOptions` gains `localOnly?: boolean`. When set, the global widening is skipped:

```js
if (!options.localOnly && best.score < minConfidence) best = consider(0, tokens.length - 1, best)
```

Everything else — local window, confidence floor, false-jump resistance — is unchanged.
Default is `false`, so existing behaviour and existing tests are untouched.

### `smartfollow/useSmartFollow.ts` — re-anchor

New method on `SmartFollowController`:

```ts
reanchorTo: (index: number) => void
```

It sets `indexRef.current`, clears `lastTargetRef` to `null` (so the first post-drag move
passes the deadband freely), stamps `localOnlyUntilRef = now + LOCAL_ONLY_MS`, and sets
status to `following`.

`onWords` gains two behaviours:

- **Ignore words while the engine is scrubbing.** A drag in progress owns the position; speech
  heard during it must not queue a target.
- **Pass `localOnly`** while `now < localOnlyUntilRef.current`.

`LOCAL_ONLY_MS = 2000`, module-level constant. Chosen as roughly the length of an apology;
tunable in one place.

### `screens/PromptScreen.tsx` — wiring

`onPointerUp` already distinguishes a tap (`moved < 6`) from a drag. On a real drag, when
Smart Follow is active and listening, re-anchor:

```js
engine.setScrubbing(false)
if (!wasTap) {
  if (usingSFRef.current && sfRef.current.listening) {
    const i = wordIndexAtAnchor(viewportRef.current)
    if (i != null) sfRef.current.reanchorTo(i)
  }
  return
}
```

Order matters: `setScrubbing(false)` adopts the position as target first, so nothing moves
while the index is being resolved.

No change to tap handling, controls, chrome, or status.

## Data flow

```
finger down  → engine.setScrubbing(true)   → follow tick returns early, position frozen
finger moves → engine.scrubBy(-dy)          → position follows the finger exactly
                (speech during the drag is ignored by onWords)
finger up    → engine.setScrubbing(false)   → targetPosition := position, velocity := 0
             → wordIndexAtAnchor(viewport)  → token index under the Focus Zone
             → sf.reanchorTo(index)         → indexRef := index
                                              lastTargetRef := null
                                              localOnly window opens (2s)
he speaks    → matchPosition(..., localOnly) → matches near the chosen spot only
             → wordProgressTarget → engine.setTargetPosition → gentle glide resumes
```

## Edge cases

- **Anchor lands on a PAUSE block or a margin** — nearest-line fallback (step 3).
- **Empty script / no `[data-w]` spans** — `wordIndexAtAnchor` returns `null`, no re-anchor,
  position unchanged. `[data-w]` spans only exist when `wordIndices` is on, i.e. exactly when
  Smart Follow is active.
- **Drag while Smart Follow is off** — untouched. Auto mode already honours `scrubbing`.
- **Drag while paused / not listening** — position moves, no re-anchor. `start()` still resets
  to 0 (out of scope, see non-goals).
- **Drag to the very top or bottom** — `scrubBy` already clamps to `[0, maxPosition]`.
- **Re-anchor to a spot he never reaches** — his next words simply match locally; if nothing
  matches, confidence stays low and the text holds. PRD §35: silence is not a lost position.
- **Mirror on** — `wordProgressTarget` already flips the reading fraction; the anchor probe is
  in visual coordinates and needs no flip.

## Testing

TDD throughout. The engine defect is reproduced as a failing test before it is fixed.

**Unit — `SmoothFollowEngine`**
- follow mode + scrubbing: `tick()` leaves position unchanged (this is the red test for
  defect 1, and it fails against today's code).
- `scrubBy` during a follow-mode scrub moves position and it survives the next `tick`.
- `setScrubbing(false)` in follow mode sets target to the current position and zeroes
  velocity; a following `tick` produces no motion.
- auto mode behaviour unchanged.

**Unit — `positionMap`**
- the pure nearest-line helper picks the correct line for anchors above, inside, between and
  below lines.

**Unit — `matcher`**
- `localOnly: true` keeps the position when the true match is outside the local window and the
  local best is below the confidence floor.
- `localOnly: false` (default) still finds it globally — existing tests must stay green.

**Unit — `useSmartFollow`** (via `feed()`, no mic)
- `reanchorTo(i)` then `feed()` with words from near `i` targets near `i`, not the old spot.
- words fed while the engine is scrubbing set no target.
- after `LOCAL_ONLY_MS`, global matching is available again.

**Browser — `scripts/verify-reanchor.mjs`** (Playwright, per `.claude/skills/verify`)
Seeds a script, enters Prompt Mode with Smart Follow on, drives `feed()` to advance a few
paragraphs, drags the text back, and asserts:
1. the transform still reflects the drag ~500ms after release — the engine did not fight it;
2. feeding words from the re-anchored line eases the text from there, not from the old spot;
3. feeding an unrelated phrase during the local-only window does not jump the document.

## Acceptance criteria

1. With Smart Follow running, dragging the script moves it and it stays where it is put.
2. After release, speaking the line at the Focus Zone resumes gentle following from there.
3. An unrelated phrase spoken in the ~2s after release does not move the text off that spot.
4. No new controls, buttons, or status strings.
5. `npm test`, `npm run typecheck` and `npm run build` all pass; existing matcher, engine and
   positionMap tests stay green.

## Addenda (post-review, before planning)

Three findings from checking the spec against the toolchain.

**jsdom cannot test geometry.** Verified by probe: `document.elementFromPoint` is undefined and
every `getBoundingClientRect()` returns zeros. So `wordIndexAtAnchor` is DOM glue that Vitest
cannot meaningfully exercise — exactly the status `wordProgressTarget` already has (untested in
`positionMap.test.ts`, which covers only the pure numeric functions). The plan therefore splits
it: a pure `pickIndexNearestAnchor(candidates, anchorY)` unit-tested in Vitest, and the DOM glue
verified only in Playwright. No change to the design, but it fixes where the tests live.

**Tap-to-jump must re-anchor too.** Non-goals rule out making tap a *live one-tap* gesture, but
tap-to-jump is still reachable mid-session (controls visible → tap a line) and suffers the same
defect: `glideTo` plays out, then follow mode snaps the text back to its stale target. Shipping
the drag fix while leaving its sibling broken is worse than fixing both. `jumpToLineAt` will
return the line it moved to and re-anchor to that line's first word — no glide-completion race,
since the destination line is known up front. Roughly three lines, reusing the same helper.

**A DEV-only seam is needed to verify in the browser.** Prompt Mode has no way to drive Smart
Follow without a live mic and a 50MB gitignored model, and `feed()` is only reachable from the
`#lab` harness — but the wiring under test lives in `PromptScreen`. So `PromptScreen` exposes
`window.__prompter = { feed, reanchor, followMode, position }` behind `import.meta.env.DEV`,
stripped from production builds. Follows the existing `data-testid` convention in
`SmartFollowLabScreen`.

**`useSmartFollow` is unit-testable after all.** `useVosk` only touches WASM and the microphone
inside `start()`; mounting the hook does nothing. So `renderHook` plus a mocked `./matcher` can
assert the contract directly — that `reanchorTo` changes the index handed to the matcher and
opens the `localOnly` window — without a mic or a model.

## Addenda 2 (post-plan review)

**`restart()` has the same snap-back defect — now in scope.** `sf.stop()` only stops Vosk and
sets status `idle`; it never leaves follow mode, so `targetPosition` still points at wherever
the presenter was. `gliding` is checked before `mode` in `tick()`, so the glide reaches the top,
`gliding` clears, and the next tick smooth-damps back *down* toward the stale target at up to
320px/s. Press Restart, watch the text reach the top, then slide away. Same argument as
tap-to-jump: `engine.setTargetPosition(0)` plus `reanchorTo(0)`, folded into the wiring task.

**Re-anchor is guarded on Smart Follow being enabled, not on `listening`.** `listening` only
goes true after Vosk's `startMic()` resolves, which the browser driver cannot do — no
microphone, and the model is gitignored. Gating on it would let `verify-reanchor.mjs` bypass
the entire path and still report green, which is worse than no driver at all. Re-anchoring
while not listening is harmless: `start()` resets the index regardless, and `sfStatusLabel`
tests `!sf.listening` before status, so `following` cannot leak onto the screen.

**The anchor probe checks three heights, not one.** Text blocks carry `my-[0.45em]` margins, so
the anchor landing in an inter-block gap is routine. A gap hit would otherwise fall through to
the nearest-*paragraph* fallback and return that paragraph's first word — potentially 40+ words
behind the presenter, right at the edge of the forward window, during the two seconds when
matching is local-only. Probing ±½ line height converts most gap hits into real word hits and
leaves the coarse fallback for what it is meant for: PAUSE blocks.

**Known behaviour change, accepted.** `onPointerDown` calls `setScrubbing(true)` for every
touch, taps included. With the adopt-on-release rule, any tap now cancels in-flight follow
motion (target becomes the current position) and drops a partial arriving mid-gesture. The next
Vosk partial re-targets within a few hundred milliseconds. This is consistent with "manual
interaction always wins" (PRD §37), and is recorded here so it is not mistaken for a defect.
