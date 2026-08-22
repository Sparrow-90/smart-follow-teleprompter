/**
 * The script document model — the single source of truth for a script.
 *
 * The editor serializes the contentEditable DOM *into* this structure, and Prompt
 * Mode renders *from* it. Keeping the source of truth as data (not HTML) makes word
 * counting, rendering, and future Smart Follow tokenization all read the same thing.
 */

export interface Inline {
  text: string
  bold?: boolean
}

export type Block =
  | { type: 'text'; runs: Inline[] }
  | { type: 'pause' }

export interface ScriptDoc {
  blocks: Block[]
}

/** The three-dot glyph shown for a PAUSE marker. */
export const PAUSE_GLYPH = '• • •'

/** HTML for a PAUSE block in the editor: a non-editable chip inside its own line. */
const PAUSE_HTML =
  `<div data-block="pause"><span data-pause="true" contenteditable="false">${PAUSE_GLYPH}</span></div>`

const BLOCK_TAGS = new Set(['DIV', 'P'])

export function emptyDoc(): ScriptDoc {
  return { blocks: [] }
}

export function isEmptyDoc(doc: ScriptDoc): boolean {
  return !doc.blocks.some((b) =>
    b.type === 'pause' ? true : b.runs.some((r) => r.text.trim().length > 0),
  )
}

export function wordCount(doc: ScriptDoc): number {
  let n = 0
  for (const block of doc.blocks) {
    if (block.type !== 'text') continue
    const text = block.runs.map((r) => r.text).join('')
    n += text.trim().split(/\s+/).filter(Boolean).length
  }
  return n
}

export function docToPlainText(doc: ScriptDoc): string {
  return doc.blocks
    .map((b) => (b.type === 'pause' ? PAUSE_GLYPH : b.runs.map((r) => r.text).join('')))
    .join('\n')
}

export function plainTextToDoc(text: string): ScriptDoc {
  const blocks: Block[] = text.split('\n').map((line) => ({
    type: 'text',
    runs: line === '' ? [] : [{ text: line }],
  }))
  return { blocks }
}

/** DOM → model. Also the sanitizer: only text, bold, and pause markers survive. */
export function serializeElement(root: HTMLElement): ScriptDoc {
  const blocks: Block[] = []
  let runs: Inline[] = []
  let opened = false

  const pushRun = (text: string, bold: boolean) => {
    if (!text) return
    runs.push(bold ? { text, bold: true } : { text })
    if (text.length) opened = true
  }

  const hasPending = () => opened || runs.length > 0

  const flushText = () => {
    blocks.push({ type: 'text', runs: normalizeRuns(runs) })
    runs = []
    opened = false
  }

  // Walk inline content, accumulating runs; returns how many pause blocks it emitted.
  const walkInline = (node: Node, bold: boolean): number => {
    let pauses = 0
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pushRun(child.textContent ?? '', bold)
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE') return
        if (isPauseEl(el)) {
          if (hasPending()) flushText()
          blocks.push({ type: 'pause' })
          pauses++
          return
        }
        if (tag === 'BR') return // ignore breaks inside a line (our lines are block-per-line)
        pauses += walkInline(el, bold || isBoldEl(el))
      }
    })
    return pauses
  }

  const processBlock = (el: HTMLElement) => {
    if (hasPending()) flushText()
    if (isPauseEl(el)) {
      blocks.push({ type: 'pause' })
      return
    }
    const pauses = walkInline(el, isBoldEl(el))
    if (hasPending()) {
      flushText()
    } else if (pauses === 0) {
      // A genuinely empty line (e.g. <div><br></div>) — preserve the spacing.
      // (A block that only held a pause emits nothing extra here.)
      blocks.push({ type: 'text', runs: [] })
    }
  }

  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushRun(node.textContent ?? '', false)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return
      if (isPauseEl(el)) {
        if (hasPending()) flushText()
        blocks.push({ type: 'pause' })
      } else if (BLOCK_TAGS.has(tag)) {
        processBlock(el)
      } else if (tag === 'BR') {
        if (hasPending()) flushText()
        else blocks.push({ type: 'text', runs: [] })
      } else {
        walkInline(el, isBoldEl(el))
      }
    }
  })
  if (hasPending()) flushText()

  return { blocks }
}

/** model → HTML string, used to initialize the contentEditable editor. */
export function docToHtml(doc: ScriptDoc): string {
  return doc.blocks
    .map((block) => {
      if (block.type === 'pause') return PAUSE_HTML
      const inner =
        block.runs.length === 0
          ? '<br>'
          : block.runs
              .map((r) =>
                r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text),
              )
              .join('')
      return `<div>${inner}</div>`
    })
    .join('')
}

// --- helpers ---------------------------------------------------------------

/** True only when the element *itself* is a pause marker — never merely contains one. */
function isPauseEl(el: HTMLElement): boolean {
  return el.dataset?.pause != null || el.getAttribute('data-block') === 'pause'
}

function isBoldEl(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'STRONG' || tag === 'B') return true
  const fw = el.style?.fontWeight
  if (fw === 'bold' || fw === 'bolder') return true
  const n = parseInt(fw ?? '', 10)
  return !Number.isNaN(n) && n >= 600
}

/** Merge adjacent runs of the same weight and drop empty text. */
function normalizeRuns(runs: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const r of runs) {
    if (r.text === '') continue
    const bold = !!r.bold
    const last = out[out.length - 1]
    if (last && !!last.bold === bold) {
      last.text += r.text
    } else {
      out.push(bold ? { text: r.text, bold: true } : { text: r.text })
    }
  }
  return out
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
