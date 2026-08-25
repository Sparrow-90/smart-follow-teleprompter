import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { travel } from '../motion/tokens'
import { type ScriptDoc, isEmptyDoc } from '../model/document'
import { ScriptEditor, type ScriptEditorHandle } from '../components/editor/ScriptEditor'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { Wordmark } from '../components/ui/Wordmark'
import { CtaButton } from '../components/ui/CtaButton'

export function EditorScreen() {
  const setScriptDoc = useStore((s) => s.setScriptDoc)
  const clearScript = useStore((s) => s.clearScript)
  const goTo = useStore((s) => s.goTo)

  const editorRef = useRef<ScriptEditorHandle>(null)
  const [resetKey, setResetKey] = useState(0)
  const [undo, setUndo] = useState<ScriptDoc | null>(null)
  const [boldActive, setBoldActive] = useState(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The script is read once, not subscribed to: App gates this screen on `hydrated`, and
  // nothing here re-renders on edits. Both reads below are one-shot initializers.
  const [empty, setEmpty] = useState(() => isEmptyDoc(useStore.getState().scriptDoc))
  const initialDocRef = useRef(useStore.getState().scriptDoc)

  const handleNew = () => {
    const previous = clearScript()
    if (!isEmptyDoc(previous)) {
      setUndo(previous)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndo(null), 6000)
    }
    initialDocRef.current = { blocks: [] }
    setResetKey((k) => k + 1)
    setEmpty(true)
    editorRef.current?.focus()
  }

  const handleUndo = () => {
    if (!undo) return
    setScriptDoc(undo)
    initialDocRef.current = undo
    setResetKey((k) => k + 1)
    setEmpty(isEmptyDoc(undo))
    setUndo(null)
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 pt-5 sm:px-10">
        <header className="flex shrink-0 items-center justify-between gap-4">
        {/* The lockup, matched to Figma node 4771:414. Items are centred so the byline centres
            under the mark; the lockup as a whole still sits left in the header. */}
        <div className="flex flex-col items-center">
          <Wordmark className="h-[49px] w-[176px] text-fg" />
          {/* Byline, Figma node 4877:604: Urbanist Light 10/20, 5.3px tracking, #6a7282.
              `capitalize` is Figma's too — it renders the stored "by" as "By".

              The grey is Figma's literal brand value rather than a theme token, and that is a
              measured trade, not an oversight: it is 4.84:1 on the light background but only
              4.09:1 on the dark one, short of the 4.5:1 WCAG AA wants for 10px text. Kept because
              the wordmark lockup was specified 1:1 and this is a decorative byline, not content.
              `text-fg-muted` (7.66:1 on dark) is the accessible alternative if that changes. */}
          <span className="font-byline text-[10px] leading-5 font-light tracking-[5.3px] text-[#6a7282] capitalize">
            by Mateusz Wróbel
          </span>
        </div>
        <EditorToolbar
          boldActive={boldActive}
          onNew={handleNew}
          onBold={() => editorRef.current?.toggleBold()}
          onPause={() => editorRef.current?.insertPause()}
        />
      </header>

        <main className="mt-8 min-h-0 flex-1">
          <ScriptEditor
            ref={editorRef}
            initialDoc={initialDocRef.current}
            resetKey={resetKey}
            onChange={setScriptDoc}
            onEmptyChange={setEmpty}
            onBoldStateChange={setBoldActive}
          />
        </main>
      </div>

      <footer className="relative mx-auto w-full max-w-5xl shrink-0 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-10">
        {/* It used to blink in and blink out; it should rise into place and sink away. */}
        <AnimatePresence>
          {undo && (
            <motion.div
              className="absolute -top-16 right-0 left-0 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={travel}
            >
              <span className="text-sm text-fg-muted">Script cleared.</span>
              <button
                onClick={handleUndo}
                className="text-sm font-medium text-fg underline underline-offset-2 hover:opacity-80"
              >
                Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <CtaButton disabled={empty} onClick={() => goTo('setup')}>
          Continue
        </CtaButton>
      </footer>
    </div>
  )
}
