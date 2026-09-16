import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { travel } from '../motion/tokens'
import { type ScriptDoc, isEmptyDoc } from '../model/document'
import { ScriptEditor, type ScriptEditorHandle } from '../components/editor/ScriptEditor'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { Wordmark } from '../components/ui/Wordmark'
import { CtaButton } from '../components/ui/CtaButton'
import { SocialLinks } from '../components/ui/SocialLinks'
import { AppVersion } from '../components/ui/AppVersion'

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
        {/* The lockup, matched to Figma node 4771:414: a 168x19 mark over the byline, 4px apart,
            both flush LEFT. Figma's frame is `items-start` and the byline (163px) is narrower than
            the mark (168px), so centring it — which is what this did while the mark carried its
            reflection — sits it 2.5px right of where the design puts it. */}
        <div className="flex flex-col items-start">
          <Wordmark className="h-[19px] w-[168px] text-fg" />
          {/* Byline, Figma node 4877:604: Urbanist Light 10/20, 5px tracking, `color/lime/300`.
              `capitalize` is Figma's too — it renders the stored "by" as "By". The lime is a
              token (see --color-byline in index.css) because it is legible on one theme only.

              The -2px is what buys Figma's 4px gap, and it is measured, not guessed. Figma trims
              the text box to cap-height (its text node is 7px tall, not 20), so its 4px is
              mark-bottom to CAP-top. A 10/20 line box here puts the cap top 6px below its own
              top: Urbanist is ascent 0.9em / descent 0.3em / cap 0.7em, so half-leading is
              (20 − 12) / 2 = 4 and the baseline sits at 13, putting the cap at 6. 4 − 6 = −2.
              Doing it this way rather than with `text-box-trim` is deliberate: that property
              needs Safari 18.2 / Chrome 133, and this app targets an iPad and a budget Android
              tablet. Font metrics are the font's own, so this number holds in every browser —
              but it IS tied to Urbanist at 10/20. Re-measure if any of those three move. */}
          <span className="font-byline -mt-[2px] text-[10px] leading-5 font-light tracking-[5px] text-byline capitalize">
            by Mateusz Wróbel
          </span>
        </div>
        <EditorToolbar
          boldActive={boldActive}
          onNew={handleNew}
          onBold={() => editorRef.current?.toggleBold()}
          onPause={() => editorRef.current?.insertPause()}
          onSection={() => editorRef.current?.insertSection()}
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
        {/* THE COLOPHON — the author's accounts and which build this is.

            In the footer rather than beside the byline, and it buys two things that placement
            could not. It no longer shares a line with the byline, so the -2px above (measured off
            Urbanist's metrics to buy Figma's 4px mark-to-cap gap) is back on the span where
            nothing can disturb it — the header is byte-for-byte what it was. And the full width
            under a full-width CTA means it fits at EVERY viewport: on the byline it needed 290px
            against a 390px header's 342px, which forced it to hide below `sm`. Nothing hides here.

            `justify-center` under a full-width button is the conventional footer treatment, and
            unlike the header's centre — where the same group floated between the lockup and the
            toolbar with no relationship to either — this one is anchored to the CTA above it. */}
        <div data-colophon className="mt-4 flex items-center justify-center gap-3">
          <SocialLinks />
          <span aria-hidden className="text-[10px] leading-5 text-fg-faint">
            ·
          </span>
          <AppVersion />
        </div>
      </footer>
    </div>
  )
}
