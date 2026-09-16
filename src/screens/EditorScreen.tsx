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
    <div className="relative flex h-[100dvh] flex-col">
      {/* THE GLASS BAR.

          It hangs off the SCREEN ROOT rather than the max-width column, and that is geometry
          rather than preference: an absolutely positioned element's containing block is the
          nearest positioned ancestor's PADDING box, so `inset-x-0` inside the `px-6` wrapper below
          would start 24px in and then inset its own content a second 24px past the script's. Out
          here the panel is genuinely full-bleed and the inner `max-w-5xl` div puts its content on
          exactly the script's column. `relative` on the root is what makes this the containing
          block instead of App.tsx's animated screen panel.

          It OVERLAYS the editor, which is the whole point: `backdrop-filter` blurs what is painted
          behind an element, and until this moved out of flow nothing ever was. The scrollbar is on
          the contenteditable itself and `<main>` carried `mt-8`, so the scroll viewport began 32px
          BELOW the header and clipped there — a blur of the flat page fill returns the flat page
          fill. Now the script slides under the glass and there is something to blur.
          `ScriptEditor` pays for this with one padding class (`--editor-chrome-h`), nothing more:
          moving the scrollbar to a wrapper instead would have cost `h-full`, which is what makes
          the whole empty area clickable to focus the editor.

          `bg-bg/95` FIRST and the blur tint second — without `backdrop-filter` support the tint has
          to carry all of the contrast on its own, and the target here is a budget Android tablet.
          The `supports-[backdrop-filter]` variant covers the -webkit- spelling too, which is not
          obvious from the source and matters on older iPad Safari: Tailwind v4 emits the gate as
          `@supports ((-webkit-backdrop-filter: var(--tw)) or (backdrop-filter: var(--tw)))`, so a
          prefix-only engine still takes the 68% tint rather than getting the blur AND the opaque
          fallback. Verified in the built CSS, not assumed.
          No bare `transition-*` utility: `@layer base` gives `body *` a transition-property list for
          the theme cross-fade and that property is REPLACED, never merged (see index.css). */}
      <header className="absolute inset-x-0 top-0 z-10">
        {/* THE GLASS PANE, WHICH DELIBERATELY HAS NO CONTENT.

            Reported from an installed PWA on an iPad and confirmed from the screenshot: the
            wordmark, the byline and the toolbar all rendered blurred and washed out while the
            script text directly beneath them stayed crisp. `backdrop-filter` was blurring the
            element's OWN CHILDREN.

            iOS Safari gets the backdrop root wrong when a `backdrop-filter` element sits inside an
            ancestor that is transformed AND clipped — and it does here twice over: App renders each
            screen in a Framer panel carrying an animated `transform`, inside a
            `relative h-[100dvh] overflow-hidden` wrapper. Chromium and headless WebKit both
            composite it correctly, which is why every check passed and the device did not.

            Splitting the pane from the content is the fix, and it is structural rather than a
            workaround to tune: an element with no descendants has nothing of its own to blur,
            whatever an engine decides the backdrop root is. The content is a SIBLING above it.
            `verify-glass.mjs` now asserts the blurred element is childless, because re-merging
            them would look tidier, pass every local check, and only fail on the one device the
            app is for. */}
        <div
          aria-hidden
          className="absolute inset-0 border-b border-border/50 bg-bg/95 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-bg/68"
        />
        <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 pt-[max(1.25rem,var(--safe-top))] pb-4 sm:px-10">
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
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 sm:px-10">
        <main className="min-h-0 flex-1">
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
            nothing can disturb it — the LOCKUP is untouched. (The header around it is not: the
            glass work made it an absolutely positioned panel with an inner max-width wrapper.)
            And the full width
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
