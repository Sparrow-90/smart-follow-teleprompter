import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { type ScriptDoc, isEmptyDoc } from '../model/document'
import { ScriptEditor, type ScriptEditorHandle } from '../components/editor/ScriptEditor'
import { EditorToolbar } from '../components/editor/EditorToolbar'
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
        <div className="flex flex-col gap-1">
          <span className="text-lg leading-none font-bold tracking-[0.15em] text-fg">PROMPTER</span>
          {/* Muted and small so it sits quietly under the wordmark — but the name keeps its
              capitals; it is a person's name, not a design element to be styled down. */}
          <span className="text-[0.6875rem] leading-none tracking-[0.12em] text-fg-muted">
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
        {undo && (
          <div className="absolute -top-16 right-0 left-0 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="text-sm text-fg-muted">Script cleared.</span>
            <button
              onClick={handleUndo}
              className="text-sm font-medium text-fg underline underline-offset-2 hover:opacity-80"
            >
              Undo
            </button>
          </div>
        )}
        <CtaButton disabled={empty} onClick={() => goTo('setup')}>
          Continue
        </CtaButton>
      </footer>
    </div>
  )
}
