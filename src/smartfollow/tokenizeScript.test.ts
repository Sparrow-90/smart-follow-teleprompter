import { describe, it, expect } from 'vitest'
import type { ScriptDoc } from '../model/document'
import { normalizeWord, tokenizePhrase, tokenizeScript } from './tokenizeScript'

describe('normalizeWord', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeWord('Premier,')).toBe('premier')
    expect(normalizeWord('"Nowy"')).toBe('nowy')
    expect(normalizeWord('...')).toBe('')
  })

  it('folds Polish diacritics to ASCII', () => {
    expect(normalizeWord('Państwa')).toBe('panstwa')
    expect(normalizeWord('mieszkaniowy')).toBe('mieszkaniowy')
    expect(normalizeWord('Zażółć')).toBe('zazolc')
    expect(normalizeWord('Łódź')).toBe('lodz')
  })
})

describe('tokenizePhrase', () => {
  it('splits into normalized words, dropping empties', () => {
    expect(tokenizePhrase('Dziś rano premier,  przedstawił…')).toEqual([
      'dzis',
      'rano',
      'premier',
      'przedstawil',
    ])
  })

  it('returns [] for blank input', () => {
    expect(tokenizePhrase('   ')).toEqual([])
  })
})

describe('tokenizeScript', () => {
  const doc: ScriptDoc = {
    blocks: [
      { type: 'text', runs: [{ text: 'Dzisiaj premier ' }, { text: 'przedstawił', bold: true }] },
      { type: 'pause' },
      { type: 'text', runs: [{ text: 'Nowy program.' }] },
    ],
  }

  it('flattens words in order with global indices', () => {
    const tokens = tokenizeScript(doc)
    expect(tokens.map((t) => t.text)).toEqual(['dzisiaj', 'premier', 'przedstawil', 'nowy', 'program'])
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('assigns lineIndex counting text lines only (pause blocks skipped)', () => {
    const tokens = tokenizeScript(doc)
    // first three words are line 0; after the pause, "Nowy program" is line 1 (not 2)
    expect(tokens.map((t) => t.lineIndex)).toEqual([0, 0, 0, 1, 1])
  })

  it('ignores empty text blocks and pauses', () => {
    const d: ScriptDoc = {
      blocks: [
        { type: 'text', runs: [] },
        { type: 'text', runs: [{ text: 'Hello world' }] },
      ],
    }
    const tokens = tokenizeScript(d)
    expect(tokens.map((t) => t.text)).toEqual(['hello', 'world'])
    // the empty text block still counts as a line, so "Hello world" is line 1
    expect(tokens.every((t) => t.lineIndex === 1)).toBe(true)
  })
})
