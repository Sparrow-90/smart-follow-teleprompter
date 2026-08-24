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
  /**
   * Forget everything heard so far. Called when the presenter re-anchors the script by hand:
   * the words still in the window were spoken *ahead* of where they have just put themselves,
   * and matching them against the new position drags the text straight back down again.
   */
  resetWindow: () => void
}

export function useVosk({ lang, windowWords = 8, onWords }: Options): VoskController {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latencyMs, setLatencyMs] = useState(0)

  const engineRef = useRef<VoskEngine | null>(null)
  const loadedLangRef = useRef<string | null>(null)
  const finalWordsRef = useRef<string[]>([])
  // Words of the utterance Vosk is still building. Kept separately from the finalized ones so a
  // reset can discard the part of it that was spoken before the reset (see `partialSkipRef`).
  const partialWordsRef = useRef<string[]>([])
  // How many leading words of the in-flight utterance to drop — set by resetWindow when it lands
  // mid-utterance, cleared when that utterance ends.
  const partialSkipRef = useRef(0)
  const onWordsRef = useRef(onWords)
  onWordsRef.current = onWords
  const langRef = useRef(lang)
  langRef.current = lang

  const emit = useCallback(
    (partial: string) => {
      partialWordsRef.current = partial.split(/\s+/).filter(Boolean)
      // Vosk may revise a partial down to fewer words than we were told to skip; clamping keeps
      // the slice empty rather than negative, so no pre-reset word can reappear.
      const skip = Math.min(partialSkipRef.current, partialWordsRef.current.length)
      const words = [...finalWordsRef.current, ...partialWordsRef.current.slice(skip)]
      const recent = words.slice(-windowWords)
      if (recent.length > 0) onWordsRef.current(recent, words.slice(-24).join(' '))
    },
    [windowWords],
  )

  const resetWindow = useCallback(() => {
    finalWordsRef.current = []
    // Anything already recognized in the current utterance is pre-reset too, so skip it. Vosk
    // resends the whole utterance on every partial, hence a count rather than a clear.
    partialSkipRef.current = partialWordsRef.current.length
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      if (!engineRef.current) {
        const eng = createVoskEngine()
        eng.onPartial((p) => emit(p))
        eng.onFinal((r) => {
          const words = r.text.split(/\s+/).filter(Boolean)
          // A reset mid-utterance also applies to that utterance's final transcript.
          finalWordsRef.current.push(...words.slice(Math.min(partialSkipRef.current, words.length)))
          // The utterance is over: the next partial starts a new one, which is all post-reset.
          partialSkipRef.current = 0
          partialWordsRef.current = []
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
      partialWordsRef.current = []
      partialSkipRef.current = 0
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

  return { listening, loading, error, latencyMs, start, stop, resetWindow }
}
