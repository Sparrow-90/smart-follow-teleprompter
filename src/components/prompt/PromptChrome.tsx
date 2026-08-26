import { cn } from '../ui/cn'

interface PromptChromeProps {
  visible: boolean
  onExit: () => void
  /** Smart Follow status shown top-right (null = nothing, e.g. manual mode). */
  status?: string | null
}

/** Minimal top chrome for Prompt Mode: Exit (top-left) + optional Smart Follow status (top-right). */
export function PromptChrome({ visible, onExit, status }: PromptChromeProps) {
  return (
    <div
      data-prompt-chrome
      // The bar spans the full width but only its button is interactive, so the root stays
      // `pointer-events-none` and hands the live-ness to the button. Left solid, the empty 48px
      // band would swallow every press across the whole screen — see PromptScreen's pointer
      // handlers, which treat anything inside `[data-prompt-chrome]` as not a press on the
      // script. PromptControls goes the other way for the other reason: it shrink-wraps, so
      // there is barely any empty area to give away, and swallowing a near-miss there is a win.
      className={cn(
        'pointer-events-none absolute top-0 right-0 left-0 z-30 flex items-center justify-between px-5 py-4 transition-opacity duration-300',
        visible ? 'opacity-100 [&_button]:pointer-events-auto' : 'opacity-0',
      )}
    >
      <button
        onClick={onExit}
        className="flex items-center gap-2 text-xs font-medium tracking-wide text-fg-muted uppercase transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
        Exit
      </button>
      {status && (
        <span className="text-xs font-medium tracking-wide text-fg-muted tabular-nums">{status}</span>
      )}
    </div>
  )
}
