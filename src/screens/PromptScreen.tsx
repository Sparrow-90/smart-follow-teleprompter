import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { PRESETS } from '../model/presets'
import { useSmoothFollow } from '../engine/useSmoothFollow'
import { useWakeLock } from '../engine/useWakeLock'
import { PromptText } from '../components/prompt/PromptText'
import { FocusZone } from '../components/prompt/FocusZone'
import { PromptControls } from '../components/prompt/PromptControls'
import { PromptChrome } from '../components/prompt/PromptChrome'
import { useSmartFollow } from '../smartfollow/useSmartFollow'
import { wordIndexAtAnchor, firstWordIndexIn } from '../smartfollow/positionMap'

const MIN_SPEED = 0.4
const MAX_SPEED = 3.0
const SPEED_STEP = 0.2
const HIDE_DELAY = 3500

export function PromptScreen() {
  const scriptDoc = useStore((s) => s.scriptDoc)
  const settings = useStore((s) => s.settings)
  const goTo = useStore((s) => s.goTo)
  const preset = PRESETS[settings.preset]
  const lineHeightPx = preset.fontSize * preset.lineHeight

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

  const sf = useSmartFollow({
    doc: scriptDoc,
    engine,
    viewportRef,
    lang: settings.language,
    lineHeightPx,
    mirror: settings.mirror,
  })
  const [micFailed, setMicFailed] = useState(false)
  useEffect(() => {
    if (sf.error) setMicFailed(true)
  }, [sf.error])
  const usingSmartFollow = settings.smartFollow && !micFailed

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
      if (s.listening) {
        s.stop()
        setPlaying(false)
        scheduleHide(false)
      } else {
        s.start()
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
      index: () => sfRef.current.getIndex(),
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__prompter
    }
  }, [engine])

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

  // Pointer: drag to scrub (manual override always wins). A tap wakes the controls; a tap on
  // a line *while controls are visible* recenters that line — so a tap mid-read never yanks the text.
  const drag = useRef({ active: false, lastY: 0, moved: 0 })
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, lastY: e.clientY, moved: 0 }
    engine.setScrubbing(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const dy = e.clientY - drag.current.lastY
    drag.current.lastY = e.clientY
    drag.current.moved += Math.abs(dy)
    engine.scrubBy(-dy)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return
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

  const sfStatusLabel =
    settings.smartFollow && micFailed
      ? 'Manual — mic unavailable'
      : !usingSmartFollow
        ? null
        : sf.loading
          ? 'Loading model…'
          : !sf.listening
            ? 'Smart Follow'
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
    >
      <PromptText
        doc={scriptDoc}
        preset={preset}
        mirror={settings.mirror}
        contentRef={contentRef}
        wordIndices={usingSmartFollow}
      />
      <FocusZone readingMarker={settings.readingMarker} />
      <PromptChrome visible={controlsVisible} onExit={exit} status={sfStatusLabel} />
      <PromptControls
        visible={controlsVisible}
        playing={playing}
        speedMultiplier={speed}
        showSpeed={!usingSmartFollow}
        onRestart={restart}
        onSlower={() => changeSpeed(-SPEED_STEP)}
        onPlayPause={togglePlay}
        onFaster={() => changeSpeed(SPEED_STEP)}
      />
    </div>
  )
}
