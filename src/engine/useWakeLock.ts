import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * Keeps the screen awake during Prompt Mode via the Screen Wake Lock API, re-acquiring
 * after the tab becomes visible again. No-op (and no error) where unsupported (PRD §49).
 */
export function useWakeLock() {
  useEffect(() => {
    const nav = navigator as unknown as WakeLockNavigator
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const request = async () => {
      try {
        sentinel = (await nav.wakeLock!.request('screen')) ?? null
      } catch {
        // user gesture missing / not allowed — the teleprompter still works.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [])
}
