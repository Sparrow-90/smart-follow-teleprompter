import { describe, it, expect } from 'vitest'
import { PRESETS, PRESET_ORDER, REFERENCE_VIEWPORT, resolvePreset, type PresetStyle } from './presets'

/**
 * Preset sizes are authored against one reference tablet. A laptop or an external display is
 * bigger, and a fixed pixel size there is a narrow strip of small text — the presenter cannot
 * read it from where they are standing. resolvePreset scales the authored numbers to the screen
 * actually in front of them.
 */

const style: PresetStyle = {
  label: 'test',
  helper: '',
  fontSize: 100,
  lineHeight: 1.5,
  columnWidth: 1000,
  baseSpeed: 50,
}

const { width: W, height: H } = REFERENCE_VIEWPORT

describe('resolvePreset', () => {
  it('leaves a preset exactly as authored at the reference viewport', () => {
    expect(resolvePreset(style, W, H)).toEqual(style)
  })

  it('grows the text, the column and the scroll speed together', () => {
    // Speed has to grow with the text or the same words per second read as a different pace.
    expect(resolvePreset(style, W * 1.5, H * 1.5)).toMatchObject({
      fontSize: 150,
      columnWidth: 1500,
      baseSpeed: 75,
    })
  })

  it('scales by whichever axis is tighter, so a short wide window keeps its lines', () => {
    // Twice as wide but no taller: scaling on width would leave two giant lines on screen.
    expect(resolvePreset(style, W * 2, H).fontSize).toBe(100)
  })

  it('widens the column to the screen even when the text cannot grow', () => {
    // A wide, short screen cannot take bigger text — the lines would not fit — but leaving a
    // quarter of it as empty margin is the complaint this whole change exists to answer.
    const wide = resolvePreset(style, W * 1.6, H)
    expect(wide.fontSize).toBe(100)
    expect(wide.columnWidth).toBe(1600)
  })

  it('stops growing on a very large display', () => {
    const huge = resolvePreset(style, W * 4, H * 4).fontSize
    expect(huge).toBeGreaterThan(100)
    expect(huge).toBeLessThanOrEqual(100 * 1.75)
  })

  it('stops shrinking on a small one', () => {
    expect(resolvePreset(style, 320, 240).fontSize).toBeGreaterThanOrEqual(70)
  })

  it('keeps line height a ratio, not a length', () => {
    expect(resolvePreset(style, W * 1.5, H * 1.5).lineHeight).toBe(1.5)
  })

  it('survives a viewport that has not been measured yet', () => {
    expect(resolvePreset(style, 0, 0)).toEqual(style)
  })
})

describe('PRESETS', () => {
  it('gets larger and wider with every step away from the device', () => {
    const steps = PRESET_ORDER.map((p) => PRESETS[p])
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].fontSize).toBeGreaterThan(steps[i - 1].fontSize)
      expect(steps[i].columnWidth).toBeGreaterThan(steps[i - 1].columnWidth)
    }
  })

  it('lets Distance use nearly the whole reference tablet', () => {
    // The complaint that started this: a column that used ~74% of the iPad, with the text sized
    // to match, could not be read from across the room. Checked on the device twice — 76px was
    // still short, so Distance sits near the practical ceiling for a 1194px-wide tablet. Past
    // ~110px the lines break up: under three words each, which reads worse however large it is.
    expect(PRESETS.distance.columnWidth / REFERENCE_VIEWPORT.width).toBeGreaterThan(0.9)
    expect(PRESETS.distance.fontSize).toBeGreaterThanOrEqual(96)
    expect(PRESETS.distance.fontSize).toBeLessThanOrEqual(110)
  })
})
