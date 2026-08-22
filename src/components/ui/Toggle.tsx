import { cn } from './cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  /** Optional hint shown next to the switch (e.g. "Coming soon"). */
  hint?: string
}

/** A labeled on/off switch row. Uses a real checkbox for keyboard + a11y. */
export function Toggle({ checked, onChange, label, disabled, hint }: ToggleProps) {
  return (
    <label
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
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1 left-1 h-5 w-5 rounded-full bg-fg transition-transform',
            'peer-checked:translate-x-5 peer-checked:bg-accent-fg',
          )}
        />
      </span>
    </label>
  )
}
