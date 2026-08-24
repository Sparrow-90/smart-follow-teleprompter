# Smart Follow Manual Re-anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a presenter drag the script back to a line they fumbled, release, and have Smart Follow carry on from there.

**Architecture:** Five small changes. The engine stops overwriting position while a finger is down and adopts whatever position the user chose when it lifts. A new geometry helper reports which word sits at the Focus Zone. `useSmartFollow` gains `reanchorTo(index)`, which moves the matcher's belief to that word and briefly restricts matching to the local neighbourhood so an apology cannot teleport the document. `PromptScreen` wires the two together on pointer-up.

**Tech Stack:** React 18 · TypeScript · Vite 6 · Vitest 3 (jsdom) · Playwright · Zustand

**Spec:** `docs/superpowers/specs/2026-08-24-smart-follow-manual-reanchor-design.md` — read it first; it carries the diagnosis and the decisions this plan assumes.

## Global Constraints

- **No new UI.** No buttons, controls, or status strings. PRD §38 keeps status subtle.
- **Never fight the user's scroll** (PRD §37). Manual interaction always wins.
- **TDD.** Every task writes the failing test first and runs it to see it fail before implementing.
- **jsdom has no geometry.** `document.elementFromPoint` is undefined and `getBoundingClientRect()` returns all zeros. Never assert on rects or hit-testing in Vitest — that belongs in Playwright.
- **Existing tests stay green.** `src/engine/SmoothFollowEngine.test.ts`, `src/smartfollow/matcher.test.ts`, `src/smartfollow/positionMap.test.ts`, `src/smartfollow/tokenizeScript.test.ts`, `src/model/document.test.ts`. `src/components/editor/EditorToolbar.test.tsx` IS on this branch again (the editor-header work was fast-forwarded into `main` on 2026-08-24 and this branch rebased onto it). **Current total after Task 4: 101 tests across 7 files.** An earlier revision of this line said 81 across 5 — that was true only between the two rebases. Trust a fresh `npm test`, not a remembered number.
- **`LOCAL_ONLY_MS = 2000`** — one module-level constant in `useSmartFollow.ts`, nowhere else.
- **Focus Zone anchor is 0.4** — already `FOCUS_ANCHOR` in `positionMap.ts`. Do not redefine it.
- Commands: `npm test` (all), `npx vitest run <path>` (one file), `npm run typecheck`, `npm run build`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/engine/SmoothFollowEngine.ts` | Modify — freeze position during a scrub in follow mode; adopt it as target on release; expose `scrubbing`. | 1 |
| `src/engine/SmoothFollowEngine.test.ts` | Modify — add a `manual override in follow mode` describe block. | 1 |
| `src/smartfollow/matcher.ts` | Modify — `localOnly` option suppressing the global widening. | 2 |
| `src/smartfollow/matcher.test.ts` | Modify — add a `localOnly` describe block. | 2 |
| `src/smartfollow/positionMap.ts` | Modify — add `pickIndexNearestAnchor` (pure), `firstWordIndexIn`, `wordIndexAtAnchor` (DOM glue). | 3 |
| `src/smartfollow/positionMap.test.ts` | Modify — cover the pure picker only. | 3 |
| `src/smartfollow/useSmartFollow.ts` | Modify — `reanchorTo`, scrub guard, local-only window. | 4 |
| `src/smartfollow/useSmartFollow.test.ts` | Create — contract tests with a mocked matcher and Vosk. | 4 |
| `src/screens/PromptScreen.tsx` | Modify — re-anchor on drag release and on tap-to-jump; DEV-only `window.__prompter` seam. | 5 |
| `scripts/verify-reanchor.mjs` | Create — Playwright driver proving the real behaviour in a browser. | 6 |

---

### Task 1: Engine stops fighting the finger

The fatal defect. `tick()` honours `scrubbing` only in `auto` mode, so in `follow` mode every frame drags position back toward a stale `targetPosition`.

**Files:**
- Modify: `src/engine/SmoothFollowEngine.ts` (private field at `:34`, `setScrubbing` at `:75`, `currentTargetVelocity` at `:104`, `tick` follow branch at `:150`, auto branch at `:161`)
- Test: `src/engine/SmoothFollowEngine.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `engine.scrubbing: boolean` (getter) — read by Task 4. `setScrubbing(false)` in follow mode now sets `targetPosition = position` and `velocity = 0` — relied on by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/SmoothFollowEngine.test.ts`. The file already defines `FRAME` and `run(engine, seconds)` at the top — reuse them, do not redefine.

```ts
describe('SmoothFollowEngine — manual override in follow mode (PRD §37)', () => {
  /** An engine mid-Smart-Follow: following a target 2000px down a long script. */
  const following = () => {
    const e = new SmoothFollowEngine()
    e.setContentMetrics(5000, 800)
    e.setMode('follow')
    e.setPosition(2000)
    e.setTargetPosition(2000)
    return e
  }

  it('holds the position the finger put it at, instead of gliding back to the target', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300) // the presenter pulls the script back to a fumbled line
    const chosen = e.position
    expect(chosen).toBe(1700)
    run(e, 1) // a full second of animation frames while the finger is still down
    expect(e.position).toBe(chosen)
  })

  it('adopts the chosen position as the new target when the finger lifts', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300)
    e.setScrubbing(false)
    const chosen = e.position
    run(e, 1)
    expect(e.position).toBe(chosen)
    expect(e.velocity).toBe(0)
  })

  it('reports whether a scrub is in progress', () => {
    const e = following()
    expect(e.scrubbing).toBe(false)
    e.setScrubbing(true)
    expect(e.scrubbing).toBe(true)
    e.setScrubbing(false)
    expect(e.scrubbing).toBe(false)
  })

  it('still follows a new target once the scrub has ended', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300)
    e.setScrubbing(false)
    e.setTargetPosition(e.position + 200) // he starts reading again
    run(e, 3)
    expect(e.position).toBeCloseTo(1900, 0)
  })

  it('leaves auto mode behaviour untouched', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    e.setContentMetrics(5000, 800)
    e.play()
    run(e, 1)
    const moved = e.position
    expect(moved).toBeGreaterThan(0)
    e.setScrubbing(true)
    run(e, 1)
    expect(e.position).toBe(moved) // auto mode already froze during a scrub
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/SmoothFollowEngine.test.ts`

Expected: FAIL. The first test fails with something like `expected 1700 to be 1998.x` — proof the engine dragged the position back toward its target while the finger was down. The `scrubbing` getter tests fail to compile (`Property 'scrubbing' does not exist`).

- [ ] **Step 3: Rename the private field so the getter can take its name**

In `src/engine/SmoothFollowEngine.ts`, rename the private field `scrubbing` to `scrubbingFlag` (matching the existing `playingFlag` convention) and update **both** existing readers:

```ts
  private scrubbingFlag = false
```

```ts
  private currentTargetVelocity(): number {
    return this.playingFlag && !this.scrubbingFlag ? this.baseSpeed * this.speedMultiplier : 0
  }
```

```ts
    if (!this.scrubbingFlag) {
      this.position += this.velocity * dt
    }
```

- [ ] **Step 4: Add the getter and make `setScrubbing` adopt the chosen position**

Replace the existing `setScrubbing` method:

```ts
  get scrubbing(): boolean {
    return this.scrubbingFlag
  }

  /**
   * Begin/end a manual drag. Ending one in follow mode adopts the position the user chose as
   * the new target: without this the engine would glide straight back to its stale pre-drag
   * target the instant the finger lifts. It lives here rather than in a separate method the
   * caller must remember, because forgetting that call is exactly the bug this fixes.
   */
  setScrubbing(on: boolean): void {
    if (!on && this.scrubbingFlag && this.mode === 'follow') {
      this.targetPosition = this.position
      this.velocity = 0
    }
    this.scrubbingFlag = on
  }
```

- [ ] **Step 5: Freeze the follow branch while the finger is down**

In `tick()`, the follow branch becomes:

```ts
    if (this.mode === 'follow') {
      // The finger owns the position while it is down — the AI must never fight a manual
      // scroll (PRD §37). scrubBy() is the only thing that may move it until release.
      if (this.scrubbingFlag) {
        this.velocity = 0
        return
      }
      this.position = this.smoothDampFollow(this.position, this.targetPosition, dt)
      this.position = clamp(this.position, 0, this.maxPosition)
      return
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine/SmoothFollowEngine.test.ts`
Expected: PASS, all tests in the file including the pre-existing ones.

- [ ] **Step 7: Commit**

```bash
git add src/engine/SmoothFollowEngine.ts src/engine/SmoothFollowEngine.test.ts
git commit -m "Engine: stop fighting the finger in follow mode

tick() honoured `scrubbing` only in auto mode, so a drag during Smart
Follow was undone on the next animation frame. Freeze the position while
the finger is down and adopt whatever the user chose as the target when
it lifts (PRD §37)."
```

---

### Task 2: Matcher gains a local-only mode

After a manual re-anchor the presenter is often still apologising. Local-only matching keeps the instant response the user asked for while stopping a stray phrase from teleporting the document.

**Files:**
- Modify: `src/smartfollow/matcher.ts` (`MatchOptions` at `:13-22`, the widening at `:76`)
- Test: `src/smartfollow/matcher.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MatchOptions.localOnly?: boolean` (default `false`) — passed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/smartfollow/matcher.test.ts`. The file already defines `toks(text)` at the top — reuse it.

```ts
describe('matchPosition — localOnly (manual re-anchor guard)', () => {
  // The distinctive phrase sits ~70 words past the current position, far outside the
  // forward window of 40, so only a global widening can reach it.
  const t = toks(
    'alpha beta gamma delta epsilon ' +
      Array.from({ length: 70 }, (_, i) => `filler${i}`).join(' ') +
      ' zeppelin kalejdoskop sygnalizacja',
  )

  it('reaches a distant phrase by default (global widening)', () => {
    const r = matchPosition(t, 0, ['zeppelin', 'kalejdoskop', 'sygnalizacja'])
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('sygnalizacja')
  })

  it('holds position when localOnly is set and the phrase is out of local range', () => {
    const r = matchPosition(t, 0, ['zeppelin', 'kalejdoskop', 'sygnalizacja'], { localOnly: true })
    expect(r.moved).toBe(false)
    expect(r.index).toBe(0)
  })

  it('still tracks normally inside the local window when localOnly is set', () => {
    const r = matchPosition(t, 0, ['beta', 'gamma', 'delta'], { localOnly: true })
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('delta')
    expect(r.confidence).toBeGreaterThan(0.75)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/smartfollow/matcher.test.ts`
Expected: FAIL on the second test — `expected true to be false` — because the widening runs regardless. TypeScript also rejects `{ localOnly: true }` as not assignable to `MatchOptions`.

- [ ] **Step 3: Add the option**

In `src/smartfollow/matcher.ts`, add to `MatchOptions`:

```ts
  /**
   * Restrict the search to the local window and never widen to the whole script. Set for a
   * short spell after a manual re-anchor so speech the presenter is still finishing ("sorry,
   * let me take that again") cannot jump them to a false match elsewhere in the document.
   */
  localOnly?: boolean
```

- [ ] **Step 4: Suppress the widening**

Change the widening line so it reads:

```ts
  // Only widen the search to the whole script when the local window is unconvincing (§32) —
  // and never right after a manual re-anchor, where the user has already told us where they are.
  if (!options.localOnly && best.score < minConfidence) best = consider(0, tokens.length - 1, best)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/smartfollow/matcher.test.ts`
Expected: PASS, including every pre-existing matcher test (default behaviour is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/smartfollow/matcher.ts src/smartfollow/matcher.test.ts
git commit -m "Matcher: add localOnly to suppress global widening

Used for a short window after a manual re-anchor so an apology cannot
teleport the presenter across the script."
```

---

### Task 3: Report which word sits at the Focus Zone

**Files:**
- Modify: `src/smartfollow/positionMap.ts` (append; `FOCUS_ANCHOR` already exists at `:5`)
- Test: `src/smartfollow/positionMap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface AnchorCandidate { index: number; top: number; bottom: number }`
  - `pickIndexNearestAnchor(candidates: AnchorCandidate[], anchorY: number): number | null`
  - `firstWordIndexIn(lineEl: Element): number | null`
  - `wordIndexAtAnchor(viewportEl: Element | null | undefined, anchor?: number, lineHeightPx?: number): number | null` — called by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `src/smartfollow/positionMap.test.ts`. Only the pure picker is tested — `wordIndexAtAnchor` needs real geometry and is covered by Task 6's Playwright driver. Update the existing import line at the top of the file to include the new symbol:

```ts
import {
  scrollTargetForLine,
  interpolatedLineTop,
  applyBackwardDeadband,
  pickIndexNearestAnchor,
} from './positionMap'
```

```ts
describe('pickIndexNearestAnchor', () => {
  // Three lines stacked down the screen, each 60px tall with a 20px gap.
  const lines = [
    { index: 0, top: 100, bottom: 160 },
    { index: 10, top: 180, bottom: 240 },
    { index: 20, top: 260, bottom: 320 },
  ]

  it('picks the line containing the anchor', () => {
    expect(pickIndexNearestAnchor(lines, 200)).toBe(10)
  })

  it('picks the nearest line when the anchor falls in a gap', () => {
    expect(pickIndexNearestAnchor(lines, 255)).toBe(20) // 15px below line 10, 5px above line 20
    expect(pickIndexNearestAnchor(lines, 245)).toBe(10) // 5px below line 10, 15px above line 20
  })

  it('breaks an exact tie in favour of the earlier line', () => {
    expect(pickIndexNearestAnchor(lines, 250)).toBe(10) // 10px from both — the earlier one wins
  })

  it('picks the first line when the anchor is above everything', () => {
    expect(pickIndexNearestAnchor(lines, 0)).toBe(0)
  })

  it('picks the last line when the anchor is below everything', () => {
    expect(pickIndexNearestAnchor(lines, 9999)).toBe(20)
  })

  it('returns null when there are no candidates', () => {
    expect(pickIndexNearestAnchor([], 200)).toBe(null)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/smartfollow/positionMap.test.ts`
Expected: FAIL — `pickIndexNearestAnchor is not a function` / TypeScript reports it is not exported.

- [ ] **Step 3: Implement the pure picker**

Append to `src/smartfollow/positionMap.ts`:

```ts
/** A line (or word) measured against the viewport, tagged with the token index it starts at. */
export interface AnchorCandidate {
  index: number
  top: number
  bottom: number
}

/**
 * Pick the candidate whose vertical band is nearest `anchorY` — zero distance if it contains
 * it. Ties go to the earlier candidate in the list, i.e. the earlier line in the script.
 */
export function pickIndexNearestAnchor(
  candidates: AnchorCandidate[],
  anchorY: number,
): number | null {
  let bestIndex: number | null = null
  let bestDistance = Infinity
  for (const c of candidates) {
    const distance = anchorY < c.top ? c.top - anchorY : anchorY > c.bottom ? anchorY - c.bottom : 0
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = c.index
    }
  }
  return bestIndex
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/smartfollow/positionMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the DOM glue**

Append to `src/smartfollow/positionMap.ts`. This is deliberately untested in Vitest — jsdom has no `elementFromPoint` and returns zeroed rects. Task 6 proves it in a real browser.

```ts
/** The token index of the first indexed word inside a rendered line, or null if it has none. */
export function firstWordIndexIn(lineEl: Element): number | null {
  const word = lineEl.querySelector('[data-w]')
  if (!word) return null
  const index = Number(word.getAttribute('data-w'))
  return Number.isFinite(index) ? index : null
}

/**
 * Which script word is sitting at the Focus Zone right now — the inverse of
 * {@link wordProgressTarget}. Used after a manual drag to tell Smart Follow where the
 * presenter has just put themselves.
 *
 * Resolution order: the exact word under the anchor point, else the first word of the line
 * under it, else the first word of the nearest line by measurement (covers landing on a PAUSE
 * block or an inter-block margin). Returns null when the script has no indexed words, in which
 * case the caller keeps its current position.
 *
 * Mirroring needs no special case: hit-testing is in visual coordinates and mirrored text
 * occupies the same place on screen.
 */
export function wordIndexAtAnchor(
  viewportEl: Element | null | undefined,
  anchor: number = FOCUS_ANCHOR,
  lineHeightPx = 0,
): number | null {
  if (!viewportEl) return null
  const vp = viewportEl.getBoundingClientRect()
  const column = viewportEl.querySelector('[data-prompter-column]')
  const col = column?.getBoundingClientRect()
  const anchorY = vp.top + anchor * vp.height
  const x = col && col.width > 0 ? col.left + col.width / 2 : vp.left + vp.width / 2

  const canProbe =
    typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
  // Paragraphs carry my-[0.45em] margins, so the anchor landing in an inter-block gap is
  // routine. Probing half a line either side turns most of those misses into a real word hit,
  // which keeps the coarse nearest-paragraph fallback below for what it is actually for:
  // PAUSE blocks. Without this, a gap hit returns the *first* word of a long paragraph — up to
  // 40+ words behind the presenter, right at the edge of the forward window.
  const probes = lineHeightPx > 0 ? [0, -lineHeightPx / 2, lineHeightPx / 2] : [0]

  for (const dy of probes) {
    const hit = canProbe ? document.elementFromPoint(x, anchorY + dy) : null
    if (!hit) continue
    const word = hit.closest('[data-w]')
    if (word) {
      const index = Number(word.getAttribute('data-w'))
      if (Number.isFinite(index)) return index
    }
    const line = hit.closest('[data-prompter-line]')
    if (line) {
      const index = firstWordIndexIn(line)
      if (index != null) return index
    }
  }

  const candidates: AnchorCandidate[] = []
  for (const el of viewportEl.querySelectorAll('[data-prompter-line]')) {
    const index = firstWordIndexIn(el)
    if (index == null) continue
    const r = el.getBoundingClientRect()
    candidates.push({ index, top: r.top, bottom: r.bottom })
  }
  return pickIndexNearestAnchor(candidates, anchorY)
}
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/smartfollow/positionMap.ts src/smartfollow/positionMap.test.ts
git commit -m "positionMap: report the word at the Focus Zone

wordIndexAtAnchor is the inverse of wordProgressTarget — it says where
the presenter has put themselves after a manual drag. The nearest-line
arithmetic is split out as a pure, unit-tested picker; the hit-testing
glue is browser-verified, since jsdom has neither elementFromPoint nor
real rects."
```

---

### Task 4: `useSmartFollow` learns to re-anchor

**Files:**
- Modify: `src/smartfollow/useSmartFollow.ts` (`SmartFollowController` at `:22-33`, `onWords` at `:56-90`, return at `:110-117`)
- Create: `src/smartfollow/useSmartFollow.test.ts`

**Interfaces:**
- Consumes: `engine.scrubbing` (Task 1), `MatchOptions.localOnly` (Task 2).
- Produces: `SmartFollowController.reanchorTo(index: number): void` and `SmartFollowController.getIndex(): number` — both called by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `src/smartfollow/useSmartFollow.test.ts`. The matcher is mocked so the assertions are about the contract — which index and options the hook hands it — not about matching quality, which `matcher.test.ts` already covers. `useVosk` is mocked so no microphone or 50MB model is involved.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ScriptDoc } from '../model/document'
import { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import { useSmartFollow } from './useSmartFollow'

const { matchPositionMock } = vi.hoisted(() => ({ matchPositionMock: vi.fn() }))
vi.mock('./matcher', () => ({ matchPosition: matchPositionMock }))
vi.mock('./useVosk', () => ({
  useVosk: () => ({
    listening: false,
    loading: false,
    error: null,
    latencyMs: 0,
    start: () => {},
    stop: () => {},
  }),
}))

const doc: ScriptDoc = {
  blocks: [
    { type: 'text', runs: [{ text: 'alpha beta gamma delta epsilon zeta' }] },
    { type: 'text', runs: [{ text: 'eta theta iota kappa lambda mu' }] },
  ],
} as ScriptDoc

function mount(engine: SmoothFollowEngine) {
  const viewportRef = { current: document.createElement('div') }
  return renderHook(() =>
    useSmartFollow({ doc, engine, viewportRef, lang: 'pl', lineHeightPx: 60, mirror: false }),
  )
}

beforeEach(() => {
  matchPositionMock.mockReset()
  matchPositionMock.mockReturnValue({ index: 3, lineIndex: 0, confidence: 0.9, moved: true })
})
afterEach(() => vi.restoreAllMocks())

describe('useSmartFollow — reanchorTo', () => {
  it('hands the matcher the index the user chose, not the one it had', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.feed(['alpha', 'beta'])) // matcher moves it to 3
    act(() => result.current.reanchorTo(9)) // presenter drags back, lands on word 9
    // Assert here, before the next feed: onWords writes indexRef from the mock's return value,
    // so feeding again would overwrite 9 with 3 and this assertion would be meaningless.
    expect(result.current.getIndex()).toBe(9)
    act(() => result.current.feed(['eta', 'theta']))
    expect(matchPositionMock.mock.calls.at(-1)?.[1]).toBe(9)
  })

  it('restricts matching to the local window right after a re-anchor', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    act(() => result.current.feed(['sorry', 'let', 'me', 'take', 'that', 'again']))
    expect(matchPositionMock.mock.calls.at(-1)?.[3]).toMatchObject({ localOnly: true })
  })

  // Note: this spy shares a clock with React's scheduler. If this test ever turns flaky, that
  // is the cause — not the local-only logic. Swap it for an injected clock before suspecting
  // the implementation.
  it('returns to global matching once the local-only window has elapsed', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(0)
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    now.mockReturnValue(2500) // past LOCAL_ONLY_MS
    act(() => result.current.feed(['eta', 'theta']))
    expect(matchPositionMock.mock.calls.at(-1)?.[3]).toMatchObject({ localOnly: false })
  })

  it('reports that it is following again', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    expect(result.current.status).toBe('following')
  })
})

describe('useSmartFollow — speech during a drag', () => {
  it('ignores recognized words while the finger is down', () => {
    const engine = new SmoothFollowEngine()
    engine.setMode('follow')
    engine.setScrubbing(true)
    const { result } = mount(engine)
    act(() => result.current.feed(['alpha', 'beta']))
    expect(matchPositionMock).not.toHaveBeenCalled()
  })

  it('resumes matching once the finger lifts', () => {
    const engine = new SmoothFollowEngine()
    engine.setMode('follow')
    engine.setScrubbing(true)
    const { result } = mount(engine)
    act(() => result.current.feed(['alpha', 'beta']))
    engine.setScrubbing(false)
    act(() => result.current.feed(['alpha', 'beta']))
    expect(matchPositionMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/smartfollow/useSmartFollow.test.ts`
Expected: FAIL — TypeScript reports `reanchorTo` does not exist on `SmartFollowController`, and the drag tests fail because `onWords` calls the matcher regardless of scrubbing.

- [ ] **Step 3: Add the constant and the local-only clock**

In `src/smartfollow/useSmartFollow.ts`, add below the imports:

```ts
/**
 * How long after a manual re-anchor the matcher stays local-only. Roughly the length of an
 * apology — long enough that "sorry, let me take that again" cannot move the document, short
 * enough that a genuine jump elsewhere is found again straight away.
 */
const LOCAL_ONLY_MS = 2000
```

Add to `SmartFollowController`:

```ts
  /** Put the matcher at `index` — the presenter has just placed the text there by hand. */
  reanchorTo: (index: number) => void
  /** The matcher's current token index. Read by the dev verification seam (Task 5). */
  getIndex: () => number
```

Add a ref alongside the existing ones (near `lastTargetRef`):

```ts
  // While `now` is below this, matching stays local — see LOCAL_ONLY_MS.
  const localOnlyUntilRef = useRef(0)
```

- [ ] **Step 4: Guard `onWords` and pass the option**

Inside `onWords`, replace the opening guard and the `matchPosition` call:

```ts
      if (tokens.length === 0 || recent.length === 0) return
      // A drag in progress owns the position (PRD §37) — speech heard mid-gesture must not
      // queue a target that would yank the text out from under the finger on release.
      if (engine.scrubbing) return
      const localOnly = performance.now() < localOnlyUntilRef.current
      const res = matchPosition(tokens, indexRef.current, recent, { localOnly })
```

- [ ] **Step 5: Implement `reanchorTo` and return it**

Add above the `start` callback:

```ts
  const reanchorTo = useCallback((index: number) => {
    indexRef.current = index
    // The deadband's memory is a pre-drag target — meaningless now, and it would only fight
    // the first move back. Null lets the next target through freely.
    lastTargetRef.current = null
    localOnlyUntilRef.current = performance.now() + LOCAL_ONLY_MS
    setStatus('following')
  }, [])
```

Add `reanchorTo` to the returned object, after `stop`:

```ts
    stop,
    reanchorTo,
    getIndex: () => indexRef.current,
    feed: onWords,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/smartfollow/useSmartFollow.test.ts`
Expected: PASS, all six tests.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: everything green.

- [ ] **Step 8: Commit**

```bash
git add src/smartfollow/useSmartFollow.ts src/smartfollow/useSmartFollow.test.ts
git commit -m "Smart Follow: reanchorTo, and hold still during a drag

The matcher's indexRef was write-only from onWords, so a manual move was
undone by the next few recognized words. reanchorTo moves it, clears the
stale backward-deadband memory, and opens a 2s local-only window."
```

---

### Task 5: Wire it into Prompt Mode

**Files:**
- Modify: `src/screens/PromptScreen.tsx` (imports at `:1-10`, `jumpToLineAt` at `:181-193`, `onPointerUp` at `:203-222`)

**Interfaces:**
- Consumes: `wordIndexAtAnchor`, `firstWordIndexIn` (Task 3), `sf.reanchorTo` (Task 4), `engine.setScrubbing` adopting the position (Task 1).
- Produces: `window.__prompter = { followMode, feed, position, index }` in dev builds — used by Task 6. Deliberately no `reanchor` member: the driver must exercise re-anchoring through the real pointer handler, and a seam nobody calls is dead code.

- [ ] **Step 1: Import the geometry helpers and hoist the line height**

Add to the imports at the top of `src/screens/PromptScreen.tsx`:

```ts
import { wordIndexAtAnchor, firstWordIndexIn } from '../smartfollow/positionMap'
```

`preset.fontSize * preset.lineHeight` is currently computed inline in the `useSmartFollow` call. Hoist it next to `const preset = PRESETS[settings.preset]` so the pointer handlers can use it too:

```ts
  const preset = PRESETS[settings.preset]
  const lineHeightPx = preset.fontSize * preset.lineHeight
```

and pass the hoisted value in the `useSmartFollow` options instead of the inline expression:

```ts
    lineHeightPx,
```

- [ ] **Step 2: Re-anchor after a drag**

Replace the body of `onPointerUp` from the `engine.setScrubbing(false)` line onward:

```ts
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const wasTap = drag.current.moved < 6
    drag.current.active = false
    // Adopts the dragged-to position as the follow target, so nothing lurches while we
    // work out which word the presenter landed on.
    engine.setScrubbing(false)
    if (!wasTap) {
      // A real drag: the presenter has moved the script by hand — usually back to a line they
      // fumbled. Tell Smart Follow where they now are so it carries on from there (PRD §37).
      // Guarded on Smart Follow being *enabled*, deliberately not on `listening`. `listening`
      // only goes true after Vosk's startMic() resolves, which the browser driver cannot do
      // (no mic, and the 50MB model is gitignored) — gating on it would make Task 6 silently
      // bypass this entire path and still report green. Re-anchoring while not listening is
      // harmless: start() resets the index regardless, and sfStatusLabel checks !sf.listening
      // before status, so 'following' cannot leak onto the screen.
      if (usingSFRef.current) {
        const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
        if (index != null) sfRef.current.reanchorTo(index)
      }
      return
    }
    if (!controlsVisible) {
      setControlsVisible(true)
      scheduleHide(engine.playing)
      return
    }
    // Controls already visible: tap a line to recenter it, or tap empty space to dismiss controls.
    if (jumpToLineAt(e.clientX, e.clientY)) {
      setControlsVisible(true)
      scheduleHide(engine.playing)
    } else {
      setControlsVisible(false)
    }
  }
```

- [ ] **Step 3: Re-anchor after tap-to-jump too**

`glideTo` is checked before `mode` in `tick()`, so the glide plays out and then follow mode pulls the text back to its stale target — the same defect as the drag. Re-anchor to the destination line's first word, which is known up front, so there is no race with the glide finishing.

Replace `jumpToLineAt`:

```ts
  // Glide the tapped line into the Focus Zone (~40% of the viewport height).
  const jumpToLineAt = (x: number, y: number): boolean => {
    const viewport = viewportRef.current
    if (!viewport) return false
    const line = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(
      '[data-prompter-line]',
    )
    if (!line) return false
    const lineRect = line.getBoundingClientRect()
    const vpRect = viewport.getBoundingClientRect()
    engine.glideTo(engine.position + (lineRect.top - vpRect.top) - 0.4 * vpRect.height)
    // Same handshake as a drag: without it, follow mode would snap the text back to its
    // pre-tap target the moment the glide finishes.
    if (usingSFRef.current) {
      const index = firstWordIndexIn(line)
      if (index != null) sfRef.current.reanchorTo(index)
    }
    return true
  }
```

- [ ] **Step 4: Fix the same defect in Restart**

`restart()` has the identical snap-back. `sf.stop()` only stops Vosk and sets status to `idle` — it never leaves follow mode, so `targetPosition` stays where the presenter was. `gliding` is checked before `mode` in `tick()`, so the glide reaches the top, `gliding` flips false, and the very next tick smooth-damps from 0 back down toward the stale target at up to `maxFollowSpeed` (320px/s). The presenter presses Restart, watches the text reach the top, then slide back down.

Pre-existing, but the spec's reasoning about tap-to-jump applies verbatim: shipping the drag fix while leaving a sibling path visibly broken is worse than fixing both. Replace `restart`:

```ts
  const restart = useCallback(() => {
    if (usingSFRef.current) sfRef.current.stop()
    else engine.pause()
    setPlaying(false)
    engine.glideTo(0) // eases smoothly back to the top
    // Follow mode would otherwise smooth-damp straight back down to its pre-restart target the
    // moment the glide finishes — stop() does not leave follow mode.
    engine.setTargetPosition(0)
    if (usingSFRef.current) sfRef.current.reanchorTo(0)
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [engine])
```

- [ ] **Step 5: Add the DEV-only verification seam**

Prompt Mode cannot otherwise be driven without a live microphone and a 50MB gitignored model. Add this effect after the existing `useEffect` that cleans up `hideTimer` (near the end of the hooks, before `jumpToLineAt`):

```ts
  // Dev-only seam so scripts/verify-reanchor.mjs can drive Smart Follow without a microphone
  // or the 50MB model. Stripped from production builds by the import.meta.env.DEV guard.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__prompter = {
      followMode: () => engine.setMode('follow'),
      feed: (words: string[]) => sfRef.current.feed(words),
      position: () => engine.position,
      index: () => sfRef.current.getIndex(),
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__prompter
    }
  }, [engine])
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. The build also proves the DEV seam does not break the production bundle.

- [ ] **Step 7: Commit**

```bash
git add src/screens/PromptScreen.tsx
git commit -m "Prompt Mode: re-anchor Smart Follow after a manual move

Drag release, tap-to-jump and Restart all now tell the matcher where the
presenter put the text, so it carries on from there instead of dragging
them back. Restart also clears the follow target, which otherwise pulled
the text back down the moment the glide to the top finished.

Adds a dev-only window.__prompter seam for browser verification."
```

---

### Task 6: Prove it in a real browser

Vitest cannot see any of this — jsdom has no hit-testing and no rects. This driver is the only evidence the feature actually works.

**Files:**
- Create: `scripts/verify-reanchor.mjs`

**Interfaces:**
- Consumes: `window.__prompter` (Task 5), the `[data-prompter-line]` / `[data-w]` / `[data-prompter-text]` attributes already rendered by `PromptText`.
- Produces: nothing — a verification driver.

- [ ] **Step 1: Write the driver**

Create `scripts/verify-reanchor.mjs`. It must live under `scripts/` so Playwright resolves from the project `node_modules`.

```js
import { chromium } from 'playwright'

const URL = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1194, height: 834 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// 1. Seed a script through the editor (autosaves to IndexedDB, debounced ~250ms).
await p.goto(URL, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
const lines = [
  'Today the prime minister presented a new housing program',
  'It aims to support young families across the country',
  'The plan includes lower interest rates for first buyers',
  'Construction will begin in several regions next spring',
  'Critics question how the program will be funded',
  'Supporters say it addresses a long standing shortage',
  'The opposition demanded more detail on the timeline',
  'Officials promised a full report within two weeks',
  'Markets reacted calmly to the announcement today',
  'We will follow this story as it develops further',
]
for (const l of lines) await ed.type(l + '\n')
await sleep(500)

// 2. Turn Smart Follow on, then enter Prompt Mode.
await p.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
const sfToggle = p.getByRole('switch', { name: 'Smart Follow' })
if (!(await sfToggle.isChecked())) await sfToggle.check()
await sleep(200)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(600)

// 3. Put the engine in follow mode and advance a few paragraphs by "speech".
await p.evaluate(() => window.__prompter.followMode())
await p.evaluate(() => window.__prompter.feed(['opposition', 'demanded', 'more', 'detail']))
await sleep(1800)
const advanced = await p.evaluate(() => window.__prompter.position())
check('speech advanced the script', advanced > 100, `position ${Math.round(advanced)}`)

// 4. Drag the text back down — the presenter pulling a fumbled line back into view.
const box = await p.locator('[data-prompter-text]').boundingBox()
const cx = box.x + box.width / 2
await p.mouse.move(cx, 300)
await p.mouse.down()
for (let y = 300; y <= 600; y += 30) {
  await p.mouse.move(cx, y)
  await sleep(16)
}
const duringDrag = await p.evaluate(() => window.__prompter.position())
check('the engine did not fight the finger', duringDrag < advanced - 100,
  `${Math.round(advanced)} -> ${Math.round(duringDrag)}`)
await p.mouse.up()

// 5. It must stay where it was put — the bug that made the feature impossible.
await sleep(900)
const afterRelease = await p.evaluate(() => window.__prompter.position())
check('the text stayed where the presenter put it', Math.abs(afterRelease - duringDrag) < 12,
  `${Math.round(duringDrag)} -> ${Math.round(afterRelease)}`)

// 5b. The matcher must now believe the presenter is at the word under the Focus Zone. This is
// the check that fails if reanchorTo was never wired up — every other check here can pass with
// Task 4 completely inert.
const anchored = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const y = vp.top + 0.4 * vp.height
  const el = document.elementFromPoint(vp.left + vp.width / 2, y)
  const w = el?.closest('[data-w]') ?? el?.closest('[data-prompter-line]')?.querySelector('[data-w]')
  return { matcher: window.__prompter.index(), onScreen: w ? Number(w.getAttribute('data-w')) : null }
})
check('the matcher re-anchored to the word at the Focus Zone',
  anchored.onScreen != null && Math.abs(anchored.matcher - anchored.onScreen) <= 8,
  `matcher ${anchored.matcher} vs on-screen ${anchored.onScreen}`)

// 6. An apology during the local-only window must not move the document.
await p.evaluate(() => window.__prompter.feed(['sorry', 'let', 'me', 'take', 'that', 'again']))
await sleep(900)
const afterApology = await p.evaluate(() => window.__prompter.position())
check('an apology did not teleport the script', Math.abs(afterApology - afterRelease) < 40,
  `${Math.round(afterRelease)} -> ${Math.round(afterApology)}`)

// 7. Re-reading the line at the Focus Zone resumes following from there.
const spoken = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const y = vp.top + 0.4 * vp.height
  const el = document.elementFromPoint(vp.left + vp.width / 2, y)
  const line = el?.closest('[data-prompter-line]')
  return line ? line.textContent.trim().split(/\s+/).slice(0, 4) : null
})
check('a line sits at the Focus Zone', spoken != null, spoken?.join(' '))

// Do NOT assert the position moves forward here. The re-anchor lands on whichever word sat at the
// anchor — usually the line's LAST word, since that is what occupies the anchor point after a drag.
// Speaking that line from its start therefore pulls the matcher earlier within the same line, moving
// the text back by up to a line. That is correct behaviour, not drift. The two invariants worth
// pinning are below: the matched word parks at the Focus Zone, and reading on advances the script.
const measure = () =>
  p.evaluate(() => {
    const text = document.querySelector('[data-prompter-text]')
    const vp = text.parentElement.getBoundingClientRect()
    const anchorY = vp.top + 0.4 * vp.height
    const r = document.querySelector(`[data-w="${window.__prompter.index()}"]`)?.getBoundingClientRect()
    const lh = parseFloat(getComputedStyle(text).lineHeight)
    return {
      pos: window.__prompter.position(),
      offset: r ? r.top - anchorY : null,
      lineHeight: Number.isFinite(lh) ? lh : 60,
    }
  })

await p.evaluate((w) => window.__prompter.feed(w), spoken ?? ['the'])
await sleep(1800)
const resumed = await measure()
check('the spoken word settled at the Focus Zone',
  resumed.offset != null && Math.abs(resumed.offset) < 0.75 * resumed.lineHeight,
  `${Math.round(resumed.offset)}px from anchor (tolerance ${Math.round(0.75 * resumed.lineHeight)}px)`)

// 7b. Reading on must carry the script forward again — that is what "following resumed" means.
await p.evaluate(() => window.__prompter.feed(['lower', 'interest', 'rates', 'for', 'first', 'buyers']))
await sleep(1800)
const readOn = await measure()
check('reading on advances the script', readOn.pos > resumed.pos + 30,
  `${Math.round(resumed.pos)} -> ${Math.round(readOn.pos)}`)

// 8. Tap-to-jump must stick too. It shares the glide path with Restart, and its stale-target bug
// (glideTo never sets targetPosition) was caught only in review — nothing else guards it. Controls
// stay visible here because we never pressed Play, so a tap routes to jumpToLineAt rather than
// merely revealing the controls.
const tapAt = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const lines = [...document.querySelectorAll('[data-prompter-line]')]
  const target = lines.find((l) => l.getBoundingClientRect().top > vp.top + 0.62 * vp.height)
  if (!target) return null
  const r = target.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
if (tapAt) {
  const beforeTap = await p.evaluate(() => window.__prompter.position())
  await p.mouse.click(tapAt.x, tapAt.y)
  await sleep(1400) // let the glide finish
  const afterGlide = await p.evaluate(() => window.__prompter.position())
  check('tap-to-jump moved the text', Math.abs(afterGlide - beforeTap) > 30,
    `${Math.round(beforeTap)} -> ${Math.round(afterGlide)}`)
  await sleep(1600) // the stale-target drift, if any, happens here
  const afterSettle = await p.evaluate(() => window.__prompter.position())
  check('tap-to-jump did not drift back to a stale target', Math.abs(afterSettle - afterGlide) < 12,
    `${Math.round(afterGlide)} -> ${Math.round(afterSettle)}`)
} else {
  check('tap-to-jump moved the text', false, 'no line found below 62% of the viewport')
  check('tap-to-jump did not drift back to a stale target', false, 'skipped')
}

await p.screenshot({ path: '/tmp/prompter/reanchor.png' })
await b.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it against the current code and watch it fail**

Run in one terminal: `npx vite --port 5173`
Run in another: `mkdir -p /tmp/prompter && node scripts/verify-reanchor.mjs`

Expected before Tasks 1-5 land: the `did not fight the finger`, `stayed where the presenter put it`, `re-anchored to the word at the Focus Zone` and `tap-to-jump did not drift back` checks FAIL. If you are running this plan in order these tasks are already done, so run it once with `git stash` over the source changes to see red, then unstash.

**Confirm the driver really reaches `reanchorTo`.** Temporarily add `console.log('reanchor', index)` to `reanchorTo` in `useSmartFollow.ts`, re-run, and check it appears in the page console (`p.on('console', …)` or the terminal). If it never fires, the pointer handler is being bypassed and every check below is measuring nothing. Remove the log afterwards.

- [ ] **Step 3: Run it against the finished code**

Run: `node scripts/verify-reanchor.mjs`
Expected: `10/10 checks passed`, exit code 0.

`.claude/skills/verify/SKILL.md` still claims Smart Follow is disabled on Setup ("Coming soon"). That is stale — `SetupScreen.tsx:50-52` wires the toggle to `settings.smartFollow`, so the `getByRole('switch', …)` above works. Fix that line while you are in the skill file at Step 5.

If the toggle ever regresses to disabled, seed the preference directly instead. The key is `prompter:settings` (`src/persistence/storage.ts:7`) — note the colon, not a dot:

```js
await p.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('prompter:settings') ?? '{}')
  localStorage.setItem('prompter:settings', JSON.stringify({ ...raw, smartFollow: true }))
})
await p.reload({ waitUntil: 'networkidle' })
```

- [ ] **Step 4: Look at the screenshot**

Open `/tmp/prompter/reanchor.png`. Confirm the script is rendered, a line sits at the Focus Zone, and the view is not blank. A blank frame means the app failed to launch and every check above is meaningless.

- [ ] **Step 5: Update the verify skill**

Add to the **Handles** list in `.claude/skills/verify/SKILL.md`:

```markdown
- **Manual re-anchor (dev):** `node scripts/verify-reanchor.mjs` → drags the script back mid-Smart-Follow
  and asserts the engine does not fight the finger, the text stays where it was put, an apology during
  the local-only window does not move it, and following resumes from the re-anchored line.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-reanchor.mjs .claude/skills/verify/SKILL.md
git commit -m "Verify: browser driver for manual re-anchor

Proves in a real browser what jsdom cannot see — dragging the script mid
Smart Follow moves it, it stays put on release, and following resumes
from the line the presenter chose."
```

---

## Done when

1. `npm test` — all suites green, including the pre-existing engine, matcher and positionMap tests.
2. `npm run typecheck` — clean.
3. `npm run build` — succeeds.
4. `node scripts/verify-reanchor.mjs` — 10/10, exit 0.
5. Dragging the script during Smart Follow moves it, it stays where it is put, and speaking the line at the Focus Zone resumes gentle following from there.
6. No new buttons, controls, or status strings anywhere in the diff.
