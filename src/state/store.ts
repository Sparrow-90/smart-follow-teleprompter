import { create } from 'zustand'
import { type ScriptDoc, emptyDoc } from '../model/document'
import { type Settings, type Theme, defaultSettings } from '../model/settings'
import { loadScript, saveScript, loadSettings, saveSettings } from '../persistence/storage'

export type View = 'editor' | 'setup' | 'prompt' | 'lab'

interface AppStore {
  view: View
  scriptDoc: ScriptDoc
  settings: Settings
  /** True once persisted script + settings have loaded (avoids a flash of defaults). */
  hydrated: boolean

  goTo: (view: View) => void
  setScriptDoc: (doc: ScriptDoc) => void
  clearScript: () => ScriptDoc // returns the previous doc so the UI can offer Undo
  updateSettings: (patch: Partial<Settings>) => void
  setTheme: (theme: Theme) => void
  hydrate: () => Promise<void>
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
}

export const useStore = create<AppStore>((set, get) => ({
  view: 'editor',
  scriptDoc: emptyDoc(),
  settings: { ...defaultSettings },
  hydrated: false,

  goTo: (view) => set({ view }),

  setScriptDoc: (doc) => {
    set({ scriptDoc: doc })
    void saveScript(doc)
  },

  clearScript: () => {
    const previous = get().scriptDoc
    const next = emptyDoc()
    set({ scriptDoc: next })
    void saveScript(next)
    return previous
  },

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    saveSettings(next)
    if (patch.theme) applyTheme(patch.theme)
  },

  setTheme: (theme) => get().updateSettings({ theme }),

  hydrate: async () => {
    const settings = loadSettings()
    applyTheme(settings.theme)
    const script = await loadScript()
    set({
      settings,
      scriptDoc: script ?? emptyDoc(),
      hydrated: true,
    })
  },
}))
