import { useId } from 'react'
import { motion } from 'motion/react'
import { travel } from '../../motion/tokens'
import { cn } from './cn'

interface Segment<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: Segment<T>[]
  onChange: (value: T) => void
  ariaLabel: string
}

/**
 * A single-select segmented control (used for the reading-distance presets).
 *
 * The selection is a single pill that physically slides between segments — one element
 * shared across all of them via `layoutId`, so Framer animates it from the old segment's
 * box to the new one. No press-scale on the buttons: the travelling pill *is* the touch
 * feedback, and a transform on the pill's ancestor mid-flight only risks confusing the
 * layout projection that makes the slide work.
 *
 * The pill is a *raised* tile in the page's own background colour, not an accent fill,
 * which is also what EditorToolbar's pressed state does and why. That is not only for
 * consistency: an inverting pill has no safe label colour while it travels — the label
 * is either dark-on-dark behind it or light-on-light on top of it, and no amount of
 * transition timing fixes a problem that exists at every point along the path. A raised
 * tile keeps every label readable against both the track and the pill, at every frame,
 * with no synchronisation at all. (It is also what iOS segmented controls have done
 * since iOS 13 — the selection is raised, not inverted.)
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  // Per instance, so two controls on one screen never fight over the same pill.
  const pillId = useId()

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex-1 rounded-lg px-4 py-2.5 text-xs font-medium tracking-wide uppercase',
              'transition-colors duration-200 ease-out',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                aria-hidden
                // Handle for scripts/verify-motion.mjs, which measures the pill mid-slide.
                data-pill
                className="absolute inset-0 rounded-lg border border-border bg-bg shadow-sm"
                transition={travel}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
