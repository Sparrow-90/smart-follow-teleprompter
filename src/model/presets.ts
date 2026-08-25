import type { Preset } from './settings'

export interface PresetStyle {
  label: string
  /** One-line helper shown under the segmented control in Setup. */
  helper: string
  /** Text size in px (at the reference tablet viewport). */
  fontSize: number
  lineHeight: number
  /** Max column width in px. */
  columnWidth: number
  /** Base auto-scroll velocity in px/sec at speed multiplier 1. */
  baseSpeed: number
}

/**
 * Authored against REFERENCE_VIEWPORT — an iPad in landscape — and scaled to the real screen by
 * resolvePreset. Font and column are raised together on purpose: widening a column on its own
 * just makes the eye travel further across the line, which is worse at a distance, not better.
 * Larger presets scroll a little faster in px/sec so reading *pace* stays similar.
 */
export const PRESETS: Record<Preset, PresetStyle> = {
  close: {
    label: 'Close',
    helper: 'Device close — smaller text, narrow column.',
    fontSize: 34,
    lineHeight: 1.4,
    columnWidth: 780,
    baseSpeed: 45,
  },
  standard: {
    label: 'Standard',
    helper: 'The default for most setups.',
    fontSize: 50,
    lineHeight: 1.45,
    columnWidth: 940,
    baseSpeed: 65,
  },
  distance: {
    label: 'Distance',
    helper: 'Device further away — larger text.',
    // Near the practical ceiling for a 1194px tablet: the column below is all the width there
    // is, so past ~110px the lines fall under three words each and read worse however large.
    fontSize: 100,
    lineHeight: 1.5,
    columnWidth: 1140,
    baseSpeed: 118,
  },
}

export const PRESET_ORDER: Preset[] = ['close', 'standard', 'distance']

/** The tablet the sizes above are written for: an iPad in landscape. */
export const REFERENCE_VIEWPORT = { width: 1194, height: 834 }

/** How far the authored sizes may be pushed on very small and very large screens. */
const MIN_SCALE = 0.7
const MAX_SCALE = 1.75

const clampScale = (n: number) => Math.min(Math.max(n, MIN_SCALE), MAX_SCALE)

/**
 * Fit an authored preset to the screen actually in front of the presenter.
 *
 * Two different limits apply, so there are two scales:
 *
 * - **Text** grows by whichever axis is tighter. Height is what decides how many lines fit, and
 *   the presenter reads by lines — scaling type on width alone would turn a short wide window
 *   into two enormous ones. Scroll speed follows the text, so reading *pace* stays put.
 * - **The column** grows by width, because width is the only thing limiting it. Tying it to the
 *   tighter axis too left a quarter of a wide screen as empty margin, which is the complaint
 *   this scaling exists to answer.
 *
 * The result must be the ONLY source of size in Prompt Mode. PromptScreen derives lineHeightPx
 * from it as well as rendering from it, because Smart Follow aims at a line using that number —
 * if the rendered text scaled and lineHeightPx did not, the follow would target the wrong line.
 */
export function resolvePreset(style: PresetStyle, viewportWidth: number, viewportHeight: number): PresetStyle {
  if (viewportWidth <= 0 || viewportHeight <= 0) return style
  const widthRatio = viewportWidth / REFERENCE_VIEWPORT.width
  const textScale = clampScale(Math.min(widthRatio, viewportHeight / REFERENCE_VIEWPORT.height))
  const columnScale = clampScale(widthRatio)
  if (textScale === 1 && columnScale === 1) return style
  return {
    ...style,
    fontSize: Math.round(style.fontSize * textScale),
    columnWidth: Math.round(style.columnWidth * columnScale),
    baseSpeed: style.baseSpeed * textScale,
  }
}
