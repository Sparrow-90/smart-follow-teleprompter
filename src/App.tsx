import { useEffect } from 'react'
import { useStore } from './state/store'
import { EditorScreen } from './screens/EditorScreen'
import { SetupScreen } from './screens/SetupScreen'
import { PromptScreen } from './screens/PromptScreen'
import { SmartFollowLabScreen } from './screens/SmartFollowLabScreen'

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.view)
  const hydrate = useStore((s) => s.hydrate)
  const goTo = useStore((s) => s.goTo)

  useEffect(() => {
    void hydrate()
    // Hidden Smart Follow POC harness — reachable only via #lab, never from the normal flow.
    const applyHash = () => {
      if (window.location.hash === '#lab') goTo('lab')
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [hydrate, goTo])

  // Avoid a flash of default content before the last script + settings load.
  if (!hydrated) return <div className="h-full bg-bg" />

  switch (view) {
    case 'editor':
      return <EditorScreen />
    case 'setup':
      return <SetupScreen />
    case 'prompt':
      return <PromptScreen />
    case 'lab':
      return <SmartFollowLabScreen />
  }
}
