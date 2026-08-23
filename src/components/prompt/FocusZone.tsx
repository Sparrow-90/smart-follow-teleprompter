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
          // Asymmetric on purpose: the fade above the reading point stays tight (past text recedes
          // quickly), while below it the clear band extends and the fade is gentle — so the next
          // 2–3 lines (and text after a pause gap) stay legible before you reach them.
          background:
            'linear-gradient(to bottom,' +
            ' var(--color-bg) 0%,' +
            ' color-mix(in srgb, var(--color-bg) 70%, transparent) 24%,' +
            ' transparent 37%,' +
            ' transparent 50%,' +
            ' color-mix(in srgb, var(--color-bg) 28%, transparent) 64%,' +
            ' color-mix(in srgb, var(--color-bg) 62%, transparent) 82%,' +
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
