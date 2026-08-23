/**
 * Maps a matched script line to a Smooth Follow scroll target. Same geometry as tap-to-jump:
 * we move the content so the line sits at the Focus Zone anchor (~40% of the viewport height).
 */

const FOCUS_ANCHOR = 0.4

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

/** DOM convenience: read the rects and compute the target for a line element. */
export function lineElementTarget(
  currentPosition: number,
  lineEl: Element | null | undefined,
  viewportEl: Element | null | undefined,
  anchor: number = FOCUS_ANCHOR,
): number | null {
  if (!lineEl || !viewportEl) return null
  const line = lineEl.getBoundingClientRect()
  const vp = viewportEl.getBoundingClientRect()
  return scrollTargetForLine(currentPosition, line.top, vp.top, vp.height, anchor)
}
