import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../state/store'
import { change, press, pressScale, travel } from '../motion/tokens'
import { PRESETS, PRESET_ORDER, applyTextScale } from '../model/presets'
import { LANGUAGE_LABELS, type Preset, type SttLanguage } from '../model/settings'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Toggle } from '../components/ui/Toggle'
import { CtaButton } from '../components/ui/CtaButton'
import { SetupPreview } from '../components/setup/SetupPreview'

export function SetupScreen() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const goTo = useStore((s) => s.goTo)
  // Carries the presenter's manual size, or the preview shows a size they are not going to get.
  // Only the manual scale, not the viewport fit: the preview is its own shrunken thing and
  // PREVIEW_SCALE is tuned against the authored numbers.
  const preset = applyTextScale(PRESETS[settings.preset], settings.textScale)

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Scrollable content — guarantees everything is reachable on short/landscape phones. */}
      <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-6 pt-5 sm:px-10">
        <header className="flex items-center gap-3">
          <motion.button
            onClick={() => goTo('editor')}
            aria-label="Back to editor"
            whileTap={{ scale: pressScale.icon }}
            transition={press}
            className="text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
          <span className="type-label text-fg-muted">Setup</span>
        </header>

        <main className="mt-6 grid gap-8 pb-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Controls */}
          <div className="flex flex-col gap-6">
          <div>
            <h2 className="type-label mb-3 text-fg-muted">
              Reading distance
            </h2>
            <SegmentedControl<Preset>
              ariaLabel="Reading distance"
              value={settings.preset}
              onChange={(preset) => updateSettings({ preset })}
              options={PRESET_ORDER.map((p) => ({ value: p, label: PRESETS[p].label }))}
            />
            {/* Fixed height so the column below does not bounce as the text swaps. */}
            <div className="mt-2 min-h-10">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={settings.preset}
                  className="text-sm text-fg-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={change}
                >
                  {preset.helper}
                </motion.p>
              </AnimatePresence>
            </div>
            {/* Said here because there is nowhere else to say it: the size control lives in Prompt
                Mode, where the presenter can see the real script from where they will stand, and a
                control nobody knows about is a control nobody uses. */}
            <p className="mt-1 text-xs text-fg-muted">
              Fine-tune the text size while prompting, with the A− / A+ buttons.
            </p>
          </div>

          <div className="divide-y divide-border border-y border-border">
            <Toggle
              label="Smart Follow"
              checked={settings.smartFollow}
              onChange={(smartFollow) => updateSettings({ smartFollow })}
            />
            {/*
              The row used to pop in and shove the whole divider stack. Now the space opens
              on the spring while the content fades on the faster curve, so it is gone before
              the gap finishes closing — without that split it reads as a squashing accordion.
              `overflow-hidden` is required or the contents spill during the collapse.
            */}
            <AnimatePresence initial={false}>
              {settings.smartFollow && (
                <motion.div
                  key="language"
                  className="overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ height: travel, opacity: change }}
                >
                  <div className="flex items-center justify-between py-3">
                    <span className="type-label text-fg-muted">
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
                </motion.div>
              )}
            </AnimatePresence>
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
              presetLabel={
                settings.textScale === 1
                  ? preset.label
                  : `${preset.label} ${Math.round(settings.textScale * 100)}%`
              }
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
