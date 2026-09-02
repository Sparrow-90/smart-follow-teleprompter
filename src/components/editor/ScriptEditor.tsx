import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  type ScriptDoc,
  PAUSE_GLYPH,
  SECTION_HTML,
  docToHtml,
  escapeHtml,
  isEmptyDoc,
  serializeElement,
} from '../../model/document'
import { reflowPastedSegments, reflowPastedText } from '../../model/reflowPastedText'

export interface ScriptEditorHandle {
  toggleBold: () => void
  insertPause: () => void
  insertSection: () => void
  focus: () => void
}

interface ScriptEditorProps {
  initialDoc: ScriptDoc
  /** Bump to force the editor to re-initialize from initialDoc (e.g. after "New"). */
  resetKey: number
  onChange: (doc: ScriptDoc) => void
  onEmptyChange: (empty: boolean) => void
  /** Reports whether the caret/selection currently sits in bold text. */
  onBoldStateChange?: (active: boolean) => void
}

const PAUSE_INSERT_HTML =
  `<div data-block="pause"><span data-pause="true" contenteditable="false">${PAUSE_GLYPH}</span></div><div><br></div>`

/**
 * The marker plus an empty line for the caret to land on. The trailing line belongs to INSERTION
 * only — `SECTION_HTML` on its own is what `docToHtml` emits and what the paste path puts between
 * paragraphs, where an extra blank line would show as a phantom gap after every marker.
 *
 * **The trailing line is load-bearing; do not tidy it away.** Measured: inserting the bare
 * `SECTION_HTML` leaves the chip as the last node in the document, and since it is
 * `contenteditable="false"` the caret has nowhere to go — every subsequent keystroke is swallowed
 * and the presenter cannot type the paragraph they just marked. With the trailing line, typing
 * lands in it as expected.
 *
 * It does have a cost: pressing Enter on that empty line — the natural "now start the new
 * paragraph" gesture — makes a SECOND empty line, which survives into the document. That used to
 * open a 2.23-line-pitch hole in Prompt Mode and push the next line past the Focus Zone's fade.
 * It no longer can: `promptBlocks.toRenderBlocks` collapses a marker and any blank lines beside it
 * into one gap of exactly one line pitch. The blank line remains visible here, in the editor,
 * where it is the presenter's own and costs nothing.
 */
const SECTION_INSERT_HTML = `${SECTION_HTML}<div><br></div>`

/**
 * A controlled-on-reset contentEditable. It initializes its DOM from `initialDoc`
 * only when mounted or when `resetKey` changes, then reports edits back via `onChange`
 * (debounced). This keeps the caret stable during typing while still letting external
 * actions (New / hydrate) replace the content.
 */
export const ScriptEditor = forwardRef<ScriptEditorHandle, ScriptEditorProps>(
  function ScriptEditor(
    { initialDoc, resetKey, onChange, onEmptyChange, onBoldStateChange },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Kept in a ref so the selectionchange listener below can stay mounted once.
    const boldCallbackRef = useRef(onBoldStateChange)
    useEffect(() => {
      boldCallbackRef.current = onBoldStateChange
    }, [onBoldStateChange])

    /**
     * Recompute the bold indicator — but only while the selection is inside the editor.
     * We deliberately never clear it on blur: tapping a toolbar button moves focus to the
     * header for a moment, and clearing there would make the B button flicker off mid-tap.
     */
    const reportBoldState = () => {
      const el = editorRef.current
      const cb = boldCallbackRef.current
      if (!el || !cb) return
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
      try {
        cb(document.queryCommandState('bold'))
      } catch {
        // Some engines throw when there is no live selection — leave the last known state.
      }
    }

    useEffect(() => {
      document.addEventListener('selectionchange', reportBoldState)
      return () => document.removeEventListener('selectionchange', reportBoldState)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const syncEmptyState = () => {
      const el = editorRef.current
      if (!el) return
      const empty =
        el.textContent?.trim() === '' &&
        el.querySelector('[data-pause],[data-block="section"]') === null
      el.dataset.empty = empty ? 'true' : 'false'
      onEmptyChange(empty)
    }

    // Initialize / reset the editor DOM from the document model.
    useEffect(() => {
      const el = editorRef.current
      if (!el) return
      el.innerHTML = isEmptyDoc(initialDoc) ? '' : docToHtml(initialDoc)
      syncEmptyState()
      boldCallbackRef.current?.(false) // the old selection is gone with the old DOM
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey])

    useImperativeHandle(ref, () => ({
      toggleBold() {
        const el = editorRef.current
        if (!el) return
        el.focus()
        document.execCommand('bold')
        flush()
        reportBoldState()
      },
      insertPause() {
        const el = editorRef.current
        if (!el) return
        el.focus()
        document.execCommand('insertHTML', false, PAUSE_INSERT_HTML)
        flush()
      },
      insertSection() {
        const el = editorRef.current
        if (!el) return
        el.focus()
        document.execCommand('insertHTML', false, SECTION_INSERT_HTML)
        flush()
      },
      focus() {
        editorRef.current?.focus()
      },
    }))

    const flush = () => {
      const el = editorRef.current
      if (!el) return
      syncEmptyState()
      onChange(serializeElement(el))
    }

    const handleInput = () => {
      syncEmptyState()
      reportBoldState()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const el = editorRef.current
        if (el) onChange(serializeElement(el))
      }, 250)
    }

    /**
     * Paste as plain text only — the editor is intentionally not a rich text editor — and undo the
     * line breaks a PDF copy brings with it, which would otherwise land as one paragraph per
     * wrapped line. See reflowPastedText for what it does and, more importantly, what it won't.
     *
     * A paste it *did* reflow is a document whose real paragraph breaks we now know, so each one
     * gets a paragraph marker for free. Everything else — typed text, lists, clean prose — takes
     * the original path untouched, which is the invariant reflowPastedText exists to protect.
     */
    const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      const { segments, reflowed } = reflowPastedSegments(text)
      if (!reflowed || segments.length < 2) {
        document.execCommand('insertText', false, reflowPastedText(text))
        return
      }
      // The marker REPLACES the blank line a paragraph break used to become, rather than joining
      // it — emitting both would give blank line + marker + blank line. A 'line' break (list
      // items) gets no marker at all; only a real paragraph break earns one.
      const html = segments
        .map(
          (seg) =>
            `<div>${escapeHtml(seg.text)}</div>` +
            (seg.breakAfter === 'paragraph' ? SECTION_HTML : ''),
        )
        .join('')
      document.execCommand('insertHTML', false, html)
      flush()
    }

    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }, [])

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Script"
        data-placeholder="Paste or start typing…"
        onInput={handleInput}
        onPaste={handlePaste}
        className="script-editor h-full w-full resize-none overflow-y-auto text-2xl leading-relaxed text-fg outline-none"
      />
    )
  },
)
