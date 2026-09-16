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
          {/* THE COLOPHON ROW — the byline, the author's accounts, and which build this is.

              The -2px is what buys Figma's 4px gap, and it is measured, not guessed. Figma trims
              the text box to cap-height (its text node is 7px tall, not 20), so its 4px is
              mark-bottom to CAP-top. A 10/20 line box here puts the cap top 6px below its own
              top: Urbanist is ascent 0.9em / descent 0.3em / cap 0.7em, so half-leading is
              (20 − 12) / 2 = 4 and the baseline sits at 13, putting the cap at 6. 4 − 6 = −2.
              Doing it this way rather than with `text-box-trim` is deliberate: that property
              needs Safari 18.2 / Chrome 133, and this app targets an iPad and a budget Android
              tablet. Font metrics are the font's own, so this number holds in every browser —
              but it IS tied to Urbanist at 10/20. Re-measure if any of those three move.

              It now sits on the ROW rather than on the byline span, and that only stays correct
              while the row is exactly 20px tall: `items-center` recentres every child against the
              tallest one, so a single child with a taller line box drops the byline and the
              derivation above silently stops describing the screen. Which is why the separators
              carry `text-[10px] leading-5` and are not bare — a plain <span>·</span> inherits
              body 14px at line-height 1.5, which is a 21px box, and one pixel is enough.
              `verify-colophon.mjs` pins both the height and the resulting 4px gap. */}
          <div data-colophon className="-mt-[2px] flex items-center gap-3">
            {/* Byline, Figma node 4877:604: Urbanist Light 10/20, 5px tracking, `color/lime/300`.
                `capitalize` is Figma's too — it renders the stored "by" as "By". The lime is a
                token (see --color-byline in index.css) because it is legible on one theme only.

                The negative margin-inline-end is the same correction `.type-label` makes for
                itself: 5px of tracking is applied after the final letter too, so the byline ends
                with 5px of air that would read as uneven slack before the separator. Pull the box
                back in by exactly the tracking and `gap-3` does the real spacing. */}
            <span className="font-byline text-[10px] leading-5 font-light tracking-[5px] text-byline capitalize [margin-inline-end:-5px]">
              by Mateusz Wróbel
            </span>
            {/* Hidden below `sm`, and that is a MEASUREMENT rather than a taste for tidy phones.
                The colophon needs 290px and the toolbar 215px; a 390px header has 342px to give,
                so all three cannot share a line and the byline wraps to three. It first fits at
                640px — which is `sm`, the breakpoint this header already changes its padding on.
                Below it the header is over budget with or without this row (the mark alone is
                168px against that same 215px toolbar — measured at 57px of overflow on `main`
                too), so hiding these restores exactly what the screen did before they existed
                rather than papering over a new problem. Every target device — iPad portrait at
                768, the Android tablet — is above the line. */}
            <div className="hidden items-center gap-3 sm:flex">
              <span aria-hidden className="text-[10px] leading-5 text-fg-faint">
                ·
              </span>
              <SocialLinks />
              <span aria-hidden className="text-[10px] leading-5 text-fg-faint">
                ·
              </span>
              <AppVersion />
            </div>
          </div>
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
      </footer>
    </div>
  )
}
