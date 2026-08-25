import { AnimatePresence, motion } from 'motion/react'
import type { PresetStyle } from '../../model/presets'
import { change, travel, travelLarge } from '../../motion/tokens'
import { FocusZone } from '../prompt/FocusZone'

interface SetupPreviewProps {
  preset: PresetStyle
  presetLabel: string
  mirror: boolean
  readingMarker: boolean
}

// Previews are shrunk from the real Prompt Mode sizes so the whole sample fits the panel.
// Tuned against the largest preset — Distance is 100px, and anything above ~0.3 makes its sample
// tall enough to push the panel open and shove the rest of Setup around. One shared factor, so
// the three previews stay in true proportion to each other, which is the whole point of them.
const PREVIEW_SCALE = 0.3

/**
 * A static, non-scrolling preview of how the teleprompter will look with the chosen preset.
 *
 * Every setting animates its own change, which turns the panel from a picture into the
 * answer to "what does this setting actually do?" — the mirror flip in particular explains
 * Mirror better than the label ever could.
 */
export function SetupPreview({ preset, presetLabel, mirror, readingMarker }: SetupPreviewProps) {
  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-2xl border border-border bg-bg">
      <motion.div
        className="flex h-full flex-col justify-center"
        animate={{
          scaleX: mirror ? -1 : 1,
          fontSize: preset.fontSize * PREVIEW_SCALE,
          lineHeight: preset.lineHeight,
        }}
        // fontSize and lineHeight are layout properties rather than GPU-composited ones.
        // Affordable here — three paragraphs in a fixed-size panel, nothing else reflows.
        // If it ever stutters on the iPad, animate `scale` on the inner block instead.
        transition={{ scaleX: travelLarge, fontSize: travel, lineHeight: travel }}
      >
        <motion.div
          className="mx-auto px-8 font-medium"
          animate={{ maxWidth: preset.columnWidth * PREVIEW_SCALE }}
          transition={travel}
        >
          <p className="my-[0.45em] text-fg-muted">Dzień dobry.</p>
          <p className="my-[0.45em]">
            <strong>Witam Państwa</strong> w dzisiejszym wydaniu.
          </p>
          <p className="my-[0.45em] text-fg-muted">Zaczynamy od najważniejszych wydarzeń.</p>
        </motion.div>
      </motion.div>

      {/*
        The marker is rendered here rather than by FocusZone, and FocusZone is asked for
        none. That is the point: the preview gets an animated marker without editing a
        component Prompt Mode shares, so the prompter path stays provably untouched.
        Eight lines of duplication is the right trade for that guarantee.
      */}
      <FocusZone readingMarker={false} />

      <AnimatePresence>
        {readingMarker && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-4 z-20 text-fg-muted sm:left-8"
            style={{ top: '40%', fontSize: '1.5rem' }}
            initial={{ opacity: 0, x: -4, y: '-50%' }}
            animate={{ opacity: 1, x: 0, y: '-50%' }}
            exit={{ opacity: 0, x: -4, y: '-50%' }}
            transition={change}
          >
            ›
          </motion.div>
        )}
      </AnimatePresence>

      <span className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-[0.65rem] tracking-wide text-fg-muted uppercase">
        {presetLabel} — Preview
      </span>
    </div>
  )
}
