import { Fragment, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { change, travel } from '../../motion/tokens'
import {
  VOICE_COMMAND_DISPLAY_ORDER,
  displayPhrase,
  voiceCommandHelpFor,
  wakeWordHintFor,
} from '../../smartfollow/voiceCommands'

interface VoiceCommandRowProps {
  /** The recognition language whose model will be loaded. The phrases follow it exactly. */
  lang: string
}

/**
 * The one place the presenter can learn that voice commands exist.
 *
 * Until this row there was exactly ONE phrase named anywhere in the app — the status chip's
 * `Paused · say "Klik start"` — so the paragraph jump, the only way to reach a marker, was
 * advertised nowhere at all.
 *
 * Collapsed, the row still teaches two things without a tap: that spoken control exists, and that
 * every phrase starts with `Klik…` / `Click…`. That hint is where the discovery actually happens —
 * it is on screen every time Smart Follow is turned on, whereas the expanded list is only seen by
 * someone already going looking. Switching the Language control above it swaps the hint, which is
 * also how the presenter finds out the commands are bound to the recognition language.
 *
 * Everything shown comes from `voiceCommandHelpFor`, which is the array the recognizer's grammar
 * is built from. A phrase outside that grammar cannot be returned by the recognizer, so a list
 * written beside it rather than derived from it could quietly teach a command the app can never
 * obey.
 *
 * Note this is NOT a general `ui/` disclosure. There is one use site, and the repo has no
 * disclosure primitive; keep it here until something else needs one.
 */
export function VoiceCommandRow({ lang }: VoiceCommandRowProps) {
  /*
   * Deliberately local, and deliberately not persisted. `AnimatePresence` in SetupScreen unmounts
   * this row when Smart Follow goes off, so local state resets with it — hoisted into the screen
   * the flag would survive the toggle and the row would come back already open.
   */
  const [open, setOpen] = useState(false)

  const help = voiceCommandHelpFor(lang)
  // Grammar order is what the recognizer needs; this is what reads well. `flatMap` rather than
  // `map` only to drop the impossible miss without a non-null assertion — the unit tests pin that
  // the display order is a permutation of the command union, so nothing is actually lost here.
  const rows = VOICE_COMMAND_DISPLAY_ORDER.flatMap((command) => {
    const entry = help.find((e) => e.command === command)
    return entry ? [entry] : []
  })

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        // `aria-expanded` alone is the whole disclosure contract. No `aria-controls`: the panel is
        // unmounted while closed, so the id would dangle in the state the row spends most of its
        // life in, which is worse than not claiming the relationship at all.
        aria-expanded={open}
        data-voice-commands
        className="flex w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="type-label text-fg">Voice commands</span>
        <span className="flex items-center gap-2 text-fg-muted">
          <span className="text-xs">{wakeWordHintFor(lang)}</span>
          {/* A chevron flipping is a change in place, not travel through space. */}
          <motion.svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={change}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </span>
      </button>

      {/*
        The same split the Language row above uses: the space opens on the spring while the content
        fades on the faster curve, so the list is gone before the gap finishes closing. Without
        `overflow-hidden` the rows spill out during the collapse.
      */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="commands"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: travel, opacity: change }}
          >
            <div className="pb-4">
              <p className="text-xs text-fg-muted">
                Say these any time Smart Follow is listening.
              </p>
              <dl
                data-voice-command-list
                className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2"
              >
                {rows.map((entry) => (
                  <Fragment key={entry.command}>
                    {/*
                      Neither type token: the phrase is prose the presenter says out loud, so mono
                      would read as code and the uppercase label as shouting. The quotation marks
                      are what say "speak this" — the same job the status chip's `say "…"` does,
                      in typographic quotes because this is set text rather than an interpolated
                      string. `verify.mjs` pins the glyph.
                    */}
                    <dt className="text-sm text-fg">“{displayPhrase(entry.phrase)}”</dt>
                    <dd className="text-xs text-fg-muted">{entry.meaning}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
