export type Preset = 'standard' | 'distance'
export type Theme = 'dark' | 'light'
export type SttLanguage = 'en-US' | 'pl-PL'

/**
 * Manual text size, as a multiplier on the chosen preset.
 *
 * The floor is 34/50 — the font the old `close` preset used, over Standard's. Close was dropped
 * because "smaller" is not a step, it is an amount: how much smaller depends on the room the
 * presenter is standing in, which is not knowable from here. The floor is reachable in exact
 * steps (1.00 → 0.92 → 0.84 → 0.76 → 0.68), so what Close used to give is still on the dial
 * rather than being rounded past.
 */
export const TEXT_SCALE_MIN = 0.68
export const TEXT_SCALE_MAX = 1.5
export const TEXT_SCALE_STEP = 0.08

export const clampTextScale = (n: number) => Math.min(Math.max(n, TEXT_SCALE_MIN), TEXT_SCALE_MAX)

export interface Settings {
  /** Reading distance preset — controls text size, line height and column width. */
  preset: Preset
  /**
   * The presenter's own size adjustment on top of the preset, set live in Prompt Mode.
   * 1 = the preset exactly as authored. Folded into the resolved PresetStyle by resolvePreset,
   * never applied at render time — see the comment there for why that matters.
   */
  textScale: number
  /** Smart Follow — on-device speech tracks your place and moves the text. */
  smartFollow: boolean
  /** Recognition language for Smart Follow. */
  language: SttLanguage
  /** Horizontal mirror, applied in Prompt Mode only. */
  mirror: boolean
  /** Subtle reading marker at the left of the Focus Zone. */
  readingMarker: boolean
  theme: Theme
}

export const defaultSettings: Settings = {
  preset: 'standard',
  textScale: 1,
  smartFollow: true,
  language: 'en-US',
  mirror: false,
  readingMarker: true,
  theme: 'dark',
}

export const LANGUAGE_LABELS: Record<SttLanguage, string> = {
  'en-US': 'English',
  'pl-PL': 'Polski',
}

/**
 * Turn whatever was persisted into a Settings object this build can actually render.
 *
 * This is the only validation there is: what comes back out of localStorage used to be merged
 * over the defaults through a blind cast, which was survivable while the shape only ever grew.
 * Removing `close` from Preset changed that — anyone who had chosen it has `preset: 'close'` on
 * disk, `PRESETS['close']` is undefined, and Prompt Mode renders nothing at all on their first
 * load. It never reproduces in a profile that happens to hold 'standard'.
 *
 * Close maps to Standard at the floor of the manual scale rather than to plain Standard, because
 * those presenters chose the smaller text on purpose and the whole point of the floor is that it
 * is still exactly what they had.
 */
export function migrateSettings(raw: unknown): Settings {
  if (raw == null || typeof raw !== 'object') return { ...defaultSettings }
  // `preset` is widened back to string on purpose: the value on disk may be one this
  // build no longer has, which is the entire reason this function exists.
  const stored = raw as Omit<Partial<Settings>, 'preset'> & { preset?: string }
  const legacyClose = stored.preset === 'close'
  // Only OVERRIDE a preset this build cannot render — do not re-decide one it can. Rewriting
  // anything that is not 'distance' to 'standard' happens to agree with the default today and
  // would silently contradict it the moment the default moved.
  const preset: Preset =
    !legacyClose && (stored.preset === 'standard' || stored.preset === 'distance')
      ? stored.preset
      : 'standard'
  const scale = legacyClose
    ? TEXT_SCALE_MIN
    : typeof stored.textScale === 'number' && Number.isFinite(stored.textScale)
      ? clampTextScale(stored.textScale)
      : 1
  return { ...defaultSettings, ...stored, preset, textScale: scale }
}
