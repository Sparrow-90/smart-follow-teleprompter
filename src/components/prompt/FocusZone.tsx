import { FOCUS_ANCHOR } from '../../smartfollow/positionMap'

/** How many lines below the one being read must stay readable before the fade takes over. */
const CLEAR_LINES_BELOW = 2

/** The furthest down the screen the clear band may reach, so there is always some fade left. */
const MAX_CLEAR = '92%'

interface FocusZoneProps {
  readingMarker: boolean
  /**
   * One rendered line, in px (`preset.fontSize * preset.lineHeight`). The lower half of the
   * gradient is measured in these rather than in percentages — see below.
   */
  lineHeightPx: number
}

/**
 * The Focus Zone spotlight. A viewport-fixed gradient in the page background colour
 * that stays clear around the reading anchor and fades text above/below it — giving the
 * "current line bright, neighbours fade" look without any per-frame work. The zone is
 * felt, never drawn as a box (PRD §20). Optional reading marker sits at its left edge.
 */
export function FocusZone({ readingMarker, lineHeightPx }: FocusZoneProps) {
  // The clear band ends a fixed number of LINES below the anchor, not a fixed percentage of the
  // screen. That distinction is the whole point: a line pitch is a different share of the viewport
  // at every preset — measured at 1039x732 it is 8.6% at Close but 17.8% at Distance — so a stop
  // at a fixed 82% erased 22% of the next line at Close and 67% of it at Distance. The presenter
  // finished a line and the next one was grey. Expressed in pitches, every preset keeps the same
  // number of readable lines below the anchor, which is what the gradient was always trying to say.
  //
  // calc() mixes % and px inside a gradient stop, so the browser resolves this against the
  // element's real height and nothing here needs measuring or re-rendering on resize.
  const clearTo = `min(${MAX_CLEAR}, calc(${FOCUS_ANCHOR * 100}% + ${CLEAR_LINES_BELOW * lineHeightPx}px))`
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          // Asymmetric on purpose: the fade above the reading point stays tight (past text recedes
          // quickly), while below it the clear band extends and the fade is gentle — so the next
          // 2–3 lines (and text after a pause gap) stay legible before you reach them.
          background:
            'linear-gradient(to bottom,' +
            ' var(--color-bg) 0%,' +
            ' color-mix(in srgb, var(--color-bg) 70%, transparent) 24%,' +
            ' transparent 37%,' +
            ` transparent ${clearTo},` +
            ' var(--color-bg) 100%)',
        }}
      />
      {readingMarker && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-4 z-20 text-fg-muted sm:left-8"
          style={{ top: `${FOCUS_ANCHOR * 100}%`, transform: 'translateY(-50%)', fontSize: '1.5rem' }}
        >
          ›
        </div>
      )}
    </>
  )
}
