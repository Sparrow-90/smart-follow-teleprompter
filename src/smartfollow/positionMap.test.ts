import { describe, it, expect } from 'vitest'
import { scrollTargetForLine, interpolatedLineTop, applyBackwardDeadband } from './positionMap'

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

describe('interpolatedLineTop', () => {
  // A line spanning column x=[100, 500] (width 400), line height 60px, word top at y=200.
  const col = { left: 100, width: 400 }
  const LH = 60

  it('returns the raw line top for a word at the very start of the line', () => {
    // wordCenterX == columnLeft → fraction 0 → no advance.
    expect(interpolatedLineTop(200, 100, col.left, col.width, LH)).toBe(200)
  })

  it('advances a full line-height for a word at the end of the line', () => {
    // wordCenterX == columnRight → fraction 1 → +one line height.
    expect(interpolatedLineTop(200, 500, col.left, col.width, LH)).toBe(260)
  })

  it('advances proportionally for a word mid-line', () => {
    // center at 300 → fraction 0.5 → +30.
    expect(interpolatedLineTop(200, 300, col.left, col.width, LH)).toBe(230)
  })

  it('is CONTINUOUS across a line wrap (the load-bearing property)', () => {
    // Last word of line 1: near the right edge, top=200 → ~260.
    const endOfLine = interpolatedLineTop(200, 495, col.left, col.width, LH)
    // First word of line 2: wraps down one line height (top=260), near left edge → ~260.
    const startOfNext = interpolatedLineTop(260, 105, col.left, col.width, LH)
    // The two are within a hair of each other — no line-height jump at the wrap.
    expect(Math.abs(endOfLine - startOfNext)).toBeLessThan(2)
  })

  it('clamps fraction to [0,1] outside the column bounds', () => {
    expect(interpolatedLineTop(200, 40, col.left, col.width, LH)).toBe(200) // left of column
    expect(interpolatedLineTop(200, 900, col.left, col.width, LH)).toBe(260) // right of column
  })

  it('flips the fraction under mirror (reading order runs right→left visually)', () => {
    // Visual center at the right edge in mirror = start of the reading line → fraction 0.
    expect(interpolatedLineTop(200, 500, col.left, col.width, LH, true)).toBe(200)
    expect(interpolatedLineTop(200, 100, col.left, col.width, LH, true)).toBe(260)
  })

  it('is a no-op advance when the column has no width', () => {
    expect(interpolatedLineTop(200, 300, 100, 0, LH)).toBe(200)
  })
})

describe('applyBackwardDeadband', () => {
  const DEAD = 45 // e.g. 0.75 * a 60px line

  it('passes forward moves through unchanged', () => {
    expect(applyBackwardDeadband(100, 140, DEAD)).toBe(140)
  })

  it('holds a small backward move (jitter from partial corrections)', () => {
    expect(applyBackwardDeadband(100, 70, DEAD)).toBe(100) // only 30px up, under deadband
  })

  it('honors a large backward move (real backtrack / restart)', () => {
    expect(applyBackwardDeadband(100, 20, DEAD)).toBe(20) // 80px up, over deadband
  })

  it('treats an unchanged target as forward (passes through)', () => {
    expect(applyBackwardDeadband(100, 100, DEAD)).toBe(100)
  })
})
