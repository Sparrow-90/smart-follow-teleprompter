import { get, set } from 'idb-keyval'
import type { ScriptDoc } from '../model/document'
import { type Settings, defaultSettings } from '../model/settings'

// The script (potentially large) lives in IndexedDB; small preferences in localStorage.
const SCRIPT_KEY = 'prompter:script'
const SETTINGS_KEY = 'prompter:settings'

export async function loadScript(): Promise<ScriptDoc | null> {
  try {
    return (await get<ScriptDoc>(SCRIPT_KEY)) ?? null
  } catch {
    return null
  }
}

export async function saveScript(doc: ScriptDoc): Promise<void> {
  try {
    await set(SCRIPT_KEY, doc)
  } catch {
    // Storage unavailable (private mode, quota) — the session still works in memory.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaultSettings }
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}
