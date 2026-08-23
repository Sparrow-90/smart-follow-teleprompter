import type { ScriptDoc } from '../model/document'

/**
 * A normalized word from the script, tagged with where it lives so a matched position
 * can be mapped back to a line (and thence to a scroll offset).
 */
export interface ScriptToken {
  /** Normalized comparison form (lowercase, diacritics folded, punctuation stripped). */
  text: string
  /** 0-based index among *text lines* only — maps to the Nth [data-prompter-line] in Prompt Mode. */
  lineIndex: number
  /** 0-based global word index across the whole script. */
  index: number
}

/**
 * Normalize a single word for matching: fold diacritics (ą→a, ł→l, …), lowercase, strip
 * punctuation. Returns '' when nothing remains. Folding makes matching robust to STT engines
 * that omit Polish diacritics.
 */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (ą, ó, ż, …)
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Split raw recognized text into normalized words (empties dropped). */
export function tokenizePhrase(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0)
}

/** Flatten a ScriptDoc into an ordered token stream (pause blocks contribute no words). */
export function tokenizeScript(doc: ScriptDoc): ScriptToken[] {
  const tokens: ScriptToken[] = []
  let lineIndex = 0
  let index = 0
  for (const block of doc.blocks) {
    if (block.type !== 'text') continue // pauses are not lines and contribute no words
    const text = block.runs.map((r) => r.text).join('')
    for (const word of tokenizePhrase(text)) {
      tokens.push({ text: word, lineIndex, index })
      index++
    }
    lineIndex++ // every text block is a line, even an empty one
  }
  return tokens
}
