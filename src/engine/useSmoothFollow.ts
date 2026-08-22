import { useEffect, useRef } from 'react'
import { SmoothFollowEngine } from './SmoothFollowEngine'

interface UseSmoothFollowConfig {
  baseSpeed: number
  /** Fired once each time the scroll reaches the end of the script. */
  onEnd?: () => void
}

/**
 * Runs the rAF loop that advances the {@link SmoothFollowEngine} and writes the
 * text transform imperatively. Returns the engine instance plus the refs to attach
 * to the scrolling content and its viewport.
 */
export function useSmoothFollow({ baseSpeed, onEnd }: UseSmoothFollowConfig) {
  const engineRef = useRef<SmoothFollowEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new SmoothFollowEngine({ baseSpeed })
  }
  const engine = engineRef.current

  const contentRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useEffect(() => {
    engine.setBaseSpeed(baseSpeed)
  }, [engine, baseSpeed])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let endedFired = false

    const measure = () => {
      const content = contentRef.current
      const viewport = viewportRef.current
      if (content && viewport) {
        engine.setContentMetrics(content.scrollHeight, viewport.clientHeight)
      }
    }
    measure()

    const ro = new ResizeObserver(measure)
    if (contentRef.current) ro.observe(contentRef.current)
    if (viewportRef.current) ro.observe(viewportRef.current)

    const frame = (now: number) => {
      // Clamp dt so returning from a background tab doesn't jump the text.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      engine.tick(dt)

      const content = contentRef.current
      if (content) {
        content.style.transform = `translate3d(0, ${-engine.position}px, 0)`
      }

      if (engine.isAtEnd()) {
        if (!endedFired) {
          endedFired = true
          onEndRef.current?.()
        }
      } else {
        endedFired = false
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [engine])

  return { engine, contentRef, viewportRef }
}
