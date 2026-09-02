import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVosk } from './useVosk'

/**
 * The recognized-word window is what the matcher sees. These tests drive the Vosk callbacks
 * directly (no mic, no 50MB model) because the bug this guards against — stale words surviving
 * a manual re-anchor — lives here, below the `feed()` seam the browser driver uses.
 */

interface FakeEngine {
  partial: (text: string) => void
  final: (text: string) => void
  /** A phrase from the grammar-constrained command recognizer. */
  commandPhrase: (text: string) => void
  /** Engine calls in the order `start()` made them — the model download is not instant in life. */
  calls: string[]
  loadImpl: () => Promise<void>
  startMicImpl: () => Promise<void>
}
const engine = {
  calls: [],
  loadImpl: async () => {},
  startMicImpl: async () => {},
} as unknown as FakeEngine

vi.mock('./stt/voskEngine', () => ({
  VOSK_MODELS: { pl: 'model.tar.gz' },
  createVoskEngine: () => ({
    ready: true,
    load: async () => {
      engine.calls.push('load')
      await engine.loadImpl()
    },
    startMic: async () => {
      engine.calls.push('startMic')
      await engine.startMicImpl()
    },
    startRecognition: () => {
      engine.calls.push('startRecognition')
    },
    feedFloat: () => {},
    stop: () => {
      engine.calls.push('stop')
    },
    onPartial: (cb: (t: string) => void) => {
      engine.partial = cb
    },
    onFinal: (cb: (r: { text: string; latencyMs: number }) => void) => {
      engine.final = (text: string) => cb({ text, latencyMs: 10 })
    },
    onCommandPhrase: (cb: (t: string) => void) => {
      engine.commandPhrase = cb
    },
  }),
}))

beforeEach(() => {
  engine.calls = []
  engine.loadImpl = async () => {}
  engine.startMicImpl = async () => {}
})

function mount() {
  const onWords = vi.fn()
  const hook = renderHook(() => useVosk({ lang: 'pl', onWords }))
  return { hook, onWords }
}

const lastRecent = (onWords: ReturnType<typeof vi.fn>) => onWords.mock.calls.at(-1)?.[0] as string[]

describe('useVosk — resetWindow', () => {
  it('drops words finalized before the reset', async () => {
    const { hook, onWords } = mount()
    await act(async () => hook.result.current.start())
    act(() => engine.final('alpha beta gamma'))
    expect(lastRecent(onWords)).toEqual(['alpha', 'beta', 'gamma'])

    act(() => hook.result.current.resetWindow())
    act(() => engine.final('delta epsilon'))
    expect(lastRecent(onWords)).toEqual(['delta', 'epsilon'])
  })

  it('drops the part of an in-flight partial that was spoken before the reset', async () => {
    const { hook, onWords } = mount()
    await act(async () => hook.result.current.start())
    // Presenter is mid-sentence when they tap back to an earlier line.
    act(() => engine.partial('alpha beta gamma'))
    expect(lastRecent(onWords)).toEqual(['alpha', 'beta', 'gamma'])

    act(() => hook.result.current.resetWindow())
    // Same utterance continues; Vosk keeps re-sending the whole partial.
    act(() => engine.partial('alpha beta gamma delta'))
    expect(lastRecent(onWords)).toEqual(['delta'])
  })

  it('drops the pre-reset prefix from the final of a straddling utterance', async () => {
    const { hook, onWords } = mount()
    await act(async () => hook.result.current.start())
    act(() => engine.partial('alpha beta gamma'))
    act(() => hook.result.current.resetWindow())
    act(() => engine.final('alpha beta gamma delta epsilon'))
    expect(lastRecent(onWords)).toEqual(['delta', 'epsilon'])
  })

  it('stops skipping once the straddling utterance has ended', async () => {
    const { hook, onWords } = mount()
    await act(async () => hook.result.current.start())
    act(() => engine.partial('alpha beta gamma'))
    act(() => hook.result.current.resetWindow())
    act(() => engine.final('alpha beta gamma delta'))
    // A brand-new utterance must not lose its first words to a stale skip count.
    act(() => engine.partial('zeta eta'))
    expect(lastRecent(onWords)).toEqual(['delta', 'zeta', 'eta'])
  })

  it('survives Vosk shortening a partial below the skip count', async () => {
    const { hook, onWords } = mount()
    await act(async () => hook.result.current.start())
    act(() => engine.partial('alpha beta gamma'))
    act(() => hook.result.current.resetWindow())
    // Vosk revised its hypothesis down to fewer words than we were told to skip.
    act(() => engine.partial('alpha'))
    expect(onWords).toHaveBeenCalledTimes(1) // nothing new to report; no crash, no stale word
  })
})

/**
 * Ordering, not just wiring. On a hosted build the model is a 40-50MB download, so anything
 * awaited before the microphone is acquired happens tens of seconds outside the user gesture
 * that started it — and Safari suspends an AudioContext constructed there. Take the mic first,
 * download second.
 */
describe('useVosk — start order', () => {
  it('opens the microphone before downloading the model', async () => {
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    expect(engine.calls.indexOf('startMic')).toBeLessThan(engine.calls.indexOf('load'))
  })

  it('only builds the recognizer once the model has loaded', async () => {
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    expect(engine.calls.indexOf('load')).toBeLessThan(engine.calls.indexOf('startRecognition'))
  })

  it('reports a failed download as the model failing, not the mic', async () => {
    engine.loadImpl = async () => {
      throw new Error('404')
    }
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    // The mic was granted; blaming it sends the presenter to check permissions for nothing.
    expect(hook.result.current.errorKind).toBe('model')
  })

  it('tells a DENIED microphone apart from a broken one', async () => {
    // The two have different remedies and only one of them the presenter can act on. A denial is
    // recoverable — allow the mic and try again — so the UI has to be able to say so specifically
    // rather than showing the same dead end for a missing input device.
    const denied = new Error('Permission denied')
    denied.name = 'NotAllowedError'
    engine.startMicImpl = async () => {
      throw denied
    }
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    expect(hook.result.current.errorKind).toBe('permission')
  })

  it('reports any other microphone failure as a plain mic failure', async () => {
    engine.startMicImpl = async () => {
      throw new Error('Requested device not found')
    }
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    expect(hook.result.current.errorKind).toBe('mic')
  })

  it('releases the microphone when the model fails to load', async () => {
    engine.loadImpl = async () => {
      throw new Error('404')
    }
    const { hook } = mount()
    await act(async () => hook.result.current.start())
    // The mic is already live by the time the download fails; leaving it open would strand a
    // recording indicator on the tablet with Smart Follow visibly off.
    expect(engine.calls).toContain('stop')
    expect(hook.result.current.listening).toBe(false)
    expect(hook.result.current.error).toBe('404')
  })
})

describe('useVosk — the grammar recognizer', () => {
  function mountWithGrammar() {
    const onWords = vi.fn()
    const onCommandPhrase = vi.fn()
    const hook = renderHook(() =>
      useVosk({ lang: 'pl', onWords, onCommandPhrase, grammar: ['klik góra', '[unk]'] }),
    )
    return { hook, onWords, onCommandPhrase }
  }

  it('reports a grammar phrase on its own channel', async () => {
    const { hook, onCommandPhrase } = mountWithGrammar()
    await act(async () => hook.result.current.start())
    act(() => engine.commandPhrase('klik góra'))
    expect(onCommandPhrase).toHaveBeenCalledWith('klik góra')
  })

  it('keeps grammar phrases out of the window that drives position matching', async () => {
    // The window is matched against the script. A command phrase pushed into it would be treated
    // as words the presenter had read aloud, and could drag the text to wherever they appear.
    const { hook, onWords } = mountWithGrammar()
    await act(async () => hook.result.current.start())
    act(() => engine.final('alpha beta'))
    act(() => engine.commandPhrase('klik góra'))
    expect(lastRecent(onWords)).toEqual(['alpha', 'beta'])
  })
})
