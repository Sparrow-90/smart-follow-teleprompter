import type { Transition } from 'motion/react'

/**
 * The app's motion vocabulary. Two curves, applied by one rule:
 *
 *   if it MOVES through space  → `travel`  (spring, slight overshoot, settles)
 *   if it CHANGES in place     → `change`  (ease-out, never overshoots)
 *
 * Where a single element does both at once, give each property its own transition —
 * `transition={{ height: travel, opacity: change }}` — so space closes on the spring
 * while the content fades on the faster curve.
 *
 * Everything imports from here. That is what makes the app read as one system rather
 * than a pile of individually-tuned animations, and it means the whole feel is tuned
 * from the four numbers below.
 */

/**
 * `visualDuration` is how long the motion *looks* like it takes (time to first reach the
 * target), and `bounce` is the overshoot — far easier to tune by eye than stiffness and
 * damping, which is why they are the only knobs exposed here.
 */
export const travel: Transition = { type: 'spring', visualDuration: 0.34, bounce: 0.18 }

/** A large object crossing the whole screen wants a little more time, a little less bounce. */
export const travelLarge: Transition = { type: 'spring', visualDuration: 0.42, bounce: 0.14 }

/** Colour, opacity, cross-fades. Fast start, soft stop, no overshoot. */
export const change: Transition = { duration: 0.2, ease: [0.32, 0.72, 0, 1] }

/**
 * Press feedback needs its own, much quicker curve. A real tap holds the pointer down for
 * roughly 40ms; on `travel` the control gets ~2% of the way into its press before the
 * release reverses it, which is invisible. This lands most of the way inside that window.
 */
export const press: Transition = { type: 'spring', visualDuration: 0.14, bounce: 0 }

/**
 * How far a control sinks when pressed, by target size. Small targets need a deeper scale
 * to read as pressed at all, large ones would look broken with the same value — so this is
 * one scale per size class rather than one number, and every control picks from here.
 */
export const pressScale = {
  /** Full-width CTAs. */
  large: 0.97,
  /** Toolbar buttons and other ~44pt targets. */
  small: 0.94,
  /** Bare icon buttons with no background to anchor them. */
  icon: 0.9,
}
