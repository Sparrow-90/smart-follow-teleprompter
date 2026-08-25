import type { Model, KaldiRecognizer } from 'vosk-browser'

/**
 * On-device speech via Vosk (WebAssembly) — offline, private, continuous, works in Safari.
 * Replaces the browser Web Speech stopgap. The mic path uses a ScriptProcessorNode →
 * `acceptWaveform`; a `feedFloat` seam lets tests drive it from a WAV with no microphone.
 */

export interface VoskFinal {
  text: string
  latencyMs: number
}

export interface VoskEngine {
  load: (modelUrl: string) => Promise<void>
  /**
   * Take the microphone and open the audio graph. Deliberately independent of `load` so it can
   * run inside the user gesture that started Smart Follow — see the note on `startRecognition`.
   */
  startMic: () => Promise<void>
  /**
   * Build the recognizer for the open mic's sample rate. Requires `load` to have finished.
   *
   * `grammar` adds a SECOND recognizer on the same model, constrained to those phrases. It exists
   * because open-vocabulary recognition of a short command against a 280k-word lexicon is
   * unreliable — see voiceCommands.commandGrammarFor. Same model, so no extra download.
   */
  startRecognition: (grammar?: string[]) => void
  /** Testable seam: feed raw PCM (e.g. decoded from a WAV) as if it came from the mic. */
  feedFloat: (samples: Float32Array, sampleRate: number) => void
  /**
   * Start the grammar recognizer without a microphone, for the WAV-driven verification seam.
   * The mic path gets one via `startRecognition(grammar)` instead.
   */
  startCommandRecognition: (sampleRate: number, grammar: string[]) => void
  stop: () => void
  onPartial: (cb: (text: string) => void) => void
  onFinal: (cb: (r: VoskFinal) => void) => void
  /**
   * A phrase from the grammar recognizer, if one is running. Kept separate from onPartial/onFinal
   * so a command phrase can never be mixed into the rolling window that drives position matching.
   */
  onCommandPhrase: (cb: (text: string) => void) => void
  readonly ready: boolean
}

export function createVoskEngine(): VoskEngine {
  let model: Model | null = null
  let recognizer: KaldiRecognizer | null = null
  let commandRecognizer: KaldiRecognizer | null = null
  let recognizerRate = 0
  let audioContext: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let mute: GainNode | null = null
  let stream: MediaStream | null = null
  let utteranceStart = 0

  let partialCb: (text: string) => void = () => {}
  let finalCb: (r: VoskFinal) => void = () => {}
  let commandCb: (text: string) => void = () => {}

  /**
   * A second recognizer on the SAME model, decoding against a handful of phrases rather than the
   * whole lexicon. Only its finals are read: a grammar partial flickers between candidates as the
   * phrase is still being said, and acting on that would fire on half a command.
   */
  const ensureCommandRecognizer = (sampleRate: number, grammar: string[]) => {
    if (!model) throw new Error('Vosk model not loaded')
    commandRecognizer?.remove()
    commandRecognizer = new model.KaldiRecognizer(sampleRate, JSON.stringify(grammar))
    commandRecognizer.on('result', (m) => {
      const text = (m as { result: { text: string } }).result.text
      if (text) commandCb(text)
    })
  }

  const ensureRecognizer = (sampleRate: number) => {
    if (recognizer && recognizerRate === sampleRate) return
    if (!model) throw new Error('Vosk model not loaded')
    recognizer?.remove()
    recognizer = new model.KaldiRecognizer(sampleRate)
    recognizerRate = sampleRate
    recognizer.on('partialresult', (m) => {
      const partial = (m as { result: { partial: string } }).result.partial
      if (partial) {
        if (!utteranceStart) utteranceStart = performance.now()
        partialCb(partial)
      }
    })
    recognizer.on('result', (m) => {
      const text = (m as { result: { text: string } }).result.text
      if (text) {
        finalCb({ text, latencyMs: performance.now() - (utteranceStart || performance.now()) })
      }
      utteranceStart = 0
    })
  }

  return {
    get ready() {
      return model !== null
    },
    async load(modelUrl: string) {
      // Imported lazily: vosk-browser's dist/vosk.js is 5.8MB. Statically imported it lands in
      // the entry chunk and pushes the app shell past workbox's 2MB precache limit, which fails
      // the PWA build outright. Behind a dynamic import it becomes its own chunk, fetched the
      // first time Smart Follow actually starts — so the shell stays small and precacheable.
      const { createModel } = await import('vosk-browser')
      model = await createModel(modelUrl)
    },
    async startMic() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      audioContext = new AudioContext()
      // Safari suspends contexts created after an await — resume within the user gesture chain.
      if (audioContext.state === 'suspended') await audioContext.resume()
      source = audioContext.createMediaStreamSource(stream)
      processor = audioContext.createScriptProcessor(4096, 1, 1)
      // Until `startRecognition` runs there is no recognizer yet and these frames are dropped.
      // That window is the model download, and dropping it is right: those are words spoken
      // before Smart Follow was listening.
      processor.onaudioprocess = (e) => {
        try {
          recognizer?.acceptWaveform(e.inputBuffer)
        } catch {
          /* transient */
        }
        // Separate try: a throw from the command recognizer must not stop the main one, which is
        // what actually keeps the presenter's place on screen.
        try {
          commandRecognizer?.acceptWaveform(e.inputBuffer)
        } catch {
          /* transient */
        }
      }
      // Route through a muted gain so the mic isn't echoed to the speakers.
      mute = audioContext.createGain()
      mute.gain.value = 0
      source.connect(processor)
      processor.connect(mute)
      mute.connect(audioContext.destination)
    },
    startRecognition(grammar) {
      if (!audioContext) throw new Error('Microphone not open')
      ensureRecognizer(audioContext.sampleRate)
      if (grammar && grammar.length > 0) {
        ensureCommandRecognizer(audioContext.sampleRate, grammar)
      }
    },
    feedFloat(samples: Float32Array, sampleRate: number) {
      ensureRecognizer(sampleRate)
      recognizer?.acceptWaveformFloat(samples, sampleRate)
      // Mirrors the mic path in `onaudioprocess`: both recognizers hear the same audio.
      commandRecognizer?.acceptWaveformFloat(samples, sampleRate)
    },
    startCommandRecognition(sampleRate: number, grammar: string[]) {
      ensureCommandRecognizer(sampleRate, grammar)
    },
    stop() {
      // Released explicitly: the model holds a registry of live recognizers keyed by id, so one
      // would leak per session otherwise. The main recognizer is kept for reuse across start/stop
      // (rebuilding it costs a rate check); the grammar one is cheap and tied to the language.
      commandRecognizer?.remove()
      commandRecognizer = null
      processor?.disconnect()
      source?.disconnect()
      mute?.disconnect()
      stream?.getTracks().forEach((t) => t.stop())
      void audioContext?.close()
      processor = null
      source = null
      mute = null
      stream = null
      audioContext = null
      utteranceStart = 0
    },
    onPartial(cb) {
      partialCb = cb
    },
    onFinal(cb) {
      finalCb = cb
    },
    onCommandPhrase(cb) {
      commandCb = cb
    },
  }
}

export const VOSK_MODELS: Record<string, string> = {
  'en-US': '/models/vosk-model-small-en-us-0.15.tar.gz',
  'pl-PL': '/models/vosk-model-small-pl-0.22.tar.gz',
}
