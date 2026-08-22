import type { PresetStyle } from '../../model/presets'
import { FocusZone } from '../prompt/FocusZone'
import { cn } from '../ui/cn'

interface SetupPreviewProps {
  preset: PresetStyle
  presetLabel: string
  mirror: boolean
  readingMarker: boolean
}

// Previews are shrunk from the real Prompt Mode sizes so the whole sample fits the panel.
const PREVIEW_SCALE = 0.5

/** A static, non-scrolling preview of how the teleprompter will look with the chosen preset. */
export function SetupPreview({ preset, presetLabel, mirror, readingMarker }: SetupPreviewProps) {
  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-2xl border border-border bg-bg">
      <div
        className={cn('flex h-full flex-col justify-center', mirror && '-scale-x-100')}
        style={{
          fontSize: `${preset.fontSize * PREVIEW_SCALE}px`,
          lineHeight: preset.lineHeight,
        }}
      >
        <div
          className="mx-auto px-8 font-medium"
          style={{ maxWidth: `${preset.columnWidth * PREVIEW_SCALE}px` }}
        >
          <p className="my-[0.45em] text-fg-muted">Dzień dobry.</p>
          <p className="my-[0.45em]">
            <strong>Witam Państwa</strong> w dzisiejszym wydaniu.
          </p>
          <p className="my-[0.45em] text-fg-muted">Zaczynamy od najważniejszych wydarzeń.</p>
        </div>
      </div>

      <FocusZone readingMarker={readingMarker} />

      <span className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-[0.65rem] tracking-wide text-fg-muted uppercase">
        {presetLabel} — Preview
      </span>
    </div>
  )
}
