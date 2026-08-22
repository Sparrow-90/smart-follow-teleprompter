import { useEffect } from 'react'
import { useStore } from './state/store'
import { EditorScreen } from './screens/EditorScreen'
import { SetupScreen } from './screens/SetupScreen'
import { PromptScreen } from './screens/PromptScreen'

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.view)
  const hydrate = useStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Avoid a flash of default content before the last script + settings load.
  if (!hydrated) return <div className="h-full bg-bg" />

  switch (view) {
    case 'editor':
      return <EditorScreen />
    case 'setup':
      return <SetupScreen />
    case 'prompt':
      return <PromptScreen />
  }
}
