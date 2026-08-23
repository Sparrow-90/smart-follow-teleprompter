export type Preset = 'close' | 'standard' | 'distance'
export type Theme = 'dark' | 'light'
export type SttLanguage = 'en-US' | 'pl-PL'

export interface Settings {
  /** Reading distance preset — controls text size, line height and column width. */
  preset: Preset
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
