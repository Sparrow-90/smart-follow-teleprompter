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
  /**
   * Phrases the grammar-constrained recognizer allows. Passing them starts a second recognizer on
   * the same model, decoding only those — see voiceCommands.commandGrammarFor for why.
   */
  grammar?: string[]
  /**
   * A complete phrase from that recognizer. Deliberately NOT routed through the rolling word
   * window: the window drives position matching, and a command phrase pushed into it would be
   * matched against the script as if the presenter had read it aloud.
   */
  onCommandPhrase?: (text: string) => void
}

/**
 * Which part of the start sequence gave out — each has a completely different remedy, and only
 * `permission` is one the presenter can act on from inside Prompt Mode. Keeping it separate from
 * a plain `mic` failure is what lets the UI offer a retry instead of the same dead end it shows
 * for a missing input device.
 */
export type VoskErrorKind = 'mic' | 'permission' | 'model'

export interface VoskController {
  listening: boolean
  loading: boolean
  error: string | null
  errorKind: VoskErrorKind | null
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

export function useVosk({
  lang,
  windowWords = 8,
  onWords,
  grammar,
  onCommandPhrase,
}: Options): VoskController {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<VoskErrorKind | null>(null)
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
  const onCommandPhraseRef = useRef(onCommandPhrase)
  onCommandPhraseRef.current = onCommandPhrase
  const grammarRef = useRef(grammar)
  grammarRef.current = grammar
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
    setErrorKind(null)
    // Everything up to the mic being live is 'mic'; everything after it is the model's fault.
    let phase: VoskErrorKind = 'mic'
    try {
      if (!engineRef.current) {
        const eng = createVoskEngine()
        eng.onPartial((p) => emit(p))
        eng.onCommandPhrase((text) => onCommandPhraseRef.current?.(text))
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
      // Microphone first, model second. The model is a 40-50MB download on a hosted build, so
      // loading it first puts tens of seconds between the presenter's tap and this line — and
      // Safari will not hand over the mic, or will keep the AudioContext suspended, that far
      // outside the gesture that asked for it. Taking the mic here keeps it in the gesture.
      await eng.startMic()
      phase = 'model'
      if (loadedLangRef.current !== langRef.current) {
        setLoading(true)
        await eng.load(VOSK_MODELS[langRef.current])
        loadedLangRef.current = langRef.current
        setLoading(false)
      }
      finalWordsRef.current = []
      partialWordsRef.current = []
      partialSkipRef.current = 0
      eng.startRecognition(grammarRef.current)
      setListening(true)
    } catch (e) {
      // The mic may already be live — a failed download must not stand the recording indicator
      // up on the tablet with Smart Follow switched off.
      engineRef.current?.stop()
      setListening(false)
      setLoading(false)
      // NotAllowedError can only come from the mic half; a model 404 is never a permission
      // problem, so the phase still decides everything else.
      const denied = e instanceof Error && e.name === 'NotAllowedError'
      setErrorKind(phase === 'mic' && denied ? 'permission' : phase)
      setError(
        denied
          ? 'Microphone permission denied — allow the mic and try again.'
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

  return { listening, loading, error, errorKind, latencyMs, start, stop, resetWindow }
}
