import { describe, it, expect } from 'vitest'
import { scrollTargetForLine } from './positionMap'

describe('scrollTargetForLine', () => {
  it('moves a line at screen-500 to the 40% anchor (320) of an 800px viewport', () => {
    // delta needed = 500 - 320 = 180, added to the current position of 100
    expect(scrollTargetForLine(100, 500, 0, 800)).toBe(280)
  })

  it('is a no-op when the line already sits at the anchor', () => {
    expect(scrollTargetForLine(100, 320, 0, 800)).toBe(100)
  })

  it('accounts for a non-zero viewport top', () => {
    expect(scrollTargetForLine(0, 500, 100, 800)).toBe(500 - 100 - 320)
  })

  it('honors a custom anchor', () => {
    expect(scrollTargetForLine(0, 500, 0, 1000, 0.5)).toBe(0)
  })
})
