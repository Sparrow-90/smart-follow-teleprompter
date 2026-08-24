import type { ButtonHTMLAttributes } from 'react'
import { motion } from 'motion/react'
import { change, press, pressScale } from '../../motion/tokens'
import { cn } from './cn'

/**
 * `motion.button` redefines these handlers for its own gesture system, so they have to be
 * dropped from the HTML attribute set or the two definitions collide at the type level.
 * None of them are used by this button.
 */
type CtaButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'style'
>

/**
 * The full-width primary CTA (Continue / Start Prompt): a white pill on dark.
 *
 * Opacity is handed to Framer entirely — the old `hover:`/`active:`/`disabled:` opacity
 * utilities are gone — so the enabled/disabled change and the touch feedback are never
 * driven from two places. Framer resolves precedence tap > hover > animate, and a disabled
 * button receives no pointer events, so the gesture props are inert without a guard.
 */
export function CtaButton({ className, ...props }: CtaButtonProps) {
  return (
    <motion.button
      {...props}
      animate={{ opacity: props.disabled ? 0.4 : 1 }}
      whileHover={{ opacity: 0.9 }}
      whileTap={{ scale: pressScale.large, opacity: 0.85 }}
      transition={{ opacity: change, scale: press }}
      className={cn(
        'w-full rounded-2xl bg-accent px-6 py-4 text-lg font-medium text-accent-fg',
        'disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    />
  )
}
