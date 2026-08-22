import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  type ScriptDoc,
  PAUSE_GLYPH,
  docToHtml,
  isEmptyDoc,
  serializeElement,
} from '../../model/document'

export interface ScriptEditorHandle {
  toggleBold: () => void
  insertPause: () => void
  focus: () => void
}

interface ScriptEditorProps {
  initialDoc: ScriptDoc
  /** Bump to force the editor to re-initialize from initialDoc (e.g. after "New"). */
  resetKey: number
  onChange: (doc: ScriptDoc) => void
  onEmptyChange: (empty: boolean) => void
}

const PAUSE_INSERT_HTML =
  `<div data-block="pause"><span data-pause="true" contenteditable="false">${PAUSE_GLYPH}</span></div><div><br></div>`

/**
 * A controlled-on-reset contentEditable. It initializes its DOM from `initialDoc`
 * only when mounted or when `resetKey` changes, then reports edits back via `onChange`
 * (debounced). This keeps the caret stable during typing while still letting external
 * actions (New / hydrate) replace the content.
 */
export const ScriptEditor = forwardRef<ScriptEditorHandle, ScriptEditorProps>(
  function ScriptEditor({ initialDoc, resetKey, onChange, onEmptyChange }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const syncEmptyState = () => {
      const el = editorRef.current
      if (!el) return
      const empty = el.textContent?.trim() === '' && el.querySelector('[data-pause]') === null
      el.dataset.empty = empty ? 'true' : 'false'
      onEmptyChange(empty)
    }

    // Initialize / reset the editor DOM from the document model.
    useEffect(() => {
      const el = editorRef.current
      if (!el) return
      el.innerHTML = isEmptyDoc(initialDoc) ? '' : docToHtml(initialDoc)
      syncEmptyState()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey])

    useImperativeHandle(ref, () => ({
      toggleBold() {
        const el = editorRef.current
        if (!el) return
        el.focus()
        document.execCommand('bold')
        flush()
      },
      insertPause() {
        const el = editorRef.current
        if (!el) return
        el.focus()
        document.execCommand('insertHTML', false, PAUSE_INSERT_HTML)
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
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const el = editorRef.current
        if (el) onChange(serializeElement(el))
      }, 250)
    }

    // Paste as plain text only — the editor is intentionally not a rich text editor.
    const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
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
