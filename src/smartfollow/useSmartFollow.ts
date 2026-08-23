import { useCallback, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import type { ScriptDoc } from '../model/document'
import { tokenizeScript } from './tokenizeScript'
import { matchPosition } from './matcher'
import { wordProgressTarget, applyBackwardDeadband } from './positionMap'
import { useVosk } from './useVosk'

export type SmartFollowStatus = 'idle' | 'following' | 'finding' | 'paused'

interface Options {
  doc: ScriptDoc
  engine: SmoothFollowEngine
  viewportRef: RefObject<HTMLElement>
  lang: string
  /** Rendered line height in px (preset.fontSize × preset.lineHeight) — drives per-word easing. */
  lineHeightPx: number
  /** Whether the text is mirrored (flips reading-progress direction). */
  mirror: boolean
}

export interface SmartFollowController {
  status: SmartFollowStatus
  listening: boolean
  loading: boolean
  error: string | null
  latencyMs: number
  start: () => void
  stop: () => void
  /** Drive the matcher directly (typed testing / no mic). */
  feed: (words: string[]) => void
}

/**
 * The full Smart Follow loop, reusable by Prompt Mode and the #lab harness:
 * mic (Vosk) → matcher → target the matched word's visual line → engine follow mode.
 */
export function useSmartFollow({
  doc,
  engine,
  viewportRef,
  lang,
  lineHeightPx,
  mirror,
}: Options): SmartFollowController {
  const tokens = useMemo(() => tokenizeScript(doc), [doc])
  const indexRef = useRef(0)
  // Last scroll target we handed the engine — null means "no target yet" (first move passes freely).
  const lastTargetRef = useRef<number | null>(null)
  // The text column is stable for a session; cache it so we don't re-query on every STT partial.
  const columnElRef = useRef<Element | null>(null)
  const [status, setStatus] = useState<SmartFollowStatus>('idle')

  const onWords = useCallback(
    (recent: string[]) => {
      if (tokens.length === 0 || recent.length === 0) return
      const res = matchPosition(tokens, indexRef.current, recent)
      setStatus(res.confidence >= 0.6 ? 'following' : res.confidence >= 0.4 ? 'finding' : 'paused')
      if (res.confidence < 0.45) return // unsure — hold
      indexRef.current = res.index
      // Continuous per-word target: eases with reading progress across the matched word's visual
      // line instead of snapping a whole line at each wrap (kills the staircase).
      const wordEl = viewportRef.current?.querySelector(`[data-w="${res.index}"]`)
      // Cached column, re-resolved only if missing or detached (e.g. after a remount).
      let columnEl = columnElRef.current
      if (!columnEl?.isConnected) {
        columnEl = viewportRef.current?.querySelector('[data-prompter-column]') ?? null
        columnElRef.current = columnEl
      }
      const raw = wordProgressTarget(
        engine.position,
        wordEl,
        columnEl,
        viewportRef.current,
        lineHeightPx,
        mirror,
      )
      if (raw == null) return
      // Suppress tiny upward jitter from partial STT corrections; honor real backtracks.
      const target =
        lastTargetRef.current == null
          ? raw
          : applyBackwardDeadband(lastTargetRef.current, raw, 0.75 * lineHeightPx)
      lastTargetRef.current = target
      engine.setTargetPosition(target)
    },
    [tokens, engine, viewportRef, lineHeightPx, mirror],
  )

  const vosk = useVosk({ lang, onWords: (recent) => onWords(recent) })

  const start = useCallback(() => {
    indexRef.current = 0
    lastTargetRef.current = null
    columnElRef.current = null
    engine.setMode('follow')
    setStatus('finding')
    vosk.start()
  }, [engine, vosk])

  const stop = useCallback(() => {
    vosk.stop()
    setStatus('idle')
  }, [vosk])

  return {
    status,
    listening: vosk.listening,
    loading: vosk.loading,
    error: vosk.error,
    latencyMs: vosk.latencyMs,
    start,
    stop,
    feed: onWords,
  }
}
