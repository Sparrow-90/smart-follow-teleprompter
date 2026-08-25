import { useCallback, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import type { ScriptDoc } from '../model/document'
import { tokenizeScript } from './tokenizeScript'
import { matchPosition } from './matcher'
import { wordProgressTarget, applyBackwardDeadband, wordIndexAtAnchor } from './positionMap'
import { useVosk, type VoskErrorKind } from './useVosk'
import {
  detectCommand,
  commandGrammarFor,
  GRAMMAR_UNKNOWN,
  type VoiceCommand,
} from './voiceCommands'
import { tokenizePhrase } from './tokenizeScript'

/**
 * How long after a manual re-anchor the matcher stays local-only. Roughly the length of an
 * apology — long enough that "sorry, let me take that again" cannot move the document, short
 * enough that a genuine jump elsewhere is found again straight away.
 */
const LOCAL_ONLY_MS = 2000

/**
 * How long after a spoken command we refuse to read another. Vosk resends the whole utterance on
 * every partial, so one "Promptly up" arrives many times over; without this the script would jump
 * a line per partial instead of per command.
 */
const COMMAND_COOLDOWN_MS = 1200

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
  /** Fired when the presenter speaks a command ("Promptly up" / "down" / "go"). */
  onCommand?: (command: VoiceCommand) => void
  /**
   * Every recognized window, exactly as the model returned it, with whatever command it was read
   * as. Only wired up by the ?debug=stt readout — the point is to see what the model ACTUALLY
   * emits, which is the one thing that cannot be worked out anywhere but on the device.
   */
  onHeard?: (words: string[], command: VoiceCommand | null) => void
}

export interface SmartFollowController {
  status: SmartFollowStatus
  listening: boolean
  /**
   * Whether the text is being moved. Deliberately separate from `listening`: while paused we keep
   * the microphone open so "Promptly go" can be heard, so `listening` alone no longer tells you
   * whether the script is following anyone.
   */
  following: boolean
  loading: boolean
  error: string | null
  errorKind: VoskErrorKind | null
  latencyMs: number
  start: () => void
  stop: () => void
  /** Put the matcher at `index` — the presenter has just placed the text there by hand. */
  reanchorTo: (index: number) => void
  /** The matcher's current token index. Read by the dev verification seam (Task 5). */
  getIndex: () => number
  /** Drive the matcher directly (typed testing / no mic). */
  feed: (words: string[]) => void
  /** Stop moving the text but keep listening, so a spoken "Promptly go" can resume it. */
  pauseFollowing: () => void
  /** Resume following, picking up from wherever the text now sits. */
  resumeFollowing: () => void
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
  onCommand,
  onHeard,
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
  // Whether the text is being moved. The ref is what `onWords` reads (it must see the current
  // value inside a long-lived callback); the state is what React renders from.
  //
  // Starts true — this flag means "not explicitly paused", not "started". Defaulting it false
  // would gate the matcher on start() having run, and start() needs a live microphone that
  // neither the tests nor the headless verify drivers have; they feed the matcher directly and
  // would then silently match nothing while still reporting green.
  const [following, setFollowing] = useState(true)
  const followingRef = useRef(true)
  // When each command last fired, so a repeat is swallowed but a DIFFERENT command is not.
  // Keyed per command deliberately: the cooldown exists to absorb repeated partials of one
  // utterance, which always yield the same command — blocking "down" because "up" fired half a
  // second ago would just make the prompter feel deaf.
  const commandCooldownRef = useRef<Partial<Record<VoiceCommand, number>>>({})
  // useVosk is constructed *below* onWords, so its resetWindow is reached through a ref.
  const resetWindowRef = useRef<() => void>(() => {})
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand
  const onHeardRef = useRef(onHeard)
  onHeardRef.current = onHeard

  const onWords = useCallback(
    (recent: string[]) => {
      if (tokens.length === 0 || recent.length === 0) return

      // Commands are read before anything else, and are checked even while paused — "Promptly go"
      // is the one instruction that has to work when the text is standing still.
      const command = detectCommand(recent)
      // Reported before the cooldown and before any early return, so the readout shows every
      // window the model produced — including the ones that matched nothing.
      onHeardRef.current?.(recent, command)
      if (command) {
        actOnCommandRef.current(command)
        return
      }

      // Paused: the microphone stays open for commands, but nothing moves the text.
      if (!followingRef.current) return
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

  const grammar = useMemo(() => commandGrammarFor(lang), [lang])
  const vosk = useVosk({
    lang,
    grammar,
    onWords: (recent) => onWords(recent),
    // A grammar result is already a complete phrase, so it goes straight to the same detector the
    // open-vocabulary path uses — normalizing it yields exactly the token pair detectCommand
    // understands, and "[unk]" (everything that was not a command) yields nothing.
    onCommandPhrase: (text) => {
      // Strip the out-of-grammar token BEFORE detecting. normalizeWord keeps only [a-z0-9], so
      // "[unk]" survives as "unk" — and a result like "klik góra [unk]" would put it in the tail
      // slot detectCommand reads, silently dropping a command the recognizer got right.
      const words = tokenizePhrase(text.split(/\s+/).filter((w) => w !== GRAMMAR_UNKNOWN).join(' '))
      const command = detectCommand(words)
      onHeardRef.current?.([`grammar:`, ...words], command)
      if (command) actOnCommandRef.current(command)
    },
  })
  // Destructured so reanchorTo depends on the stable callback, not the fresh object each render.
  const { resetWindow } = vosk
  resetWindowRef.current = resetWindow

  /**
   * Act on a command, whichever recognizer heard it. Both the open-vocabulary detector and the
   * grammar recognizer come through here, so the cooldown de-duplicates across them: when both
   * hear the same phrase — the common case — whichever lands first wins and the other is dropped.
   */
  const actOnCommand = useCallback(
    (command: VoiceCommand) => {
      // A drag in progress owns the position (PRD §37). Guarded here rather than in onWords so it
      // covers the grammar recognizer too. Without it a spoken command glides the text out from
      // under a held finger — tick() serves a glide before it checks scrubbing — and the nudge is
      // then silently discarded anyway, because releasing adopts the finger's position as target.
      if (engine.scrubbing) return
      const now = performance.now()
      if (now < (commandCooldownRef.current[command] ?? 0)) return
      commandCooldownRef.current[command] = now + COMMAND_COOLDOWN_MS
      // The command words are not script. Clearing the window keeps them away from the matcher,
      // but clearing alone is the trap LOCAL_ONLY_MS exists for: the next one- or two-word partial
      // would score under minConfidence and widen the search to the whole document, jumping the
      // presenter somewhere else entirely on almost no evidence. The nudge that follows only
      // re-anchors once its glide settles, and `scrubbing` is false throughout a glide, so nothing
      // else covers this gap.
      resetWindowRef.current()
      lastTargetRef.current = null
      localOnlyUntilRef.current = now + LOCAL_ONLY_MS
      onCommandRef.current?.(command)
    },
    [engine],
  )
  const actOnCommandRef = useRef(actOnCommand)
  actOnCommandRef.current = actOnCommand

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

  /**
   * Stop moving the text, keep the microphone open. This is what makes "Promptly go" possible at
   * all — `stop()` tears the audio graph down, leaving a paused prompter deaf.
   *
   * Pinning the target is not optional: follow mode smooth-damps toward `targetPosition`, so
   * merely ceasing to feed it targets lets the text carry on drifting to one it never reached.
   * restart() and nudgeLines guard the same trap.
   */
  const pauseFollowing = useCallback(() => {
    followingRef.current = false
    setFollowing(false)
    // `destination`, not `position`: pausing mid-glide (a nudge or a tap still travelling) would
    // otherwise pin the target to a half-finished move. tick() serves the glide first and returns,
    // so the glide still lands — and follow mode then damps the text BACK to the stale pin, which
    // is the exact drift this pin exists to prevent.
    engine.setTargetPosition(engine.destination)
    lastTargetRef.current = null
  }, [engine])

  const resumeFollowing = useCallback(() => {
    followingRef.current = true
    setFollowing(true)
    engine.setMode('follow')
    // Pick up from where the text actually sits — the presenter may have moved it by hand, or by
    // command, while it was paused. Falling back to 'finding' just lets speech find them again.
    const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
    if (index != null) reanchorTo(index)
    else setStatus('finding')
  }, [engine, viewportRef, lineHeightPx, reanchorTo])

  const start = useCallback(() => {
    indexRef.current = 0
    lastTargetRef.current = null
    columnElRef.current = null
    followingRef.current = true
    setFollowing(true)
    engine.setMode('follow')
    setStatus('finding')
    vosk.start()
  }, [engine, vosk])

  const stop = useCallback(() => {
    vosk.stop()
    followingRef.current = false
    setFollowing(false)
    setStatus('idle')
  }, [vosk])

  return {
    status,
    listening: vosk.listening,
    following,
    loading: vosk.loading,
    error: vosk.error,
    errorKind: vosk.errorKind,
    latencyMs: vosk.latencyMs,
    start,
    stop,
    reanchorTo,
    getIndex: () => indexRef.current,
    feed: onWords,
    pauseFollowing,
    resumeFollowing,
  }
}
