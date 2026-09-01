import type { ScriptDoc } from '../model/document'
import { tokenizePhrase } from './tokenizeScript'

/**
 * Where "Klik akapit" can put the presenter.
 *
 * The command is a RECOVERY tool, not navigation: it goes backwards, to the top of the beat being
 * read. Forward costs nothing — the presenter just keeps reading — so there is no forward twin.
 *
 * Everything here is expressed in the same global word indices `tokenizeScript` produces, which is
 * what lets the caller hand a result straight to `reanchorTo` and to `[data-w={i}]` for geometry.
 */

/** Words of slack around a paragraph start that still count as "at the start". See below. */
const DEFAULT_TOLERANCE_WORDS = 3

/**
 * Word indices a paragraph jump can land on, ascending.
 *
 * **Always starts with 0.** The top of the script is section 1 and is a legitimate place to go back
 * to — this is the one thing that would be wrong if the command went forwards, where 0 has to be
 * excluded instead.
 *
 * With markers, a target is the first word *after* each marker. Without any, we fall back to every
 * text block start, so the command still does something sensible on a script nobody has marked up.
 * (In a typed script that makes it equivalent to a one-line nudge — which is the honest answer, and
 * far better than doing nothing.)
 */
export function paragraphJumpTargets(doc: ScriptDoc): number[] {
  const targets: number[] = [0]
  const blockStarts: number[] = [0]
  let hasMarker = false
  let index = 0

  for (const block of doc.blocks) {
    if (block.type === 'section') {
      hasMarker = true
      targets.push(index)
      continue
    }
    if (block.type !== 'text') continue // a pause is not a paragraph and carries no words
    blockStarts.push(index)
    index += tokenizePhrase(block.runs.map((r) => r.text).join('')).length
  }
  if (doc.blocks.length === 0) return []

  const chosen = hasMarker ? targets : blockStarts
  // `index` is now the total word count. A marker with nothing after it points past the last word,
  // so there is no line to put in the Focus Zone — drop it rather than glide into the padding.
  // Adjacent markers collapse for the same reason two entries would otherwise be identical.
  return [...new Set(chosen.filter((t) => t < index || t === 0))].sort((a, b) => a - b)
}

/**
 * Where a "Klik akapit" from `currentIndex` should go, or null when already at the top.
 *
 * Two stages, which is the universal text-editor convention and gives both useful behaviours from
 * one spoken phrase:
 *
 *  1. **Mid-paragraph** → the top of the paragraph being read. *Restart this beat* — the common case.
 *  2. **Already at the top** → the paragraph before it. Saying the command twice steps back.
 *
 * Stage 2 is reachable because `reanchorTo` leaves the matcher exactly on whatever stage 1 returned.
 * The tolerance absorbs the matcher having advanced a word or two while the glide was travelling;
 * without it the command would stick on the current paragraph and never step back.
 */
export function previousParagraphIndex(
  targets: number[],
  currentIndex: number,
  toleranceWords: number = DEFAULT_TOLERANCE_WORDS,
): number | null {
  if (targets.length === 0) return null

  // The paragraph the presenter is in: the last target at or before them. An index past the end of
  // the script (the matcher can sit on the final word) clamps into the last paragraph.
  let at = -1
  for (let i = 0; i < targets.length; i++) {
    if (targets[i] <= currentIndex) at = i
    else break
  }
  if (at < 0) return null // before the first target — nothing behind them

  if (currentIndex - targets[at] > toleranceWords) return targets[at]
  return at > 0 ? targets[at - 1] : null
}
