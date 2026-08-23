import { useCallback, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import type { ScriptDoc } from '../model/document'
import { tokenizeScript } from './tokenizeScript'
import { matchPosition } from './matcher'
import { lineElementTarget } from './positionMap'
import { useVosk } from './useVosk'

export type SmartFollowStatus = 'idle' | 'following' | 'finding' | 'paused'

interface Options {
  doc: ScriptDoc
  engine: SmoothFollowEngine
  viewportRef: RefObject<HTMLElement>
  lang: string
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
export function useSmartFollow({ doc, engine, viewportRef, lang }: Options): SmartFollowController {
  const tokens = useMemo(() => tokenizeScript(doc), [doc])
  const indexRef = useRef(0)
  const [status, setStatus] = useState<SmartFollowStatus>('idle')

  const onWords = useCallback(
    (recent: string[]) => {
      if (tokens.length === 0 || recent.length === 0) return
      const res = matchPosition(tokens, indexRef.current, recent)
      setStatus(res.confidence >= 0.6 ? 'following' : res.confidence >= 0.4 ? 'finding' : 'paused')
      if (res.confidence < 0.45) return // unsure — hold
      indexRef.current = res.index
      // Target the matched WORD's visual line (works inside multi-sentence paragraphs).
      const wordEl = viewportRef.current?.querySelector(`[data-w="${res.index}"]`)
      const target = lineElementTarget(engine.position, wordEl, viewportRef.current)
      if (target != null) engine.setTargetPosition(target)
    },
    [tokens, engine, viewportRef],
  )

  const vosk = useVosk({ lang, onWords: (recent) => onWords(recent) })

  const start = useCallback(() => {
    indexRef.current = 0
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
