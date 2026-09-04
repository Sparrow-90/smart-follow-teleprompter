import { describe, it, expect } from 'vitest'
import {
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEP,
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

  it('lands a Close user within a couple of px of the font size they actually had', () => {
    /*
     * This is what the floor is FOR, and it is a product of two numbers that move independently:
     * the floor is a multiplier, Close's font was an absolute 34px, and Standard has since been
     * raised 50 → 60 so its column fills the screen. Left alone, that alone would have handed a
     * migrated presenter 40.8px.
     *
     * The floor came down to 0.60 to answer it, which lands at 36px — the nearest size ON the
     * TEXT_SCALE_STEP dial, since the floor also has to be reachable by pressing A− rather than
     * only by arriving there from disk. Asserting the window rather than one number is the honest
     * form: it is the pair that has to stay in agreement, and either may be tuned on a device.
     */
    const migrated = migrateSettings({ preset: 'close' })
    const px = PRESETS[migrated.preset].fontSize * migrated.textScale
    expect(px).toBeGreaterThanOrEqual(34)
    expect(px).toBeLessThanOrEqual(38)
  })

  it('keeps the floor reachable in whole A− steps, not merely stored', () => {
    // A floor off the step grid can be migrated INTO but never pressed down to, so a presenter
    // who nudged the size once could not get back to it.
    const steps = Math.round((1 - TEXT_SCALE_MIN) / TEXT_SCALE_STEP)
    expect(1 - steps * TEXT_SCALE_STEP).toBeCloseTo(TEXT_SCALE_MIN, 10)
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
