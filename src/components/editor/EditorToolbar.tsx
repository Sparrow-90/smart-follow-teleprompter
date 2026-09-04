import { AnimatePresence, motion } from 'motion/react'
import { PAUSE_GLYPH, SECTION_GLYPH } from '../../model/document'
import { press, pressScale, travel } from '../../motion/tokens'
import { cn } from '../ui/cn'

interface EditorToolbarProps {
  /** True while the caret/selection sits in bold text — drives the B button's pressed state. */
  boldActive: boolean
  onNew: () => void
  onBold: () => void
  onPause: () => void
  onSection: () => void
}

/** Shared button shape. `min-h-11` is the ~44pt touch minimum — the primary device is a tablet. */
const button =
  'type-label relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 ' +
  'transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const quiet = 'text-fg-muted hover:text-fg'

/** Touch feedback, a little deeper than the CTA's since these targets are small. */
const tap = { scale: pressScale.small }

/**
 * Header controls for the Script Editor.
 *
 * `New` is the app's only destructive action, so a divider keeps it out of the authoring
 * group. The tools show what they produce rather than naming it: a bold `B`, and the
 * literal pause glyph the presenter will read in Prompt Mode. (Naming the second one "Pause"
 * made it read as a transport control.) The paragraph marker is the one exception — see below.
 */
export function EditorToolbar({ boldActive, onNew, onBold, onPause, onSection }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <motion.button
        className={cn(button, quiet)}
        whileTap={tap}
        transition={press}
        onClick={onNew}
      >
        New
      </motion.button>

      <span aria-hidden className="h-6 w-px shrink-0 bg-border" />

      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
        <motion.button
          className={cn(button, 'font-bold', boldActive ? 'text-fg' : quiet)}
          whileTap={tap}
          transition={press}
          onClick={onBold}
          aria-pressed={boldActive}
          aria-label="Bold selection"
          title="Bold (⌘B)"
        >
          {/*
            The pressed pill grows in place rather than sliding: B and the pause glyph are
            two independent toggles, not one shared selection, so there is nothing for it
            to travel from. A raised pill in the page's own background colour reads clearly
            against the group's `bg-surface` in both themes without shouting.
          */}
          <AnimatePresence>
            {boldActive && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-lg bg-bg"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={travel}
              />
            )}
          </AnimatePresence>
          <span className="relative z-10">B</span>
        </motion.button>

        <motion.button
          className={cn(button, quiet)}
          whileTap={tap}
          transition={press}
          onClick={onPause}
          aria-label="Insert pause"
          title="Insert pause marker"
        >
          {PAUSE_GLYPH}
        </motion.button>

        {/*
          The pause button shows the literal glyph it produces. This one cannot: what it produces
          is a numbered rule across the column, which is illegible at button size. The pilcrow is
          the standard mark for a paragraph and reads instantly instead.
        */}
        <motion.button
          className={cn(button, quiet, 'text-base')}
          whileTap={tap}
          transition={press}
          onClick={onSection}
          aria-label="Insert paragraph marker"
          title="Insert paragraph marker"
        >
          {SECTION_GLYPH}
        </motion.button>
      </div>
    </div>
  )
}
