import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ScriptDoc } from '../model/document'
import { SmoothFollowEngine } from '../engine/SmoothFollowEngine'
import { useSmartFollow } from './useSmartFollow'

const { matchPositionMock, resetWindowMock } = vi.hoisted(() => ({
  matchPositionMock: vi.fn(),
  resetWindowMock: vi.fn(),
}))
vi.mock('./matcher', () => ({ matchPosition: matchPositionMock }))
vi.mock('./useVosk', () => ({
  useVosk: () => ({
    listening: false,
    loading: false,
    error: null,
    latencyMs: 0,
    start: () => {},
    stop: () => {},
    resetWindow: () => resetWindowMock(),
  }),
}))

const doc: ScriptDoc = {
  blocks: [
    { type: 'text', runs: [{ text: 'alpha beta gamma delta epsilon zeta' }] },
    { type: 'text', runs: [{ text: 'eta theta iota kappa lambda mu' }] },
  ],
} as ScriptDoc

function mount(engine: SmoothFollowEngine) {
  const viewportRef = { current: document.createElement('div') }
  return renderHook(() =>
    useSmartFollow({ doc, engine, viewportRef, lang: 'pl', lineHeightPx: 60, mirror: false }),
  )
}

beforeEach(() => {
  matchPositionMock.mockReset()
  resetWindowMock.mockReset()
  matchPositionMock.mockReturnValue({ index: 3, lineIndex: 0, confidence: 0.9, moved: true })
})
afterEach(() => vi.restoreAllMocks())

describe('useSmartFollow — reanchorTo', () => {
  it('hands the matcher the index the user chose, not the one it had', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.feed(['alpha', 'beta'])) // matcher moves it to 3
    act(() => result.current.reanchorTo(9)) // presenter drags back, lands on word 9
    // Assert here, before the next feed: onWords writes indexRef from the mock's return value,
    // so feeding again would overwrite 9 with 3 and this assertion would be meaningless.
    expect(result.current.getIndex()).toBe(9)
    act(() => result.current.feed(['eta', 'theta']))
    expect(matchPositionMock.mock.calls.at(-1)?.[1]).toBe(9)
  })

  it('restricts matching to the local window right after a re-anchor', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    act(() => result.current.feed(['sorry', 'let', 'me', 'take', 'that', 'again']))
    expect(matchPositionMock.mock.calls.at(-1)?.[3]).toMatchObject({ localOnly: true })
  })

  // Note: this spy shares a clock with React's scheduler. If this test ever turns flaky, that
  // is the cause — not the local-only logic. Swap it for an injected clock before suspecting
  // the implementation.
  it('returns to global matching once the local-only window has elapsed', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(0)
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    now.mockReturnValue(2500) // past LOCAL_ONLY_MS
    act(() => result.current.feed(['eta', 'theta']))
    expect(matchPositionMock.mock.calls.at(-1)?.[3]).toMatchObject({ localOnly: false })
  })

  it('clears the recognized-word window so pre-drag speech cannot pull the text back', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    expect(resetWindowMock).toHaveBeenCalledTimes(1)
  })

  it('holds the following status through a filler word instead of flashing "paused"', () => {
    matchPositionMock.mockReturnValue({ index: 9, lineIndex: 1, confidence: 0.1, moved: false })
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    act(() => result.current.feed(['umm'])) // filler, or a misheard breath
    expect(result.current.status).toBe('following')
  })

  it('reports status normally again once the local-only window has elapsed', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(0)
    matchPositionMock.mockReturnValue({ index: 9, lineIndex: 1, confidence: 0.1, moved: false })
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    now.mockReturnValue(2500) // past LOCAL_ONLY_MS
    act(() => result.current.feed(['umm']))
    expect(result.current.status).toBe('paused')
  })

  it('reports that it is following again', () => {
    const { result } = mount(new SmoothFollowEngine())
    act(() => result.current.reanchorTo(9))
    expect(result.current.status).toBe('following')
  })
})

describe('useSmartFollow — speech during a drag', () => {
  it('ignores recognized words while the finger is down', () => {
    const engine = new SmoothFollowEngine()
    engine.setMode('follow')
    engine.setScrubbing(true)
    const { result } = mount(engine)
    act(() => result.current.feed(['alpha', 'beta']))
    expect(matchPositionMock).not.toHaveBeenCalled()
  })

  it('resumes matching once the finger lifts', () => {
    const engine = new SmoothFollowEngine()
    engine.setMode('follow')
    engine.setScrubbing(true)
    const { result } = mount(engine)
    act(() => result.current.feed(['alpha', 'beta']))
    engine.setScrubbing(false)
    act(() => result.current.feed(['alpha', 'beta']))
    expect(matchPositionMock).toHaveBeenCalledTimes(1)
  })
})
