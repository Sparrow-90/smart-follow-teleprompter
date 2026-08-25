import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
// Carries the byline only (see --font-byline). Both subsets ship, but `unicode-range` means a
// reader only downloads latin — which already covers the ó in "Wróbel".
import '@fontsource-variable/urbanist'
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
