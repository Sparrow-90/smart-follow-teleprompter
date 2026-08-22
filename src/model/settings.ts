export type Preset = 'close' | 'standard' | 'distance'
export type Theme = 'dark' | 'light'

export interface Settings {
  /** Reading distance preset — controls text size, line height and column width. */
  preset: Preset
  /** Smart Follow. Disabled in Phase 1 (feature ships in the Smart Follow cycle). */
  smartFollow: boolean
  /** Horizontal mirror, applied in Prompt Mode only. */
  mirror: boolean
  /** Subtle reading marker at the left of the Focus Zone. */
  readingMarker: boolean
  theme: Theme
}

export const defaultSettings: Settings = {
  preset: 'standard',
  smartFollow: false,
  mirror: false,
  readingMarker: true,
  theme: 'dark',
}
