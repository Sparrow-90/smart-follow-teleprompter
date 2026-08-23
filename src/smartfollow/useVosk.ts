import { useCallback, useEffect, useRef, useState } from 'react'
import { createVoskEngine, VOSK_MODELS, type VoskEngine } from './stt/voskEngine'

/**
 * React wrapper around the on-device Vosk engine. Loads the model (~50MB, once), streams
 * the mic continuously, and emits a rolling window of the most recent recognized words —
 * offline, private, and works in Safari (unlike the browser Web Speech stopgap).
 */

interface Options {
  lang: string
  windowWords?: number
  onWords: (recentWords: string[], transcript: string) => void
}

export interface VoskController {
  listening: boolean
  loading: boolean
  error: string | null
  latencyMs: number
  start: () => void
  stop: () => void
}

export function useVosk({ lang, windowWords = 8, onWords }: Options): VoskController {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latencyMs, setLatencyMs] = useState(0)

  const engineRef = useRef<VoskEngine | null>(null)
  const loadedLangRef = useRef<string | null>(null)
  const finalWordsRef = useRef<string[]>([])
  const onWordsRef = useRef(onWords)
  onWordsRef.current = onWords
  const langRef = useRef(lang)
  langRef.current = lang

  const emit = useCallback(
    (partial: string) => {
      const words = [...finalWordsRef.current, ...partial.split(/\s+/).filter(Boolean)]
      const recent = words.slice(-windowWords)
      if (recent.length > 0) onWordsRef.current(recent, words.slice(-24).join(' '))
    },
    [windowWords],
  )

  const start = useCallback(async () => {
    setError(null)
    try {
      if (!engineRef.current) {
        const eng = createVoskEngine()
        eng.onPartial((p) => emit(p))
        eng.onFinal((r) => {
          finalWordsRef.current.push(...r.text.split(/\s+/).filter(Boolean))
          if (finalWordsRef.current.length > 200) {
            finalWordsRef.current = finalWordsRef.current.slice(-100)
          }
          setLatencyMs(Math.round(r.latencyMs))
          emit('')
        })
        engineRef.current = eng
      }
      const eng = engineRef.current
      if (loadedLangRef.current !== langRef.current) {
        setLoading(true)
        await eng.load(VOSK_MODELS[langRef.current])
        loadedLangRef.current = langRef.current
        setLoading(false)
      }
      finalWordsRef.current = []
      await eng.startMic()
      setListening(true)
    } catch (e) {
      setLoading(false)
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone permission denied — allow the mic and press Start again.'
          : e instanceof Error
            ? e.message
            : 'Could not start the microphone.',
      )
    }
  }, [emit])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setListening(false)
  }, [])

  useEffect(() => () => engineRef.current?.stop(), [])

  return { listening, loading, error, latencyMs, start, stop }
}
