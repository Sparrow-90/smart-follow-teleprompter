import { cn } from '../ui/cn'

interface PromptControlsProps {
  visible: boolean
  playing: boolean
  speedMultiplier: number
  /** Show slower/faster + speed (manual mode). Hidden for Smart Follow, which has no speed. */
  showSpeed?: boolean
  onRestart: () => void
  onSlower: () => void
  onPlayPause: () => void
  onFaster: () => void
}

const iconBtn =
  'flex items-center justify-center rounded-full bg-surface/90 text-fg backdrop-blur ' +
  'transition-opacity hover:opacity-80 active:opacity-70 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Floating bottom-centre control cluster: slower / play-pause / faster. Auto-hides. */
export function PromptControls({
  visible,
  playing,
  speedMultiplier,
  showSpeed = true,
  onRestart,
  onSlower,
  onPlayPause,
  onFaster,
}: PromptControlsProps) {
  return (
    <div
      className={cn(
        'absolute bottom-10 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-300',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex items-center gap-4">
        <button
          className={cn(iconBtn, 'h-12 w-12')}
          onClick={onRestart}
          aria-label="Restart"
          title="Restart (back to top)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {showSpeed && (
          <button
            className={cn(iconBtn, 'h-14 w-14 text-2xl')}
            onClick={onSlower}
            aria-label="Slower"
          >
            −
          </button>
        )}

        <button
          className={cn(iconBtn, 'h-20 w-20')}
          onClick={onPlayPause}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.5-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
            </svg>
          )}
        </button>

        {showSpeed && (
          <button
            className={cn(iconBtn, 'h-14 w-14 text-2xl')}
            onClick={onFaster}
            aria-label="Faster"
          >
            +
          </button>
        )}
      </div>
      {showSpeed && (
        <div className="mt-3 text-center text-xs tracking-wide text-fg-muted tabular-nums">
          {speedMultiplier.toFixed(1)}×
        </div>
      )}
    </div>
  )
}
