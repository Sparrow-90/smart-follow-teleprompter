import { cn } from '../ui/cn'

interface PromptChromeProps {
  visible: boolean
  onExit: () => void
}

/** Minimal top chrome for Prompt Mode: just Exit (top-left). No Smart Follow badge in Phase 1. */
export function PromptChrome({ visible, onExit }: PromptChromeProps) {
  return (
    <div
      className={cn(
        'absolute top-0 right-0 left-0 z-30 flex items-center justify-between px-5 py-4 transition-opacity duration-300',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
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
    </div>
  )
}
