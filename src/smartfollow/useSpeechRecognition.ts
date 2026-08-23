import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Thin wrapper over the browser's built-in Web Speech API (Chrome/Edge). This is a
 * **test-only** speech source for the POC — it streams audio to the browser vendor's
 * cloud and is not offline/private, so it is NOT what ships. It exists purely to feel the
 * matcher → follow loop with a real voice on a laptop before the on-device engine lands.
 *
 * Chrome's continuous recognition stops on its own (after a pause or ~60s). We recover by
 * spinning up a FRESH recognition instance on `end`, plus a watchdog that restarts if no
 * result has arrived for a while — otherwise the mic silently dies mid-session (the "freeze").
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface Options {
  lang: string
  windowWords?: number
  onWords: (recentWords: string[], transcript: string) => void
}

export interface SpeechController {
  supported: boolean
  listening: boolean
  error: string | null
  /** Auto-restarts so far (diagnostic — high numbers hint at flaky recognition). */
  restarts: number
  start: () => void
  stop: () => void
}

const WATCHDOG_MS = 6000

export function useSpeechRecognition({ lang, windowWords = 8, onWords }: Options): SpeechController {
  const supported = useRef<boolean>(getCtor() !== null).current
  const [listening, setListening] = useState(false)
  const [restarts, setRestarts] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalWordsRef = useRef<string[]>([])
  const wantOnRef = useRef(false)
  const lastResultAtRef = useRef(0)
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const langRef = useRef(lang)
  langRef.current = lang
  const onWordsRef = useRef(onWords)
  onWordsRef.current = onWords

  const spinUp = useCallback((isRestart: boolean) => {
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = langRef.current
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      lastResultAtRef.current = performance.now()
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0].transcript
        if (res.isFinal) {
          finalWordsRef.current.push(...text.trim().split(/\s+/).filter(Boolean))
        } else {
          interim += text + ' '
        }
      }
      const interimWords = interim.trim().split(/\s+/).filter(Boolean)
      const combined = [...finalWordsRef.current, ...interimWords]
      const recent = combined.slice(-windowWords)
      if (recent.length > 0) onWordsRef.current(recent, combined.join(' '))
      if (finalWordsRef.current.length > 200) {
        finalWordsRef.current = finalWordsRef.current.slice(-100)
      }
    }
    rec.onerror = (ev) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return
      setError(
        ev.error === 'not-allowed'
          ? 'Microphone permission denied — allow the mic and press Start again.'
          : `Speech error: ${ev.error}`,
      )
    }
    rec.onend = () => {
      // Chrome ends sessions periodically; spin up a fresh instance while still wanted.
      if (wantOnRef.current) {
        setRestarts((n) => n + 1)
        spinUp(true)
      } else {
        setListening(false)
      }
    }

    recRef.current = rec
    lastResultAtRef.current = performance.now()
    try {
      rec.start()
      if (!isRestart) setListening(true)
    } catch {
      // start() can throw if a previous instance is still tearing down; the watchdog recovers.
    }
  }, [windowWords])

  const start = useCallback(() => {
    if (!getCtor()) {
      setError('Speech recognition is not supported in this browser (try Chrome or Edge).')
      return
    }
    setError(null)
    finalWordsRef.current = []
    wantOnRef.current = true
    spinUp(false)

    if (watchdogRef.current) clearInterval(watchdogRef.current)
    watchdogRef.current = setInterval(() => {
      if (!wantOnRef.current) return
      if (performance.now() - lastResultAtRef.current > WATCHDOG_MS) {
        // No results for a while — assume a silent death and restart fresh.
        setRestarts((n) => n + 1)
        try {
          recRef.current?.abort()
        } catch {
          /* ignore */
        }
        spinUp(true)
      }
    }, 2000)
  }, [spinUp])

  const stop = useCallback(() => {
    wantOnRef.current = false
    if (watchdogRef.current) clearInterval(watchdogRef.current)
    watchdogRef.current = null
    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  useEffect(() => stop, [stop])

  return { supported, listening, error, restarts, start, stop }
}
