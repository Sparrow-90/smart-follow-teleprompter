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
