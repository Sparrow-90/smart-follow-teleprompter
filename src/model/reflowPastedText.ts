/**
 * Undo the line breaks a PDF puts in when you copy out of it.
 *
 * A PDF has no paragraphs — only lines placed on a page. Copying gives a newline at every visual
 * line ending, where the page ran out of width rather than where the writer ended a thought.
 * This editor is block-per-line, so pasted verbatim each of those becomes its own paragraph and
 * the script arrives shredded: short stranded fragments, and no gap where the real break was.
 *
 * The signal that separates the two is NOT punctuation — a sentence can end mid-line, and a
 * wrapped line usually ends mid-sentence. It is width: hard wrapping pushes every line out to
 * roughly the same length *except* the last line of a paragraph. So a line that runs to the
 * prevailing width was wrapped and continues; a noticeably short line that also closes a
 * sentence is where the paragraph really ended.
 */

/** Sentence-closing punctuation, optionally followed by a closing quote or bracket. */
const SENTENCE_END = /[.!?…:][")»”’'\]]?$/u
/** A list marker: these always start their own paragraph. */
const BULLET = /^([-–—•*·]|\d+[.)])\s+/u
const PARAGRAPH = '\n\n'
const LINE = '\n'
/** A word broken across a line ending, e.g. `teleprom-` + `pter`. */
const HYPHEN_BREAK = /\p{L}-$/u

function normalize(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // Soft hyphens and zero-width joiners are invisible here but survive a copy and break
      // word matching later — Smart Follow would never find these words in the script.
      .replace(/[­​-‍﻿]/g, '')
      // Every flavour of fixed-width space PDFs use for justification.
      .replace(/[  -   　]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ +$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
  )
}

/**
 * Only reflow text that actually looks hard-wrapped. Something typed here, a short note, or a
 * list of one-line items must come back untouched — joining those would be the same vandalism
 * in the other direction.
 */
function looksHardWrapped(lines: string[]): boolean {
  const widths = lines.filter((l) => l !== '').map((l) => l.length)
  if (widths.length < 3) return false
  const max = Math.max(...widths)
  if (max < 40) return false
  const sorted = [...widths].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  // Wrapped lines cluster near the full width; a list or a poem does not.
  return median >= max * 0.6
}

export function reflowPastedText(raw: string): string {
  const text = normalize(raw)
  if (!text.includes('\n')) return text

  const lines = text.split('\n').map((l) => l.trim())
  if (!looksHardWrapped(lines)) return text

  const max = Math.max(...lines.filter((l) => l !== '').map((l) => l.length))
  // Short enough to have been the end of a paragraph rather than a wrap. Deliberately strict:
  // a line only ends a paragraph if it is *noticeably* short, so a sentence that happens to
  // finish near the right margin still reads as wrapped.
  const isShort = (line: string) => line.length <= max * 0.92
  const startsSomethingNew = (line: string) => {
    const c = line[0]
    return c !== c.toLowerCase() || /[0-9„“"'«(\-–—]/u.test(c)
  }

  // Chunks and the separators between them. Paragraphs are parted by a blank line, the way the
  // source showed them; list items only by a newline, because a double-spaced list is its own
  // kind of mangling.
  const chunks: string[] = []
  let buf = ''
  let pendingSep = ''
  const flush = (sep: string) => {
    if (!buf) return
    if (chunks.length) chunks.push(pendingSep)
    chunks.push(buf)
    pendingSep = sep
    buf = ''
  }

  lines.forEach((line, i) => {
    if (line === '') {
      // A blank line is the one break the source states outright. Always honour it.
      flush(PARAGRAPH)
      return
    }
    if (buf && BULLET.test(line)) flush(LINE)

    if (!buf) buf = line
    else if (HYPHEN_BREAK.test(buf) && /^\p{Ll}/u.test(line)) buf = buf.slice(0, -1) + line
    else buf += ' ' + line

    const next = lines[i + 1]
    if (!next) return
    if (BULLET.test(next)) flush(LINE)
    else if (SENTENCE_END.test(line) && isShort(line) && startsSomethingNew(next)) flush(PARAGRAPH)
  })
  flush('')

  return chunks.join('')
}
