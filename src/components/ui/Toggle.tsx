import { useState } from 'react'
import { motion } from 'motion/react'
import { press, travel } from '../../motion/tokens'
import { cn } from './cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  /** Optional hint shown next to the switch (e.g. "Coming soon"). */
  hint?: string
}

/** Knob travel in px: the 3rem track, less the 1.25rem knob and its 0.25rem inset either side. */
const KNOB_TRAVEL = 20

/**
 * A labeled on/off switch row. Uses a real checkbox for keyboard + a11y.
 *
 * The knob is driven by the `checked` prop through Framer rather than by the CSS
 * `peer-checked:` selector, so it springs across instead of sliding linearly — and it
 * stretches toward its destination while held, the way an iOS switch does. Framer owns
 * `transform`; CSS keeps every colour, since Framer cannot interpolate `var(--color-…)`
 * and nothing should be driven from two places at once.
 */
export function Toggle({ checked, onChange, label, disabled, hint }: ToggleProps) {
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)

  return (
    <label
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={release}
      // Without cancel/leave, dragging off the row leaves the knob stuck mid-stretch.
      onPointerCancel={release}
      onPointerLeave={release}
      className={cn(
        'flex items-center justify-between gap-4 py-3',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      )}
    >
      <span className="flex items-baseline gap-3">
        <span className="text-xs font-medium tracking-wide uppercase text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            'h-7 w-12 rounded-full border border-border bg-surface transition-colors',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          )}
        />
        <motion.span
          aria-hidden
          // One animate object, so there is no variant propagation to depend on: a child
          // that sets its own `animate` target would never receive a parent's `whileTap`.
          animate={{ x: checked ? KNOB_TRAVEL : 0, scaleX: pressed ? 1.15 : 1 }}
          // The stretch rides the quick press curve; the travel keeps the softer spring.
          transition={{ x: travel, scaleX: press }}
          // Anchored to the side it is leaving, so the stretch reaches toward where it goes.
          style={{ transformOrigin: checked ? 'right' : 'left' }}
          className={cn(
            'pointer-events-none absolute top-1 left-1 h-5 w-5 rounded-full bg-fg transition-colors',
            'peer-checked:bg-accent-fg',
          )}
        />
      </span>
    </label>
  )
}
