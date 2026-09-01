import { describe, it, expect } from 'vitest'
import type { ScriptDoc } from '../model/document'
import { paragraphJumpTargets, previousParagraphIndex } from './paragraphJumps'

const text = (t: string) => ({ type: 'text' as const, runs: [{ text: t }] })
const blank = { type: 'text' as const, runs: [] }
const mark = { type: 'section' as const }
const doc = (...blocks: ScriptDoc['blocks']): ScriptDoc => ({ blocks })

describe('paragraphJumpTargets', () => {
  it('lands on the first word AFTER each marker, and always includes the top', () => {
    // words:  0 1 2 | 3 4 | 5 6
    const d = doc(text('a b c'), mark, text('d e'), mark, text('f g'))
    expect(paragraphJumpTargets(d)).toEqual([0, 3, 5])
  })

  it('drops a trailing marker that has no words after it', () => {
    const d = doc(text('a b'), mark)
    expect(paragraphJumpTargets(d)).toEqual([0])
  })

  it('is unaffected by pause blocks, which carry no words', () => {
    const d = doc(text('a b'), { type: 'pause' }, mark, text('c d'))
    expect(paragraphJumpTargets(d)).toEqual([0, 2])
  })

  it('collapses two adjacent markers to one target', () => {
    const d = doc(text('a b'), mark, mark, text('c'))
    expect(paragraphJumpTargets(d)).toEqual([0, 2])
  })

  describe('fallback when the script has no markers', () => {
    it('uses every text block start, so the command never feels dead', () => {
      const d = doc(text('a b'), text('c'), text('d e'))
      expect(paragraphJumpTargets(d)).toEqual([0, 2, 3])
    })

    it('de-duplicates blank blocks, which contribute no words', () => {
      const d = doc(text('a b'), blank, blank, text('c d'))
      expect(paragraphJumpTargets(d)).toEqual([0, 2])
    })

    it('returns just the top for a single-block script', () => {
      expect(paragraphJumpTargets(doc(text('a b c')))).toEqual([0])
    })

    it('handles an empty doc', () => {
      expect(paragraphJumpTargets(doc())).toEqual([])
    })
  })
})

describe('previousParagraphIndex', () => {
  const targets = [0, 10, 20, 30]

  it('mid-paragraph goes to the top of the paragraph you are in', () => {
    expect(previousParagraphIndex(targets, 25)).toBe(20)
  })

  it('SAYING IT AGAIN goes to the paragraph before — the two-stage rule', () => {
    // This is the whole feature: the first command restarts the beat, a second one
    // steps back a beat. It works because reanchorTo leaves the matcher exactly on
    // the target the first command returned.
    const first = previousParagraphIndex(targets, 25)
    expect(first).toBe(20)
    expect(previousParagraphIndex(targets, first!)).toBe(10)
  })

  it('treats being within tolerance of the start as being at the start', () => {
    // The matcher advances a word or two while the glide travels; that must not be
    // read as "mid-paragraph" or the command would stick and never step back.
    expect(previousParagraphIndex(targets, 22)).toBe(10)
    expect(previousParagraphIndex(targets, 23)).toBe(10)
    expect(previousParagraphIndex(targets, 24)).toBe(20) // past tolerance — restart this one
  })

  it('respects an explicit tolerance', () => {
    expect(previousParagraphIndex(targets, 25, 10)).toBe(10)
    expect(previousParagraphIndex(targets, 25, 0)).toBe(20)
  })

  it('returns null at the very top, so the caller can say so', () => {
    expect(previousParagraphIndex(targets, 0)).toBeNull()
    expect(previousParagraphIndex(targets, 2)).toBeNull()
  })

  it('returns null when there are no targets at all', () => {
    expect(previousParagraphIndex([], 5)).toBeNull()
  })

  it('clamps an index past the end back into the last paragraph', () => {
    expect(previousParagraphIndex(targets, 999)).toBe(30)
  })
})
