import { useEffect, useState } from 'react'

/**
 * The live viewport, so preset sizes can be fitted to the screen the presenter is reading.
 *
 * Shared by PromptScreen and SetupPreview rather than living in either. The preview is a scaled
 * replica of Prompt Mode, and it can only be one if both fit their preset to the SAME screen —
 * two copies of this that drifted would leave the preview a faithful miniature of a screen
 * nobody has.
 *
 * `orientationchange` as well as `resize`: iOS does not always fire the latter on a rotation,
 * and a tablet rotating is the ordinary case here, not an edge one.
 */
export function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))
  useEffect(() => {
    const measure = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    measure() // an iPad rotated before this mounted would otherwise keep the stale size
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])
  return size
}
