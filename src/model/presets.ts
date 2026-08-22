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
 * Starting values — to be tuned on-device (iPad + an Android tablet) per PRD §18/§28/§73.
 * Larger presets scroll a little faster in px/sec so reading *pace* stays similar.
 */
export const PRESETS: Record<Preset, PresetStyle> = {
  close: {
    label: 'Close',
    helper: 'Device close — smaller text, narrow column.',
    fontSize: 30,
    lineHeight: 1.4,
    columnWidth: 640,
    baseSpeed: 40,
  },
  standard: {
    label: 'Standard',
    helper: 'The default for most setups.',
    fontSize: 42,
    lineHeight: 1.45,
    columnWidth: 760,
    baseSpeed: 55,
  },
  distance: {
    label: 'Distance',
    helper: 'Device further away — larger text.',
    fontSize: 60,
    lineHeight: 1.5,
    columnWidth: 880,
    baseSpeed: 72,
  },
}

export const PRESET_ORDER: Preset[] = ['close', 'standard', 'distance']
