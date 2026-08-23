import { useStore } from '../state/store'
import { PRESETS, PRESET_ORDER } from '../model/presets'
import { LANGUAGE_LABELS, type Preset, type SttLanguage } from '../model/settings'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Toggle } from '../components/ui/Toggle'
import { CtaButton } from '../components/ui/CtaButton'
import { SetupPreview } from '../components/setup/SetupPreview'

export function SetupScreen() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const goTo = useStore((s) => s.goTo)
  const preset = PRESETS[settings.preset]

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Scrollable content — guarantees everything is reachable on short/landscape phones. */}
      <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-6 pt-5 sm:px-10">
        <header className="flex items-center gap-3">
          <button
            onClick={() => goTo('editor')}
            aria-label="Back to editor"
            className="text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-xs font-medium tracking-wide text-fg-muted uppercase">Setup</span>
        </header>

        <main className="mt-6 grid gap-8 pb-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Controls */}
          <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-fg-muted uppercase">
              Reading distance
            </h2>
            <SegmentedControl<Preset>
              ariaLabel="Reading distance"
              value={settings.preset}
              onChange={(preset) => updateSettings({ preset })}
              options={PRESET_ORDER.map((p) => ({ value: p, label: PRESETS[p].label }))}
            />
            <p className="mt-2 text-sm text-fg-muted">{preset.helper}</p>
          </div>

          <div className="divide-y divide-border border-y border-border">
            <Toggle
              label="Smart Follow"
              checked={settings.smartFollow}
              onChange={(smartFollow) => updateSettings({ smartFollow })}
            />
            {settings.smartFollow && (
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium tracking-wide text-fg-muted uppercase">
                  Language
                </span>
                <select
                  value={settings.language}
                  onChange={(e) => updateSettings({ language: e.target.value as SttLanguage })}
                  aria-label="Smart Follow language"
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg"
                >
                  {(Object.keys(LANGUAGE_LABELS) as SttLanguage[]).map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Toggle
              label="Mirror"
              checked={settings.mirror}
              onChange={(mirror) => updateSettings({ mirror })}
            />
            <Toggle
              label="Reading Marker"
              checked={settings.readingMarker}
              onChange={(readingMarker) => updateSettings({ readingMarker })}
            />
            <Toggle
              label="Light theme"
              checked={settings.theme === 'light'}
              onChange={(light) => updateSettings({ theme: light ? 'light' : 'dark' })}
            />
          </div>
        </div>

          {/* Live preview */}
          <div className="min-h-56 sm:min-h-72">
            <SetupPreview
              preset={preset}
              presetLabel={preset.label}
              mirror={settings.mirror}
              readingMarker={settings.readingMarker}
            />
          </div>
        </main>
      </div>

      {/* Pinned CTA — always reachable regardless of viewport height. */}
      <footer className="mx-auto w-full max-w-6xl shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10">
        <CtaButton onClick={() => goTo('prompt')}>Start Prompt</CtaButton>
      </footer>
    </div>
  )
}
