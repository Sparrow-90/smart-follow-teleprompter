import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
// Numerals only (see `.type-numeral` in index.css). A second family is not free — it is a second
// set of woff2 in the PWA precache manifest, which verify-bundle.mjs guards.
import '@fontsource-variable/geist-mono'
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
