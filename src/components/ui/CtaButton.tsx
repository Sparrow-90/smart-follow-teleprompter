import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

/** The full-width primary CTA (Continue / Start Prompt): a white pill on dark. */
export function CtaButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'w-full rounded-2xl bg-accent px-6 py-4 text-lg font-medium text-accent-fg',
        'transition-opacity hover:opacity-90 active:opacity-80',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    />
  )
}
