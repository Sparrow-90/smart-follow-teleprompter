import { useCallback, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import type { ScriptDoc } from '../model/document'
import { tokenizeScript } from './tokenizeScript'
import { matchPosition } from './matcher'
import { wordProgressTarget, applyBackwardDeadband } from './positionMap'
import { useVosk } from './useVosk'

/**
 * How long after a manual re-anchor the matcher stays local-only. Roughly the length of an
 * apology — long enough that "sorry, let me take that again" cannot move the document, short
 * enough that a genuine jump elsewhere is found again straight away.
 */
const LOCAL_ONLY_MS = 2000

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
  /** Put the matcher at `index` — the presenter has just placed the text there by hand. */
  reanchorTo: (index: number) => void
  /** The matcher's current token index. Read by the dev verification seam (Task 5). */
  getIndex: () => number
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
  // While `now` is below this, matching stays local — see LOCAL_ONLY_MS.
  const localOnlyUntilRef = useRef(0)
  // The text column is stable for a session; cache it so we don't re-query on every STT partial.
  const columnElRef = useRef<Element | null>(null)
  const [status, setStatus] = useState<SmartFollowStatus>('idle')

  const onWords = useCallback(
    (recent: string[]) => {
      if (tokens.length === 0 || recent.length === 0) return
      // A drag in progress owns the position (PRD §37) — speech heard mid-gesture must not
      // queue a target that would yank the text out from under the finger on release.
      if (engine.scrubbing) return
      const localOnly = performance.now() < localOnlyUntilRef.current
      const res = matchPosition(tokens, indexRef.current, recent, { localOnly })
      // Inside the local-only window the presenter has just told us where they are, and the
      // recognition window has been emptied to match. The first word or two back therefore score
      // on almost no evidence — a filler or a misheard breath would flash "paused" at exactly the
      // moment they are looking for confirmation the re-anchor took. Hold the label; the position
      // logic below still runs, so a real match moves the text immediately either way.
      if (!localOnly) {
        setStatus(res.confidence >= 0.6 ? 'following' : res.confidence >= 0.4 ? 'finding' : 'paused')
      }
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
  // Destructured so reanchorTo depends on the stable callback, not the fresh object each render.
  const { resetWindow } = vosk

  const reanchorTo = useCallback(
    (index: number) => {
      indexRef.current = index
      // The words still in the recognition window were spoken *ahead* of the line the presenter
      // has just chosen. Left in place they out-vote the re-anchor on the very next partial and
      // pull the text straight back down to where the stumble happened — the whole point of the
      // re-anchor undone before the presenter has finished the first word of the retake.
      resetWindow()
      // The deadband's memory is a pre-drag target — meaningless now, and it would only fight
      // the first move back. Null lets the next target through freely.
      lastTargetRef.current = null
      localOnlyUntilRef.current = performance.now() + LOCAL_ONLY_MS
      setStatus('following')
    },
    [resetWindow],
  )

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
    reanchorTo,
    getIndex: () => indexRef.current,
    feed: onWords,
  }
}
