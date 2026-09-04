import type { Preset } from './settings'

export interface PresetStyle {
  label: string
  /** One-line helper shown under the segmented control in Setup. */
  helper: string
  /** Text size in px (at the reference tablet viewport). */
  fontSize: number
  lineHeight: number
  /**
   * Display tracking, as an **em** value so it follows fontSize through applyTextScale and
   * resolvePreset without either of them having to know about it.
   *
   * It is authored here rather than left to the font because Geist has no optical-size axis —
   * `wght` 100–900 and nothing else — so one set of letterforms and one fit is all there is,
   * drawn for text sizes. The script runs from 35px to 175px through those two functions, and a
   * grotesque set at 0 tracking comes apart at the top of that range: the counters open up, the
   * words stop holding together, and the line reads as a row of letters. Negative tracking is
   * what a variable optical axis would have applied on its own.
   *
   * Proportionally tighter at the larger preset, which is the same reason display cuts exist:
   * the correction is not linear in em, so a single value cannot serve 50px and 100px both.
   */
  letterSpacing: string
  /**
   * Weight of the script itself. Authored per preset for the same reason as the tracking: at
   * Distance the glyphs are large enough that the extra weight only fills in the counters,
   * while at Standard it is what keeps the text solid from across a room.
   */
  fontWeight: number
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
 *
 * Two presets, not three: these are starting points now, and the presenter tunes the size from
 * there in Prompt Mode. `close` was dropped because it only ever meant "smaller", and how much
 * smaller is a fact about the room, not about the app — see TEXT_SCALE_MIN in settings.ts, which
 * is the exact font Close used to give.
 */
export const PRESETS: Record<Preset, PresetStyle> = {
  standard: {
    label: 'Standard',
    helper: 'The default for most setups.',
    fontSize: 50,
    lineHeight: 1.45,
    letterSpacing: '-0.018em',
    fontWeight: 500,
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
    letterSpacing: '-0.026em',
    fontWeight: 450,
    columnWidth: 1140,
    baseSpeed: 118,
  },
}

export const PRESET_ORDER: Preset[] = ['standard', 'distance']

/** The tablet the sizes above are written for: an iPad in landscape. */
export const REFERENCE_VIEWPORT = { width: 1194, height: 834 }

/** How far the authored sizes may be pushed on very small and very large screens. */
const MIN_SCALE = 0.7
const MAX_SCALE = 1.75

const clampScale = (n: number) => Math.min(Math.max(n, MIN_SCALE), MAX_SCALE)

/**
 * The presenter's own size adjustment, applied to an authored (or already fitted) preset.
 *
 * Font, column and speed move together, for the same reasons the three authored presets do:
 * scaling type alone changes how many words land on a line, and scroll speed has to follow the
 * text or the same px/sec reads as a different pace.
 *
 * One honest limit: columnWidth is a `max-width`, so once it passes the width of the screen the
 * column cannot grow any further and additional growth IS text-only. On a reference tablet that
 * is around 1.15 at Distance, whose column already asks for 96% of the screen. Shrinking is never
 * affected — "words per line holds" is a claim about the useful range, not a law.
 */
export function applyTextScale(style: PresetStyle, textScale: number): PresetStyle {
  return {
    ...style,
    fontSize: Math.round(style.fontSize * textScale),
    columnWidth: Math.round(style.columnWidth * textScale),
    baseSpeed: style.baseSpeed * textScale,
  }
}

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
 * The presenter's own `textScale` is folded in here too, at the end, so the returned object is
 * the single place every size in Prompt Mode comes from.
 *
 * The result must be the ONLY source of size in Prompt Mode. PromptScreen derives lineHeightPx
 * from it as well as rendering from it, because Smart Follow aims at a line using that number —
 * if the rendered text scaled and lineHeightPx did not, the follow would target the wrong line.
 * That is also why textScale must never be applied in PromptText: FocusZone's clear band and
 * nudgeLines' step are both measured in lineHeightPx, so a size the renderer knows about and this
 * object does not puts all three on a different line than the presenter.
 */
export function resolvePreset(
  style: PresetStyle,
  viewportWidth: number,
  viewportHeight: number,
  textScale = 1,
): PresetStyle {
  if (viewportWidth <= 0 || viewportHeight <= 0) return applyTextScale(style, textScale)
  const widthRatio = viewportWidth / REFERENCE_VIEWPORT.width
  const fitScale = clampScale(Math.min(widthRatio, viewportHeight / REFERENCE_VIEWPORT.height))
  const columnScale = clampScale(widthRatio)
  if (fitScale === 1 && columnScale === 1) return applyTextScale(style, textScale)
  return applyTextScale(
    {
      ...style,
      fontSize: style.fontSize * fitScale,
      columnWidth: style.columnWidth * columnScale,
      baseSpeed: style.baseSpeed * fitScale,
    },
    // Rounded once, at the end: rounding the fitted size and then the scaled one lets the two
    // roundings compound, and fontSize is what lineHeightPx is derived from.
    textScale,
  )
}
