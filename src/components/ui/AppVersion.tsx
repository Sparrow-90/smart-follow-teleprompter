import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { press, pressScale } from '../../motion/tokens'
import { APP_COMMIT, APP_VERSION, BUILD_DATE } from '../../buildInfo'

/** The same dwell as the Editor's undo toast — long enough to read, short enough to forget. */
const REVEAL_MS = 6000

/**
 * `v0.2.0`, and on a tap the build behind it.
 *
 * The version alone cannot confirm an update landed: fixes ship between feature bumps, and on
 * exactly those deploys the number does not move. The commit is what answers that — but it is
 * seven characters of noise on a byline, so it lives one tap away rather than on the surface.
 * A tap rather than a `title` tooltip because the devices this is FOR are tablets, which have no
 * hover.
 *
 * READ IT ON THE SECOND RELOAD, not the first. Measured against a real service worker (build,
 * `vite preview`, bump, rebuild, reload): the first reload after a deploy still shows the PREVIOUS
 * version, and the new one appears on the reload after that. That is `registerType: 'autoUpdate'`
 * working as designed — the worker fetches the new shell in the background while serving the
 * cached one, so the page you are looking at genuinely IS the old build. The number is not lying;
 * it is reporting the shell that rendered it, which is the only honest thing it could report.
 */
export function AppVersion() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), REVEAL_MS)
    return () => clearTimeout(t)
  }, [open])

  return (
    <motion.button
      type="button"
      onClick={() => setOpen((o) => !o)}
      whileTap={{ scale: pressScale.icon }}
      transition={press}
      aria-label={`Version ${APP_VERSION}, tap for build details`}
      /*
       * `.type-numeral` (Geist Mono) is earned here by the tap: index.css scopes that role to
       * readouts that CHANGE while being looked at, because a proportional face makes the row
       * reflow as they do. This one changes in place, and mono keeps the byline beside it still.
       *
       * `leading-5` is load-bearing, not styling. The row this sits in must stay exactly 20px tall
       * or the -2px that buys the logo's measured 4px gap is void — see EditorScreen.
       */
      className="type-numeral text-[10px] leading-5 whitespace-nowrap text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/*
        A hard swap, deliberately: no AnimatePresence, no `layout`. The change is horizontal inside
        a 20px header row, and animating the width makes the whole lockup look restless for nothing.
      */}
      {open ? `v${APP_VERSION} · ${APP_COMMIT} · ${BUILD_DATE}` : `v${APP_VERSION}`}
    </motion.button>
  )
}
