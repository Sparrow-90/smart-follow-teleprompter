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

/**
 * `section` is a PARAGRAPH MARKER — a bookmark the presenter places to say "this is a beat worth
 * coming back to", which is what "Klik akapit" jumps between. It is deliberately NOT called
 * `paragraph`: every `text` block already renders as a `<p>`, so that name would make this union
 * unreadable. User-facing wording stays "paragraph marker"; the model calls it a section.
 *
 * Like `pause`, it carries no words and is not a line — `tokenizeScript` skips both.
 */
export type Block =
  | { type: 'text'; runs: Inline[] }
  | { type: 'pause' }
  | { type: 'section' }

export interface ScriptDoc {
  blocks: Block[]
}

/** The three-dot glyph shown for a PAUSE marker. */
export const PAUSE_GLYPH = '• • •'

/**
 * The glyph a paragraph marker carries in the DOM. The NUMBER beside it is not stored — it comes
 * from a CSS counter in the editor and from a running count in Prompt Mode, so inserting or
 * deleting a marker renumbers everything after it with no re-serialization.
 */
export const SECTION_GLYPH = '\u00b6'

/** HTML for a PAUSE block in the editor: a non-editable chip inside its own line. */
const PAUSE_HTML =
  `<div data-block="pause"><span data-pause="true" contenteditable="false">${PAUSE_GLYPH}</span></div>`

/**
 * HTML for a paragraph marker block. This is the BARE chip — `docToHtml` emits it and the paste
 * path uses it as a separator between paragraphs. The editor's insert variant
 * (`SECTION_INSERT_HTML` in ScriptEditor) adds a trailing empty line for the caret; that trailing
 * line must never leak in here, or every pasted paragraph would gain a blank line after its marker.
 */
export const SECTION_HTML =
  `<div data-block="section"><span data-section="true" contenteditable="false">${SECTION_GLYPH}</span></div>`

const BLOCK_TAGS = new Set(['DIV', 'P'])

export function emptyDoc(): ScriptDoc {
  return { blocks: [] }
}

export function isEmptyDoc(doc: ScriptDoc): boolean {
  return !doc.blocks.some((b) =>
    b.type !== 'text' ? true : b.runs.some((r) => r.text.trim().length > 0),
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
    .map((b) =>
      b.type === 'pause'
        ? PAUSE_GLYPH
        : b.type === 'section'
          ? SECTION_GLYPH
          : b.runs.map((r) => r.text).join(''),
    )
    .join('\n')
}

export function plainTextToDoc(text: string): ScriptDoc {
  const blocks: Block[] = text.split('\n').map((line) => ({
    type: 'text',
    runs: line === '' ? [] : [{ text: line }],
  }))
  return { blocks }
}

/** DOM → model. Also the sanitizer: only text, bold, pause and paragraph markers survive. */
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

  // Walk inline content, accumulating runs; returns how many marker blocks it emitted.
  const walkInline = (node: Node, bold: boolean): number => {
    let markers = 0
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pushRun(child.textContent ?? '', bold)
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE') return
        const marker = markerTypeOf(el)
        if (marker) {
          if (hasPending()) flushText()
          blocks.push({ type: marker })
          markers++
          return
        }
        if (tag === 'BR') return // ignore breaks inside a line (our lines are block-per-line)
        markers += walkInline(el, bold || isBoldEl(el))
      }
    })
    return markers
  }

  const processBlock = (el: HTMLElement) => {
    if (hasPending()) flushText()
    const marker = markerTypeOf(el)
    if (marker) {
      blocks.push({ type: marker })
      return
    }
    const markers = walkInline(el, isBoldEl(el))
    if (hasPending()) {
      flushText()
    } else if (markers === 0) {
      // A genuinely empty line (e.g. <div><br></div>) — preserve the spacing.
      // (A block that only held a marker emits nothing extra here.)
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
      const marker = markerTypeOf(el)
      if (marker) {
        if (hasPending()) flushText()
        blocks.push({ type: marker })
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
      if (block.type === 'section') return SECTION_HTML
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

/**
 * Which marker block this element *is*, or null. Both marker kinds behave identically everywhere in
 * the serializer — they break the current run of text and emit one block — so they resolve through
 * one helper rather than three parallel pairs of branches.
 */
function markerTypeOf(el: HTMLElement): 'pause' | 'section' | null {
  if (isPauseEl(el)) return 'pause'
  if (isSectionEl(el)) return 'section'
  return null
}

/** True only when the element *itself* is a paragraph marker — never merely contains one. */
function isSectionEl(el: HTMLElement): boolean {
  return el.dataset?.section != null || el.getAttribute('data-block') === 'section'
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

/** Exported for the paste path, which builds its own block HTML around {@link SECTION_HTML}. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
