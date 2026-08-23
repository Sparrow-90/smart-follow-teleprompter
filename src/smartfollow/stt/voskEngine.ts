import { createModel, type Model, type KaldiRecognizer } from 'vosk-browser'

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
  startMic: () => Promise<void>
  /** Testable seam: feed raw PCM (e.g. decoded from a WAV) as if it came from the mic. */
  feedFloat: (samples: Float32Array, sampleRate: number) => void
  stop: () => void
  onPartial: (cb: (text: string) => void) => void
  onFinal: (cb: (r: VoskFinal) => void) => void
  readonly ready: boolean
}

export function createVoskEngine(): VoskEngine {
  let model: Model | null = null
  let recognizer: KaldiRecognizer | null = null
  let recognizerRate = 0
  let audioContext: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let mute: GainNode | null = null
  let stream: MediaStream | null = null
  let utteranceStart = 0

  let partialCb: (text: string) => void = () => {}
  let finalCb: (r: VoskFinal) => void = () => {}

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
      model = await createModel(modelUrl)
    },
    async startMic() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      audioContext = new AudioContext()
      // Safari suspends contexts created after an await — resume within the user gesture chain.
      if (audioContext.state === 'suspended') await audioContext.resume()
      ensureRecognizer(audioContext.sampleRate)
      source = audioContext.createMediaStreamSource(stream)
      processor = audioContext.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        try {
          recognizer?.acceptWaveform(e.inputBuffer)
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
    feedFloat(samples: Float32Array, sampleRate: number) {
      ensureRecognizer(sampleRate)
      recognizer?.acceptWaveformFloat(samples, sampleRate)
    },
    stop() {
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
  }
}

export const VOSK_MODELS: Record<string, string> = {
  'en-US': '/models/vosk-model-small-en-us-0.15.tar.gz',
  'pl-PL': '/models/vosk-model-small-pl-0.22.tar.gz',
}
