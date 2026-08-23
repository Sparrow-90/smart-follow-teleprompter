import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { PRESETS } from '../model/presets'
import { isEmptyDoc } from '../model/document'
import { useSmoothFollow } from '../engine/useSmoothFollow'
import { PromptText } from '../components/prompt/PromptText'
import { FocusZone } from '../components/prompt/FocusZone'
import { tokenizeScript, tokenizePhrase, type ScriptToken } from '../smartfollow/tokenizeScript'
import { matchPosition, type MatchResult } from '../smartfollow/matcher'
import { lineElementTarget } from '../smartfollow/positionMap'
import { useVosk } from '../smartfollow/useVosk'
import { createVoskEngine, VOSK_MODELS } from '../smartfollow/stt/voskEngine'

type Status = 'idle' | 'following' | 'finding' | 'paused'

const STATUS_LABEL: Record<Status, string> = {
  idle: '○ Idle',
  following: '● Following',
  finding: 'Finding your place…',
  paused: 'Smart Follow paused',
}

function statusFor(res: MatchResult | null): Status {
  if (!res) return 'idle'
  if (res.confidence >= 0.6) return 'following'
  if (res.confidence >= 0.4) return 'finding'
  return 'paused'
}

/** A few demo phrases pulled from lines through the script, so it's easy to try without a mic. */
function samplePhrases(tokens: ScriptToken[]): string[] {
  const byLine = new Map<number, string[]>()
  for (const t of tokens) {
    const arr = byLine.get(t.lineIndex) ?? []
    arr.push(t.text)
    byLine.set(t.lineIndex, arr)
  }
  const lines = [...byLine.values()].filter((w) => w.length >= 2)
  if (lines.length === 0) return []
  const picks = [0, Math.floor(lines.length / 2), lines.length - 1]
  return [...new Set(picks)].map((i) => lines[i].slice(0, 4).join(' '))
}

/**
 * Smart Follow POC harness (#lab) — matcher → engine integration, driven by a typed
 * "spoken" phrase instead of a live mic. Proves the where-am-I → follow loop on desktop.
 * The mic/VAD/STT probe (M1) is the on-device step layered on top of this same pipeline.
 */
export function SmartFollowLabScreen() {
  const goTo = useStore((s) => s.goTo)
  const scriptDoc = useStore((s) => s.scriptDoc)
  const preset = PRESETS.standard

  const tokens = useMemo(() => tokenizeScript(scriptDoc), [scriptDoc])
  const samples = useMemo(() => samplePhrases(tokens), [tokens])

  const { engine, contentRef, viewportRef } = useSmoothFollow({ baseSpeed: preset.baseSpeed })
  useEffect(() => {
    engine.setMode('follow') // Smart Follow drives the position; no auto-scroll
  }, [engine])

  const [phrase, setPhrase] = useState('')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [lang, setLang] = useState('en-US')
  const [transcript, setTranscript] = useState('')
  const indexRef = useRef(0) // avoids stale currentIndex during continuous speech
  const lastHeardAtRef = useRef(0)

  // Follow the matched WORD's visual line — works inside multi-sentence paragraphs. Words on the
  // same line share a top, so the text holds while you read across a line and eases gently to the
  // next line as you move on (the engine's velocity-limited follow does the smoothing).
  const runMatch = (words: string[]) => {
    if (tokens.length === 0 || words.length === 0) return
    lastHeardAtRef.current = performance.now()
    const res = matchPosition(tokens, indexRef.current, words)
    setResult(res)
    if (res.confidence < 0.45) return // unsure — hold position
    indexRef.current = res.index
    const wordEl = viewportRef.current?.querySelector(`[data-w="${res.index}"]`)
    const target = lineElementTarget(engine.position, wordEl, viewportRef.current)
    if (target != null) engine.setTargetPosition(target)
  }

  const feed = (text: string) => runMatch(tokenizePhrase(text))

  const vosk = useVosk({
    lang,
    onWords: (recent, full) => {
      setTranscript(full)
      runMatch(recent)
    },
  })

  // Dev-only Vosk verification hook: load a model + feed a WAV (no mic). Used by scripts/verify-vosk.mjs.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __voskTest?: unknown }).__voskTest = async (
      lang: string,
      wavUrl: string,
    ) => {
      const eng = createVoskEngine()
      const parts: string[] = []
      eng.onFinal((r) => parts.push(r.text))
      await eng.load(VOSK_MODELS[lang])
      const ab = await (await fetch(wavUrl)).arrayBuffer()
      const ctx = new AudioContext({ sampleRate: 16000 }) // match the Vosk model rate
      const audio = await ctx.decodeAudioData(ab)
      eng.feedFloat(audio.getChannelData(0), audio.sampleRate)
      eng.feedFloat(new Float32Array(audio.sampleRate), audio.sampleRate) // 1s silence → flush final
      await new Promise((r) => setTimeout(r, 2500))
      eng.stop()
      return parts.join(' ').trim()
    }
  }, [])

  // Repaint the diagnostic readout periodically.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  const heardAgo =
    vosk.listening && lastHeardAtRef.current
      ? `${((performance.now() - lastHeardAtRef.current) / 1000).toFixed(1)}s ago`
      : '—'

  const reset = () => {
    setResult(null)
    indexRef.current = 0
    setTranscript('')
    engine.setTargetPosition(0)
  }

  const status = statusFor(result)
  const matchedText = result ? (tokens[result.index]?.text ?? '') : ''

  const exit = () => {
    window.location.hash = ''
    goTo('editor')
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <span className="text-xs font-medium tracking-wide text-fg-muted uppercase">
          Smart Follow · Lab
        </span>
        <span
          data-testid="sf-status"
          className="text-xs font-medium tracking-wide text-fg tabular-nums"
        >
          {STATUS_LABEL[status]}
          {result && (
            <span className="ml-3 text-fg-muted">conf {result.confidence.toFixed(2)}</span>
          )}
        </span>
        <button
          onClick={exit}
          className="text-xs font-medium tracking-wide text-fg-muted uppercase hover:text-fg"
        >
          Exit
        </button>
      </header>

      {isEmptyDoc(scriptDoc) ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-fg-muted">
          Add a script in the Editor first, then return to #lab to try Smart Follow.
        </div>
      ) : (
        <div
          ref={viewportRef}
          data-testid="sf-viewport"
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <PromptText
            doc={scriptDoc}
            preset={preset}
            mirror={false}
            contentRef={contentRef}
            wordIndices
          />
          <FocusZone readingMarker />
        </div>
      )}

      {/* Diagnostics / drive panel */}
      <div className="shrink-0 space-y-3 border-t border-border px-5 py-4">
        {/* Microphone — on-device Vosk (offline, private, works in Safari) */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={vosk.listening ? vosk.stop : vosk.start}
            disabled={vosk.loading}
            className={
              vosk.listening
                ? 'rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg'
                : 'rounded-lg border border-fg-muted px-4 py-2 text-sm font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            {vosk.loading
              ? 'Loading model…'
              : vosk.listening
                ? '■ Stop listening'
                : '🎙 Start listening'}
          </button>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={vosk.listening || vosk.loading}
            aria-label="Recognition language"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg disabled:opacity-50"
          >
            <option value="en-US">English</option>
            <option value="pl-PL">Polski</option>
          </select>
          <span className="text-xs text-fg-muted">
            On-device (Vosk) — private, offline, no cloud. First start downloads a ~50MB model.
          </span>
        </div>
        {vosk.error && <p className="text-xs text-fg">{vosk.error}</p>}
        {transcript && (
          <p className="text-xs text-fg-muted" data-testid="sf-transcript">
            heard: <span className="text-fg">“{transcript}”</span>
          </p>
        )}
        {vosk.listening && (
          <p className="text-xs text-fg-muted tabular-nums">
            mic <span className="text-fg">running</span> · latency ~{vosk.latencyMs}ms · last heard{' '}
            {heardAgo}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            feed(phrase)
          }}
          className="flex gap-2"
        >
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Type a 'spoken' phrase and press Enter…"
            aria-label="Spoken phrase"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-muted"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            Feed
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm text-fg-muted hover:text-fg"
          >
            Reset
          </button>
        </form>

        {samples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {samples.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setPhrase(s)
                  feed(s)
                }}
                className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted hover:text-fg"
              >
                “{s}”
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-fg-muted">
          matched word <span className="text-fg" data-testid="sf-index">#{result?.index ?? '—'}</span>{' '}
          {matchedText && <span className="text-fg">“{matchedText}”</span>} · line{' '}
          <span data-testid="sf-line">{result?.lineIndex ?? '—'}</span> · next: on-device mic → VAD →
          STT (M1).
        </p>
      </div>
    </div>
  )
}
