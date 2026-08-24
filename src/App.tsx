import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useStore } from './state/store'
import { travelLarge } from './motion/tokens'
import { EditorScreen } from './screens/EditorScreen'
import { SetupScreen } from './screens/SetupScreen'
import { PromptScreen } from './screens/PromptScreen'
import { SmartFollowLabScreen } from './screens/SmartFollowLabScreen'

/**
 * The push/pop shape: the incoming screen travels the full width, while the outgoing one
 * only drifts a third of the way and dims. That asymmetry is what reads as *depth* —
 * a stack being pushed — rather than as two panels sliding past each other.
 *
 * `zIndex` flips with the direction, which is the half that is easy to miss. Pushing, the
 * arriving screen covers the one it replaces. Popping, the *departing* screen slides off
 * on top and reveals the one waiting underneath. Get this wrong and a pop looks like a
 * second push played backwards.
 */
const screenVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? '100%' : '-30%',
    opacity: dir > 0 ? 1 : 0.6,
    zIndex: dir > 0 ? 1 : 0,
  }),
  center: (dir: number) => ({ x: 0, opacity: 1, zIndex: dir > 0 ? 1 : 0 }),
  exit: (dir: number) => ({
    x: dir > 0 ? '-30%' : '100%',
    opacity: dir > 0 ? 0.6 : 1,
    zIndex: dir > 0 ? 0 : 1,
  }),
}

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.view)
  const hydrate = useStore((s) => s.hydrate)
  const goTo = useStore((s) => s.goTo)

  useEffect(() => {
    void hydrate()
    // Hidden Smart Follow POC harness — reachable only via #lab, never from the normal flow.
    const applyHash = () => {
      if (window.location.hash === '#lab') goTo('lab')
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [hydrate, goTo])

  // Avoid a flash of default content before the last script + settings load.
  if (!hydrated) return <div className="h-full bg-bg" />

  // Prompt Mode and the lab return *before* AnimatePresence, and that placement is the
  // whole safety argument. Flipping to 'prompt' unmounts the animated subtree wholesale,
  // so no exit animation can run and no screen can outlive the presenter's Exit — the
  // microphone and the wake lock stay bound to PromptScreen's unmount, exactly as before.
  if (view === 'prompt') return <PromptScreen />
  if (view === 'lab') return <SmartFollowLabScreen />

  // With only two screens in the flow, the destination *is* the direction.
  const dir = view === 'setup' ? 1 : -1

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative h-[100dvh] overflow-hidden">
        {/* `initial={false}` so the first screen is simply there on load, not animated in. */}
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={view}
            // Handle for scripts/verify-motion.mjs, which measures both screens mid-transition.
            data-screen={view}
            // Opaque, or the two screens read through each other while they overlap.
            className="absolute inset-0 bg-bg"
            custom={dir}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={travelLarge}
          >
            {view === 'editor' ? <EditorScreen /> : <SetupScreen />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
