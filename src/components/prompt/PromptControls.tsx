import { useEffect, useRef } from 'react'
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
  /** Move the script exactly one rendered line back toward the start. */
  onNudgeBack: () => void
  /** Move the script exactly one rendered line on toward the end. */
  onNudgeForward: () => void
  /** The presenter's manual size, 1 = the preset as authored. Shown as a percentage. */
  textScale: number
  onTextSmaller: () => void
  onTextLarger: () => void
  /** False at the ends of the range, so a press with nothing left to give reads as spent. */
  canShrink: boolean
  canGrow: boolean
}

/** Held-button repeat: long enough that a normal press is unmistakably one line. */
const HOLD_DELAY = 450
const HOLD_REPEAT = 180

/**
 * A button that fires once on press and then repeats while held. Repeat is driven from
 * pointerdown rather than click so a held finger keeps moving the script, and is cancelled on
 * up/leave/cancel — a finger sliding off the button must not leave it running.
 */
function HoldButton({
  className,
  label,
  onFire,
  children,
}: {
  className: string
  label: string
  onFire: () => void
  children: React.ReactNode
}) {
  const timers = useRef<{ delay?: number; repeat?: number }>({})
  const stop = () => {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => stop, [])
  return (
    <button
      className={className}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        // The controls sit inside the viewport, which treats any pointerdown as the start of a
        // drag — and starting a drag calls setScrubbing(true), which cancels the very glide this
        // press just began. preventDefault does not stop that; the event has to not reach it.
        e.preventDefault()
        e.stopPropagation()
        onFire()
        timers.current.delay = window.setTimeout(() => {
          timers.current.repeat = window.setInterval(onFire, HOLD_REPEAT)
        }, HOLD_DELAY)
      }}
      onPointerUp={(e) => { e.stopPropagation(); stop() }}
      onPointerLeave={stop}
      onPointerCancel={(e) => { e.stopPropagation(); stop() }}
    >
      {children}
    </button>
  )
}

/*
 * `pressable` carries every transition on these buttons, so there is deliberately no
 * `transition-opacity` here: that utility sets `transition-property: opacity` outright, and
 * because utilities beat components it would replace the list `pressable` defines — the hover
 * fade would survive and the press-scale would silently stop animating.
 */
const iconBtn =
  'pressable flex items-center justify-center rounded-full bg-surface/90 text-fg backdrop-blur ' +
  'hover:opacity-80 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:opacity-40 disabled:hover:opacity-40'

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
  onNudgeBack,
  onNudgeForward,
  textScale,
  onTextSmaller,
  onTextLarger,
  canShrink,
  canGrow,
}: PromptControlsProps) {
  return (
    <div
      data-prompt-chrome
      // Solid, unlike PromptChrome — the opposite call, for the opposite geometry. This cluster
      // shrink-wraps its buttons, so keeping the root live costs only a few hundred px of dead
      // area at the bottom of the screen, and it buys the near-miss: a thumb that misses Play by
      // the 16px gap is swallowed here. Transparent, that press falls through to the script and
      // is read as a tap on it — recentring whatever line is underneath, or, where no line is,
      // dismissing the chrome, which is this whole bug over again.
      className={cn(
        'absolute bottom-10 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-[var(--duration-change)] ease-[var(--ease-change)]',
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

        {/* Nudge: one rendered line per press. Stacked so the row stays short in manual mode,
            which already carries five controls. */}
        <div className="ml-1 flex flex-col gap-1.5">
          <HoldButton
            className={cn(iconBtn, 'h-9 w-12')}
            label="Back one line"
            onFire={onNudgeBack}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </HoldButton>
          <HoldButton
            className={cn(iconBtn, 'h-9 w-12')}
            label="Forward one line"
            onFire={onNudgeForward}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </HoldButton>
        </div>

        {/*
          Text size. Shown in BOTH modes, unlike the speed controls — Smart Follow decides the
          pace, but nothing decides how large the text has to be except the room, so this is the
          presenter's call either way. Plain buttons rather than HoldButtons: a held resize would
          run past the size that was wanted, and there are only ten steps in the whole range.
        */}
        <div className="ml-1 flex flex-col gap-1.5">
          <button
            className={cn(iconBtn, 'h-9 w-12 text-[13px] font-semibold')}
            onClick={onTextLarger}
            disabled={!canGrow}
            aria-label="Larger text"
            title="Larger text"
          >
            A+
          </button>
          <button
            className={cn(iconBtn, 'h-9 w-12 text-[11px] font-semibold')}
            onClick={onTextSmaller}
            disabled={!canShrink}
            aria-label="Smaller text"
            title="Smaller text"
          >
            A−
          </button>
        </div>
      </div>
      {/* Size is always readable, speed only where there is one — the row itself is always
          rendered so the cluster does not change height when Smart Follow is switched on. */}
      <div className="type-numeral mt-3 text-center text-xs text-fg-muted">
        {showSpeed && <span>{speedMultiplier.toFixed(1)}×</span>}
        {showSpeed && <span className="px-2 opacity-50">·</span>}
        <span data-text-scale>{Math.round(textScale * 100)}%</span>
      </div>
    </div>
  )
}
