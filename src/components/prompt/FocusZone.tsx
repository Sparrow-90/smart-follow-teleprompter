/**
 * The Focus Zone spotlight. A viewport-fixed gradient in the page background colour
 * that stays clear around ~40% height and fades text above/below it — giving the
 * "current line bright, neighbours fade" look without any per-frame work. The zone is
 * felt, never drawn as a box (PRD §20). Optional reading marker sits at its left edge.
 */
export function FocusZone({ readingMarker }: { readingMarker: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to bottom,' +
            ' var(--color-bg) 0%,' +
            ' color-mix(in srgb, var(--color-bg) 70%, transparent) 24%,' +
            ' transparent 37%,' +
            ' transparent 46%,' +
            ' color-mix(in srgb, var(--color-bg) 70%, transparent) 60%,' +
            ' var(--color-bg) 100%)',
        }}
      />
      {readingMarker && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-4 z-20 text-fg-muted sm:left-8"
          style={{ top: '40%', transform: 'translateY(-50%)', fontSize: '1.5rem' }}
        >
          ›
        </div>
      )}
    </>
  )
}
