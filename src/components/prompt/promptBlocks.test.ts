import { describe, it, expect } from 'vitest'
import type { ScriptDoc } from '../../model/document'
import { toRenderBlocks } from './promptBlocks'

/**
 * A gap between two lines of script is dead space the presenter has to read across. It is bounded
 * by how much runway the Focus Zone leaves below the anchor — about 2.4 line pitches at any
 * viewport, because resolvePreset scales text by the tighter axis and so the ratio is invariant.
 *
 * Measured before this module existed: a paragraph marker cost 0.93 pitches, a blank line 1.60,
 * and a marker with a blank line beside it 2.23 — which put the next line 3.23 pitches down, past
 * the fade and at the bottom edge of the screen. This transform is what caps that.
 */

const line = (text: string) => ({ type: 'text' as const, runs: [{ text }] })
const blank = { type: 'text' as const, runs: [] }
const spaces = { type: 'text' as const, runs: [{ text: '   ' }] }
const section = { type: 'section' as const }
const pause = { type: 'pause' as const }
const doc = (...blocks: ScriptDoc['blocks']): ScriptDoc => ({ blocks })

const kinds = (d: ScriptDoc) => toRenderBlocks(d).map((b) => b.kind)

describe('toRenderBlocks', () => {
  it('passes ordinary text through untouched', () => {
    const items = toRenderBlocks(doc(line('one'), line('two')))
    expect(items).toEqual([
      { kind: 'text', block: line('one') },
      { kind: 'text', block: line('two') },
    ])
  })

  it('keeps a lone marker as one gap', () => {
    expect(kinds(doc(line('a'), section, line('b')))).toEqual(['text', 'gap', 'text'])
  })

  // The shape from the screenshot that started this: the toolbar's marker leaves the caret on a
  // trailing empty line, and pressing Enter — "now start the new paragraph" — makes a second one.
  it('collapses a marker and the blank line beside it into ONE gap', () => {
    expect(kinds(doc(line('a'), section, blank, line('b')))).toEqual(['text', 'gap', 'text'])
    expect(kinds(doc(line('a'), blank, section, line('b')))).toEqual(['text', 'gap', 'text'])
  })

  it('collapses a run of blank lines into one gap', () => {
    expect(kinds(doc(line('a'), blank, blank, blank, line('b')))).toEqual(['text', 'gap', 'text'])
  })

  it('treats a whitespace-only line as blank', () => {
    expect(kinds(doc(line('a'), spaces, line('b')))).toEqual(['text', 'gap', 'text'])
  })

  it('collapses adjacent markers, keeping the LAST number reached', () => {
    // Two markers in a row open sections 2 and 3; only one rule is drawn, and it must carry the
    // number of the section actually being entered, or everything after it reads one behind.
    const items = toRenderBlocks(doc(line('a'), section, section, line('b')))
    expect(items).toHaveLength(3)
    expect(items[1]).toMatchObject({ kind: 'gap', section: 3 })
  })

  it('numbers markers as the section they OPEN, counting the top of the script as 1', () => {
    const items = toRenderBlocks(doc(line('a'), section, line('b'), section, line('c')))
    expect(items.filter((b) => b.kind === 'gap').map((b) => b.section)).toEqual([2, 3])
  })

  it('does not let a collapsed run lose a marker from the count', () => {
    // The blank lines vanish; the numbering must not.
    const items = toRenderBlocks(doc(line('a'), section, blank, line('b'), blank, section, line('c')))
    expect(items.filter((b) => b.kind === 'gap').map((b) => b.section)).toEqual([2, 3])
  })

  it('keeps BOTH signals when a marker and a pause share a run', () => {
    // A pause is a reading instruction, a marker is a bookmark — they are not interchangeable, so
    // the one surviving gap carries both rather than dropping either.
    const items = toRenderBlocks(doc(line('a'), section, pause, line('b')))
    expect(items).toHaveLength(3)
    expect(items[1]).toMatchObject({ kind: 'gap', section: 2, pause: true })
  })

  it('carries a lone pause with no section number', () => {
    const items = toRenderBlocks(doc(line('a'), pause, line('b')))
    expect(items[1]).toMatchObject({ kind: 'gap', section: null, pause: true })
  })

  it('marks a plain blank run as neither', () => {
    const items = toRenderBlocks(doc(line('a'), blank, line('b')))
    expect(items[1]).toMatchObject({ kind: 'gap', section: null, pause: false })
  })

  it('keeps a run at the very top and the very end of the document', () => {
    // Leading and trailing space is the presenter's, and costs nothing at either end: the text
    // already opens at 40vh and closes at 60vh of padding.
    expect(kinds(doc(section, line('a'), section))).toEqual(['gap', 'text', 'gap'])
    expect(kinds(doc(blank, line('a'), blank))).toEqual(['gap', 'text', 'gap'])
  })

  it('returns nothing for an empty document', () => {
    expect(toRenderBlocks(doc())).toEqual([])
  })
})
