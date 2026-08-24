/**
 * Maps a matched script line to a Smooth Follow scroll target. Same geometry as tap-to-jump:
 * we move the content so the line sits at the Focus Zone anchor (~40% of the viewport height).
 */

const FOCUS_ANCHOR = 0.4

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/**
 * Per-word target height: instead of collapsing every word on a visual line to the line's `top`
 * (which makes the scroll hold still, then step a whole line at each wrap — the "staircase"), we
 * advance the target *continuously* with how far the spoken word sits across the line.
 *
 * fraction = horizontal position of the word's centre within the text column (0 at the start of
 * the line, 1 at the end); the returned top eases from the word's line down toward the next line
 * as the fraction grows. The key property: at a wrap the next word's `top` drops one lineHeight
 * and its fraction resets to ~0, so the returned value is *continuous across the wrap*.
 *
 * `mirror` flips the fraction because a mirrored line reads right→left in visual space.
 */
export function interpolatedLineTop(
  wordTop: number,
  wordCenterX: number,
  columnLeft: number,
  columnWidth: number,
  lineHeightPx: number,
  mirror = false,
): number {
  if (columnWidth <= 0) return wordTop
  let fraction = clamp((wordCenterX - columnLeft) / columnWidth, 0, 1)
  if (mirror) fraction = 1 - fraction
  return wordTop + fraction * lineHeightPx
}

/**
 * Suppress small *backward* (upward) target moves — Vosk partials routinely correct the matched
 * index back a word or two, which would otherwise show as an upward jerk. Forward moves and large
 * backward moves (a real backtrack / restart) pass through unchanged.
 */
export function applyBackwardDeadband(
  lastTarget: number,
  newTarget: number,
  deadbandPx: number,
): number {
  if (newTarget < lastTarget && lastTarget - newTarget < deadbandPx) return lastTarget
  return newTarget
}

/** Pure form — given measurements, the scroll position that puts `lineTop` at the anchor. */
export function scrollTargetForLine(
  currentPosition: number,
  lineTop: number,
  viewportTop: number,
  viewportHeight: number,
  anchor: number = FOCUS_ANCHOR,
): number {
  return currentPosition + (lineTop - viewportTop) - anchor * viewportHeight
}

/**
 * DOM convenience for Smart Follow: read the spoken word's rect, the text column, and the viewport,
 * and compute a *continuous* scroll target via {@link interpolatedLineTop} (no line-quantized
 * staircase). Returns null if any element is missing (caller then holds position).
 */
export function wordProgressTarget(
  currentPosition: number,
  wordEl: Element | null | undefined,
  columnEl: Element | null | undefined,
  viewportEl: Element | null | undefined,
  lineHeightPx: number,
  mirror = false,
  anchor: number = FOCUS_ANCHOR,
): number | null {
  if (!wordEl || !columnEl || !viewportEl) return null
  const w = wordEl.getBoundingClientRect()
  const col = columnEl.getBoundingClientRect()
  const vp = viewportEl.getBoundingClientRect()
  const top = interpolatedLineTop(w.top, w.left + w.width / 2, col.left, col.width, lineHeightPx, mirror)
  return scrollTargetForLine(currentPosition, top, vp.top, vp.height, anchor)
}

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
