import { describe, it, expect } from 'vitest'
import {
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  defaultSettings,
  migrateSettings,
  type Settings,
} from './settings'
import { PRESETS } from './presets'

/**
 * What comes back out of localStorage was written by a build that no longer exists. These are the
 * cases that actually shipped, not hypotheticals: `close` was a real preset and real presenters
 * chose it, and nothing has ever validated the stored blob.
 */
describe('migrateSettings', () => {
  it('carries a current settings object through untouched', () => {
    const current: Settings = { ...defaultSettings, preset: 'distance', textScale: 0.84, mirror: true }
    expect(migrateSettings(current)).toEqual(current)
  })

  it('turns the retired Close preset into Standard at the smallest manual size', () => {
    // Not plain Standard: those presenters picked the smaller text deliberately.
    const migrated = migrateSettings({ ...defaultSettings, preset: 'close' })
    expect(migrated.preset).toBe('standard')
    expect(migrated.textScale).toBe(TEXT_SCALE_MIN)
  })

  it('gives a Close user back the font size they actually had', () => {
    // The whole reason the floor is 0.68 — Close's 34px over Standard's 50px.
    const migrated = migrateSettings({ preset: 'close' })
    expect(Math.round(PRESETS[migrated.preset].fontSize * migrated.textScale)).toBe(34)
  })

  it('defaults the scale to exactly 1, so existing presets look identical', () => {
    // Anything but exactly 1 would resize every returning user's script on upgrade.
    expect(migrateSettings({ preset: 'distance' }).textScale).toBe(1)
    expect(defaultSettings.textScale).toBe(1)
  })

  it('replaces a scale that is not a usable number', () => {
    expect(migrateSettings({ textScale: NaN }).textScale).toBe(1)
    expect(migrateSettings({ textScale: 'big' }).textScale).toBe(1)
    expect(migrateSettings({ textScale: null }).textScale).toBe(1)
  })

  it('clamps a scale from outside the range this build offers', () => {
    expect(migrateSettings({ textScale: 12 }).textScale).toBe(TEXT_SCALE_MAX)
    expect(migrateSettings({ textScale: 0.01 }).textScale).toBe(TEXT_SCALE_MIN)
  })

  it('falls back to a preset this build has when the stored one is unknown', () => {
    expect(migrateSettings({ preset: 'enormous' }).preset).toBe('standard')
  })

  it('leaves a preset it CAN render alone', () => {
    // The migration overrides what this build cannot render; it does not re-decide the rest.
    expect(migrateSettings({ preset: 'distance', mirror: true }).preset).toBe('distance')
    expect(migrateSettings({ preset: 'standard' }).preset).toBe('standard')
  })

  it('keeps the default preset when the stored settings name none', () => {
    expect(migrateSettings({ mirror: true }).preset).toBe(defaultSettings.preset)
  })

  it('survives a stored value that is not an object at all', () => {
    expect(migrateSettings(null)).toEqual(defaultSettings)
    expect(migrateSettings('{}')).toEqual(defaultSettings)
  })
})
