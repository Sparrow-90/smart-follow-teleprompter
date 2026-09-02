import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { PRESETS, resolvePreset } from '../model/presets'
import { useSmoothFollow } from '../engine/useSmoothFollow'
import { useWakeLock } from '../engine/useWakeLock'
import { PromptText } from '../components/prompt/PromptText'
import { FocusZone } from '../components/prompt/FocusZone'
import { PromptControls } from '../components/prompt/PromptControls'
import { PromptChrome } from '../components/prompt/PromptChrome'
import { useSmartFollow } from '../smartfollow/useSmartFollow'
import type { VoskErrorKind } from '../smartfollow/useVosk'
import { resumePhraseFor, type VoiceCommand } from '../smartfollow/voiceCommands'
import { wordIndexAtAnchor, firstWordIndexIn, wordProgressTarget } from '../smartfollow/positionMap'
import { paragraphJumpTargets, previousParagraphIndex } from '../smartfollow/paragraphJumps'

const MIN_SPEED = 0.4
const MAX_SPEED = 3.0
const SPEED_STEP = 0.2
const HIDE_DELAY = 3500
/** Lines a spoken command moves. More than the button — see the command handler for why. */
const VOICE_NUDGE_LINES = 2

/**
 * Speech readout, opened with ?debug=stt. Shows what the recognizer ACTUALLY returned, which is
 * the only way to find out why a wake word does not fire on a given voice — the models have a
 * closed lexicon, so a word outside it comes back as something else entirely, and which
 * something cannot be worked out anywhere but on the device.
 *
 * A query param rather than a hash, because the hash already routes #lab.
 */
const DEBUG_STT =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'stt'

/** The live viewport, so preset sizes can be fitted to the screen the presenter is reading. */
function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))
  useEffect(() => {
    const measure = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    measure() // an iPad rotated before this mounted would otherwise keep the stale size
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])
  return size
}

export function PromptScreen() {
  const scriptDoc = useStore((s) => s.scriptDoc)
  const settings = useStore((s) => s.settings)
  const goTo = useStore((s) => s.goTo)
  const viewport = useViewportSize()
  // Sizes are authored for one tablet and fitted to this screen. Everything below reads THIS
  // object — the rendered text, the scroll speed, and lineHeightPx, which is what Smart Follow
  // aims a line with. Deriving any of them from the unscaled preset would put the follow target
  // on a different line than the one on screen.
  const preset = useMemo(
    () => resolvePreset(PRESETS[settings.preset], viewport.width, viewport.height),
    [settings.preset, viewport.width, viewport.height],
  )
  const lineHeightPx = preset.fontSize * preset.lineHeight
  // Where "Klik akapit" can put the presenter. Derived from the document, so it costs nothing
  // until the script changes.
  const paragraphTargets = useMemo(() => paragraphJumpTargets(scriptDoc), [scriptDoc])

  const [playing, setPlaying] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [speed, setSpeed] = useState(1)

  const { engine, contentRef, viewportRef } = useSmoothFollow({
    baseSpeed: preset.baseSpeed,
    onEnd: () => {
      setPlaying(false)
      setControlsVisible(true)
    },
  })

  useWakeLock()

  // nudgeLines and resumeFollowing are defined below this call; a ref keeps the hook's onCommand
  // stable and sidesteps the temporal-dead-zone this would otherwise hit.
  const commandHandlerRef = useRef<(command: VoiceCommand) => void>(() => {})
  const sf = useSmartFollow({
    doc: scriptDoc,
    engine,
    viewportRef,
    lang: settings.language,
    lineHeightPx,
    mirror: settings.mirror,
    onCommand: (command) => commandHandlerRef.current(command),
    // Written straight into the DOM rather than through state: this fires on every STT partial,
    // and re-rendering the whole script at that rate would be a real cost for a debug aid.
    onHeard: DEBUG_STT
      ? (words, command) => {
          const el = heardRef.current
          if (!el) return
          // The grammar recognizer marks its own lines, so the two streams can be told apart:
          // if commands only ever fire on `G` lines, the open-vocabulary path is the weak one.
          const fromGrammar = words[0] === 'grammar:'
          const said = (fromGrammar ? words.slice(1) : words).join(' ')
          const line = `${fromGrammar ? 'G ' : '· '}${command ? `[${command}] ` : ''}${said}`
          if (el.firstChild?.textContent === line) return // same partial repeated; don't spam
          const row = document.createElement('div')
          row.textContent = line
          if (command) row.style.color = '#4ade80'
          else if (fromGrammar) row.style.color = '#93c5fd'
          el.prepend(row)
          while (el.childElementCount > 10) el.lastElementChild?.remove()
        }
      : undefined,
  })
  const heardRef = useRef<HTMLDivElement>(null)
  // What the last spoken command did, shown briefly so the presenter can see they were heard.
  const [commandFlash, setCommandFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Why Smart Follow gave up, kept once it has. The mic and the model fail for unrelated reasons
  // and have unrelated remedies, so the chip must not blame the mic for a failed download.
  const [sfFailure, setSfFailure] = useState<VoskErrorKind | null>(null)
  useEffect(() => {
    if (!sf.error) return
    setSfFailure(sf.errorKind ?? 'mic')
    // Hand the engine back to auto mode, or the "fallback to manual" is a fiction: start() sets
    // 'follow' synchronously BEFORE the microphone can fail, nothing else ever sets 'auto' back,
    // and tick()'s follow branch ignores playingFlag entirely — it only damps toward
    // targetPosition. So Play would flip a flag no code reads, leaving the presenter with a frozen
    // script, visible speed controls that do nothing, and no way to move the text at all.
    engine.setMode('auto')
  }, [sf.error, sf.errorKind, engine])
  const usingSmartFollow = settings.smartFollow && !sfFailure

  // Refs so long-lived callbacks/effects see the latest without re-subscribing every render.
  const sfRef = useRef(sf)
  sfRef.current = sf
  const usingSFRef = useRef(usingSmartFollow)
  usingSFRef.current = usingSmartFollow

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Controls stay up while paused; auto-hide only while the text is moving.
  const scheduleHide = useCallback(
    (isPlaying: boolean) => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (isPlaying) {
        hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY)
      }
    },
    [],
  )

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    scheduleHide(engine.playing)
  }, [engine, scheduleHide])

  const togglePlay = useCallback(() => {
    setControlsVisible(true)
    if (usingSFRef.current) {
      // Smart Follow: play = start listening/following, pause = stop listening.
      const s = sfRef.current
      if (!s.listening) {
        s.start()
        setPlaying(true)
        scheduleHide(true)
      } else if (s.following) {
        // Pause, but stay listening — otherwise "Promptly go" could never be heard.
        s.pauseFollowing()
        setPlaying(false)
        scheduleHide(false)
      } else {
        s.resumeFollowing()
        setPlaying(true)
        scheduleHide(true)
      }
    } else {
      engine.toggle()
      const now = engine.playing
      setPlaying(now)
      scheduleHide(now)
    }
  }, [engine, scheduleHide])

  const changeSpeed = useCallback(
    (delta: number) => {
      setSpeed((prev) => {
        const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round((prev + delta) * 10) / 10))
        engine.setSpeedMultiplier(next)
        return next
      })
      revealControls()
    },
    [engine, revealControls],
  )

  const restart = useCallback(() => {
    if (usingSFRef.current) sfRef.current.stop()
    else engine.pause()
    setPlaying(false)
    engine.glideTo(0) // eases smoothly back to the top
    // Follow mode would otherwise smooth-damp straight back down to its pre-restart target the
    // moment the glide finishes — stop() does not leave follow mode.
    engine.setTargetPosition(0)
    if (usingSFRef.current) sfRef.current.reanchorTo(0)
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [engine])

  /**
   * Try Smart Follow again after it gave out.
   *
   * `sfFailure` was write-once, so the fallback to manual was permanent for the session: pressing
   * Play afterwards ran the manual branch and never re-attempted start(), which made "allow the
   * mic and try again" advice the app itself made impossible to follow. Only leaving Prompt Mode
   * and coming back cleared it.
   *
   * Clearing the flag is what re-arms `usingSmartFollow`; if the microphone is still refused,
   * start() fails again and the effect above simply puts the chip back, so a retry costs nothing.
   * The engine is paused first because the fallback really can leave a manual scroll running, and
   * follow mode should take over a still script rather than a moving one.
   */
  const retrySmartFollow = useCallback(() => {
    engine.pause()
    // Adopt wherever the manual scroll got to as the follow target. start() switches straight back
    // to follow mode, which damps toward `targetPosition` — still holding whatever Smart Follow
    // last aimed at, usually 0. Without this the retry rewinds the presenter to the top of the
    // script. Same trap pauseFollowing, restart and nudgeLines each guard against.
    engine.setTargetPosition(engine.destination)
    setSfFailure(null)
    sfRef.current.start()
    setPlaying(true)
    setControlsVisible(true)
    scheduleHide(true)
  }, [engine, scheduleHide])

  const doExit = useCallback(() => {
    engine.pause()
    goTo('editor')
  }, [engine, goTo])

  // Exit (button / Escape) goes through history so the hardware back button/gesture
  // behaves identically — and never closes the PWA straight out of a running prompt.
  const exit = useCallback(() => {
    window.history.back()
  }, [])

  useEffect(() => {
    window.history.pushState({ prompt: true }, '')
    const onPop = () => doExit()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [doExit])

  // Keyboard controls (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case '+':
        case '=':
        case 'ArrowUp':
          e.preventDefault()
          changeSpeed(SPEED_STEP)
          break
        case '-':
        case 'ArrowDown':
          e.preventDefault()
          changeSpeed(-SPEED_STEP)
          break
        case 'Home':
        case 'r':
          e.preventDefault()
          restart()
          break
        case 'Escape':
          exit()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, changeSpeed, exit, restart])

  // Auto-pause when the app is backgrounded or the device rotates (PRD flow decision).
  useEffect(() => {
    const pause = () => {
      if (usingSFRef.current) {
        if (sfRef.current.listening) {
          // Deliberately stop(), not pauseFollowing(): holding the microphone open behind a
          // backgrounded tab is both a privacy problem and a Safari suspension bug. Only a
          // pause the presenter asked for keeps listening.
          sfRef.current.stop()
          setPlaying(false)
          setControlsVisible(true)
        }
      } else if (engine.playing) {
        engine.pause()
        setPlaying(false)
        setControlsVisible(true)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
    }
    window.addEventListener('orientationchange', pause)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('orientationchange', pause)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [engine])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  // Dev-only seam so scripts/verify-reanchor.mjs can drive Smart Follow without a microphone
  // or the 50MB model. Stripped from production builds by the import.meta.env.DEV guard.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__prompter = {
      followMode: () => engine.setMode('follow'),
      feed: (words: string[]) => sfRef.current.feed(words),
      position: () => engine.position,
      gliding: () => engine.isGliding(),
      index: () => sfRef.current.getIndex(),
      lineHeight: () => lineHeightPx,
      following: () => sfRef.current.following,
      pause: () => sfRef.current.pauseFollowing(),
      command: (c: VoiceCommand) => commandHandlerRef.current(c),
      paragraphTargets: () => paragraphTargets,
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__prompter
    }
  }, [engine, lineHeightPx, paragraphTargets])

  // Glide the tapped line into the Focus Zone (~40% of the viewport height).
  const jumpToLineAt = (x: number, y: number): boolean => {
    const viewport = viewportRef.current
    if (!viewport) return false
    const line = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(
      '[data-prompter-line]',
    )
    if (!line) return false
    const lineRect = line.getBoundingClientRect()
    const vpRect = viewport.getBoundingClientRect()
    const dest = engine.position + (lineRect.top - vpRect.top) - 0.4 * vpRect.height
    engine.glideTo(dest)
    // glideTo drives the one-shot glide only; it never touches targetPosition. Without this,
    // follow mode smooth-damps back to the stale pre-tap target the moment the glide ends —
    // the same trap restart() guards against with its own setTargetPosition(0).
    engine.setTargetPosition(dest)
    if (usingSFRef.current) {
      // Tells the matcher where the presenter now is, so it carries on from here.
      const index = firstWordIndexIn(line)
      if (index != null) sfRef.current.reanchorTo(index)
    }
    return true
  }

  /**
   * Move the script by exactly `lines` rendered lines. One press, one line — the precise
   * counterpart to tap-to-jump, which recentres whatever line you hit and so travels further the
   * lower on screen you tap.
   *
   * Holding the button stacks moves onto the last destination rather than the live position: the
   * glide is still travelling, so counting from `engine.position` would lose whatever the
   * previous press had not yet covered. glideTo hands back the clamped destination, so pressing
   * on at the end of the script cannot run the count off past it.
   */
  const nudgeDestRef = useRef<number | null>(null)
  const settleRafRef = useRef(0)
  const nudgeLines = (lines: number) => {
    const from = nudgeDestRef.current ?? engine.position
    const dest = engine.glideTo(from + lines * lineHeightPx)
    nudgeDestRef.current = dest
    // Follow mode smooth-damps toward targetPosition; without this it pulls straight back to the
    // pre-nudge target, exactly as tap-to-jump documents above.
    engine.setTargetPosition(dest)
    setControlsVisible(true)
    scheduleHide(engine.playing)

    // Re-anchor only once the text has actually stopped. The glide is animated, so reading the
    // DOM now would hand Smart Follow the word the presenter was on *before* the nudge.
    cancelAnimationFrame(settleRafRef.current)
    const whenSettled = () => {
      if (engine.isGliding()) {
        settleRafRef.current = requestAnimationFrame(whenSettled)
        return
      }
      nudgeDestRef.current = null
      if (usingSFRef.current) {
        const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
        if (index != null) sfRef.current.reanchorTo(index)
      }
    }
    settleRafRef.current = requestAnimationFrame(whenSettled)
  }
  useEffect(() => () => cancelAnimationFrame(settleRafRef.current), [])

  /**
   * Glide so that a KNOWN word index sits at the Focus Zone, and tell Smart Follow it is there.
   *
   * Unlike nudgeLines this needs no rAF settle loop: the destination index is known up front, so
   * the re-anchor is exact and immediate instead of read back off the DOM once the glide lands.
   * The same geometry as the per-word follow target, so a jump puts the line exactly where
   * ordinary following would have put it.
   *
   * Returns false when the target has no rendered word — Smart Follow off means no `[data-w]`
   * spans exist at all — so the caller can say nothing happened rather than silently no-op.
   */
  const jumpToWordIndex = (index: number): boolean => {
    const vp = viewportRef.current
    const dest = wordProgressTarget(
      engine.position,
      vp?.querySelector(`[data-w="${index}"]`),
      vp?.querySelector('[data-prompter-column]'),
      vp,
      lineHeightPx,
      settings.mirror,
    )
    if (dest == null) return false
    // A nudge still in flight would re-anchor Smart Follow to wherever ITS glide was heading,
    // undoing this jump a frame or two after it lands. And this is an absolute move, so it must
    // not stack onto the relative destination nudgeLines was accumulating.
    cancelAnimationFrame(settleRafRef.current)
    nudgeDestRef.current = null
    const clamped = engine.glideTo(dest)
    // Follow mode smooth-damps toward targetPosition; without this it pulls straight back to the
    // pre-jump target, exactly as tap-to-jump and nudgeLines both document.
    engine.setTargetPosition(clamped)
    if (usingSFRef.current) sfRef.current.reanchorTo(index)
    setControlsVisible(true)
    scheduleHide(engine.playing)
    return true
  }

  /**
   * A spoken command. "Up" moves the reading position back up the script — the same call as the
   * onNudgeBack button, so voice and touch land on one code path. The sign is intentional.
   *
   * Voice moves further than the button on purpose. Pressing the button is precise and repeatable
   * — you can tap it three times while watching the text. Speaking a command costs a phrase and a
   * recognition round-trip, so a single line rarely gets the presenter back to the line they
   * fumbled, and saying it again is slow enough to be visible on camera. Two lines is the useful
   * unit for recovery; the button stays at one for fine adjustment.
   */
  commandHandlerRef.current = (command: VoiceCommand) => {
    // The flash renders inside PromptChrome, which auto-hides. nudgeLines reveals it for the two
    // movement commands, but a spoken resume arrives when the chrome has long since faded — so
    // without this the one confirmation the presenter gets is invisible exactly when it matters.
    setControlsVisible(true)
    let flash: string
    if (command === 'resume') {
      sfRef.current.resumeFollowing()
      setPlaying(true)
      scheduleHide(true)
      flash = '● Following'
    } else if (command === 'paragraphBack') {
      // Counted from the MATCHER's position, not the screen's: every manual override already
      // re-anchors it, so it is the one place that knows where the presenter actually is.
      const to = previousParagraphIndex(paragraphTargets, sfRef.current.getIndex())
      const moved = to != null && jumpToWordIndex(to)
      // A command that deliberately does nothing still has to register, or the presenter says it
      // again and again wondering whether they were heard.
      flash = moved ? '↑ ¶ paragraph' : '¶ top of script'
    } else {
      nudgeLines(command === 'back' ? -VOICE_NUDGE_LINES : VOICE_NUDGE_LINES)
      flash =
        command === 'back'
          ? `↑ back ${VOICE_NUDGE_LINES} lines`
          : `↓ forward ${VOICE_NUDGE_LINES} lines`
    }
    setCommandFlash(flash)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setCommandFlash(null), 1400)
  }
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  /**
   * Wheel / trackpad scroll. A two-finger swipe on a trackpad is a wheel event, not a pointer
   * drag, so none of the drag handling below ever saw it — on a laptop the script simply could
   * not be moved by scrolling.
   *
   * Attached natively rather than via onWheel because it must be non-passive to preventDefault,
   * and React's synthetic wheel listener is passive. It mirrors the drag lifecycle: scrubbing
   * while the wheel is turning, then on a short idle it releases — which adopts the new position
   * as the follow target — and tells Smart Follow which word the presenter has landed on.
   */
  const wheelIdleRef = useRef(0)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      engine.setScrubbing(true)
      engine.scrubBy(e.deltaY)
      setControlsVisible(true)
      window.clearTimeout(wheelIdleRef.current)
      wheelIdleRef.current = window.setTimeout(() => {
        engine.setScrubbing(false)
        scheduleHide(engine.playing)
        if (usingSFRef.current) {
          const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
          if (index != null) sfRef.current.reanchorTo(index)
        }
      }, 140)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheelIdleRef.current)
    }
  }, [engine, lineHeightPx, scheduleHide, viewportRef])

  // Pointer: drag to scrub (manual override always wins). A tap wakes the controls; a tap on
  // a line *while controls are visible* recenters that line — so a tap mid-read never yanks the text.
  /**
   * `pointerId` so a drag belongs to the finger that started it. Two fingers are ordinary on a
   * tablet — one holding the script, one reaching for a button — and without it the second
   * finger's lift ends the first finger's drag: scrubbing released, Smart Follow re-anchored to
   * wherever the drag happened to be, and the still-pressed thumb then moving nothing until it
   * is lifted and put down again.
   */
  const drag = useRef({ active: false, pointerId: -1, lastY: 0, moved: 0 })
  /**
   * The chrome sits inside the viewport, so every press on a button also reaches these handlers —
   * and they would read it as a tap on the script. That tap lands on no `[data-prompter-line]`,
   * which is the "tapped empty space" case, so pressing Play hid the whole interface; and hiding
   * it applies `pointer-events-none` to the button before the browser dispatches `click`, which
   * swallows the press outright. Play appeared dead unless the finger drifted the 6px that makes
   * this a drag instead. The viewport's drag and tap handling belongs to the script; a press on
   * the chrome is the chrome's alone.
   *
   * Touch only, which is why this survived desktop use: a mouse click is dispatched regardless,
   * a tap is re-hit-tested and lands on nothing.
   *
   * Only what is actually *on* a button counts. The chrome roots are `pointer-events-none` with
   * live buttons precisely so this stays true: matching the containers instead would make the
   * top bar's full-width 48px band — and the gaps between the controls — dead to dragging and to
   * tap-to-jump. `Element`, not `HTMLElement` — a tap on a button lands on the `<svg>` inside it.
   */
  const onChrome = (e: React.PointerEvent) =>
    !!(e.target as Element).closest?.('[data-prompt-chrome]')
  const onPointerDown = (e: React.PointerEvent) => {
    // Secondary fingers never start a drag: landing a second one on the script used to overwrite
    // `drag.current` wholesale, so its lift ran the tap path — recentring a line or dismissing
    // the chrome — while the first finger was still down, and the first finger then moved
    // nothing until it was lifted and put down again. Keyed on `isPrimary` rather than on a live
    // drag: a stale `active` flag would then lock dragging out permanently, where a fresh single
    // touch is always primary again.
    if (!e.isPrimary) return
    if (onChrome(e)) {
      // Keep the chrome up for the press. The auto-hide is armed for 3.5s while playing, and if
      // it expired between this pointerdown and the click it would strip the button's
      // `pointer-events` and swallow the press — the very failure this guard exists to stop,
      // arriving from the timer instead of from the tap. A slide-off fires no handler, so
      // re-arm here rather than merely cancelling.
      revealControls()
      return
    }
    drag.current = { active: true, pointerId: e.pointerId, lastY: e.clientY, moved: 0 }
    engine.setScrubbing(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const isDragPointer = (e: React.PointerEvent) =>
    drag.current.active && e.pointerId === drag.current.pointerId
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragPointer(e)) return
    const dy = e.clientY - drag.current.lastY
    drag.current.lastY = e.clientY
    drag.current.moved += Math.abs(dy)
    engine.scrubBy(-dy)
  }
  /**
   * iOS cancels a pointer out from under you — a swipe from the screen edge, a notification, a
   * stray fourth touch — and no pointerup follows. Without this the drag stays latched and so
   * does `setScrubbing(true)`, which pins the engine's target velocity at zero: the script
   * freezes and no button can revive it, because a press on the chrome no longer runs any of
   * this. The release has to have its own handler.
   */
  const onPointerCancel = (e: React.PointerEvent) => {
    if (!isDragPointer(e)) return
    const wasDrag = drag.current.moved >= 6
    drag.current.active = false
    engine.setScrubbing(false)
    // A cancelled drag is still a drag the presenter made, and it owes Smart Follow the same
    // re-anchor a clean lift gives it. Without this the matcher keeps the pre-drag word, so the
    // next thing the presenter says pulls the script back to where they dragged away from —
    // the manual override undone by the recovery from an interruption. Gated on it having been
    // a real drag: a cancelled *tap* moved nothing and must not re-anchor anything.
    if (wasDrag && usingSFRef.current) {
      const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
      if (index != null) sfRef.current.reanchorTo(index)
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    // Nothing to do for a pointer that never started a drag here — a press on a button, or the
    // second finger of a two-finger hold. Matching the id is what keeps that lift from tearing
    // down a drag another finger is still making, so no separate chrome guard is needed on the
    // way up: a drag that began on the script and ends over the chrome is still this pointer's,
    // and still owes the engine the `setScrubbing(false)` below.
    if (!isDragPointer(e)) return
    const wasTap = drag.current.moved < 6
    drag.current.active = false
    // Adopts the dragged-to position as the follow target, so nothing lurches while we
    // work out which word the presenter landed on.
    engine.setScrubbing(false)
    if (!wasTap) {
      // A real drag: the presenter has moved the script by hand — usually back to a line they
      // fumbled. Tell Smart Follow where they now are so it carries on from there (PRD §37).
      // Guarded on Smart Follow being *enabled*, deliberately not on `listening`. `listening`
      // only goes true after Vosk's startMic() resolves, which the browser driver cannot do
      // (no mic, and the 50MB model is gitignored) — gating on it would make Task 6 silently
      // bypass this entire path and still report green. Re-anchoring while not listening is
      // harmless: start() resets the index regardless, and sfStatusLabel checks !sf.listening
      // before status, so 'following' cannot leak onto the screen.
      if (usingSFRef.current) {
        const index = wordIndexAtAnchor(viewportRef.current, undefined, lineHeightPx)
        if (index != null) sfRef.current.reanchorTo(index)
      }
      return
    }
    if (!controlsVisible) {
      setControlsVisible(true)
      scheduleHide(engine.playing)
      return
    }
    // Controls already visible: tap a line to recenter it, or tap empty space to dismiss controls.
    if (jumpToLineAt(e.clientX, e.clientY)) {
      setControlsVisible(true)
      scheduleHide(engine.playing)
    } else {
      setControlsVisible(false)
    }
  }

  /**
   * What went wrong, in words the presenter can act on.
   *
   * `useVosk` has always composed a precise reason and this screen used to discard it, so a
   * refused microphone read as the same dead end as a missing one — "Manual — mic unavailable",
   * with no hint that a permission prompt was waiting to be answered.
   */
  const sfFailureLabel =
    sfFailure === 'model'
      ? 'Manual — speech model unavailable · tap to retry'
      : sfFailure === 'permission'
        ? 'Manual — allow the mic, then tap to retry'
        : 'Manual — mic unavailable · tap to retry'

  const sfStatusLabel =
    settings.smartFollow && sfFailure
      ? sfFailureLabel
      : !usingSmartFollow
        ? null
        : sf.loading
          ? 'Loading model…'
          : !sf.listening
            ? 'Smart Follow'
            : !sf.following
              ? `Paused — say "${resumePhraseFor(settings.language)}"`
              : sf.status === 'finding'
                ? 'Finding your place…'
                : sf.status === 'paused'
                  ? 'Smart Follow paused'
                  : '● Following'

  return (
    <div
      ref={viewportRef}
      className="relative h-full touch-none overflow-hidden bg-bg select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <PromptText
        doc={scriptDoc}
        preset={preset}
        mirror={settings.mirror}
        contentRef={contentRef}
        wordIndices={usingSmartFollow}
      />
      <FocusZone readingMarker={settings.readingMarker} lineHeightPx={lineHeightPx} />
      {DEBUG_STT && (
        <div className="pointer-events-none absolute right-3 bottom-3 z-40 max-w-[70vw] rounded-lg bg-black/80 p-3 font-mono text-[11px] leading-snug text-white/80">
          <div className="mb-1 text-white/40">
            heard, newest first · G = grammar recognizer, · = open speech · green = matched
          </div>
          <div ref={heardRef} />
        </div>
      )}
      <PromptChrome
        visible={controlsVisible}
        onExit={exit}
        status={commandFlash ?? sfStatusLabel}
        // Actionable only while showing a failure — and never over a command flash, which is a
        // transient confirmation with nothing to retry.
        onStatusClick={
          !commandFlash && settings.smartFollow && sfFailure ? retrySmartFollow : undefined
        }
      />
      <PromptControls
        visible={controlsVisible}
        playing={playing}
        speedMultiplier={speed}
        showSpeed={!usingSmartFollow}
        onRestart={restart}
        onSlower={() => changeSpeed(-SPEED_STEP)}
        onPlayPause={togglePlay}
        onFaster={() => changeSpeed(SPEED_STEP)}
        onNudgeBack={() => nudgeLines(-1)}
        onNudgeForward={() => nudgeLines(1)}
      />
    </div>
  )
}
