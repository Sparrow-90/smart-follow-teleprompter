import { PAUSE_GLYPH } from '../../model/document'
import { cn } from '../ui/cn'

interface EditorToolbarProps {
  /** True while the caret/selection sits in bold text — drives the B button's pressed state. */
  boldActive: boolean
  onNew: () => void
  onBold: () => void
  onPause: () => void
}

/** Shared button shape. `min-h-11` is the ~44pt touch minimum — the primary device is a tablet. */
const button =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-xs ' +
  'font-medium tracking-wide uppercase transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const quiet = 'text-fg-muted hover:text-fg'

/**
 * Pressed state. A raised pill in the page's own background colour rather than a full accent
 * fill — reads clearly against the group's `bg-surface` in both themes (lighter in light, darker
 * in dark) without shouting across an otherwise quiet header.
 */
const active = 'bg-bg text-fg'

/**
 * Header controls for the Script Editor.
 *
 * `New` is the app's only destructive action, so a divider keeps it out of the authoring
 * group. The two tools show what they produce rather than naming it: a bold `B`, and the
 * literal pause glyph the presenter will read in Prompt Mode. (Naming the second one "Pause"
 * made it read as a transport control.)
 */
export function EditorToolbar({ boldActive, onNew, onBold, onPause }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <button className={cn(button, quiet)} onClick={onNew}>
        New
      </button>

      <span aria-hidden className="h-6 w-px shrink-0 bg-border" />

      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
        <button
          className={cn(button, 'font-bold', boldActive ? active : quiet)}
          onClick={onBold}
          aria-pressed={boldActive}
          aria-label="Bold selection"
          title="Bold (⌘B)"
        >
          B
        </button>
        <button
          className={cn(button, quiet)}
          onClick={onPause}
          aria-label="Insert pause"
          title="Insert pause marker"
        >
          {PAUSE_GLYPH}
        </button>
      </div>
    </div>
  )
}
