/**
 * Spoken control of the script — "Promptly up" / "Promptly down" / "Promptly go".
 *
 * The presenter is reading aloud continuously, so every word this detector sees is a candidate
 * for being ordinary script text. Two rules keep it from firing on the script itself:
 *
 *  1. A command is a WAKE WORD followed immediately by a VERB. Neither half acts alone — "look
 *     up" and "he replied promptly" are prose, not instructions.
 *  2. The pair must sit at the END of the recognition window. Vosk resends the whole utterance
 *     on every partial, so a pair matched anywhere would fire repeatedly as the words drift back
 *     through the rolling window.
 *
 * There are two vocabularies, because the small Vosk models have a CLOSED lexicon and cannot
 * emit a word they do not hold. `promptly`/`up`/`down`/`go` are all in vosk-model-small-en-us-0.15
 * and NONE of them exist in vosk-model-small-pl-0.22 — which is why "Promptly up" is inert in
 * Polish however clearly it is spoken. `asystent`/`góra`/`dół`/`start` are the mirror image:
 * present in the Polish model, absent from the English one.
 *
 * Both sets live in one table and are accepted whatever the language setting, with no per-language
 * fork. That is safe precisely because of the closed lexicons: neither model can produce the
 * other's words, so the two vocabularies cannot collide or steal each other's triggers.
 */

export type VoiceCommand = 'back' | 'forward' | 'resume'

/**
 * Accepted forms of the wake word.
 *
 * `promptly` and `prompt` are the English model's own words (it clips the unstressed final
 * syllable often enough to be worth both).
 *
 * The klik-/click family is the one wake word BOTH models hold outright — `click` is in the
 * English lexicon and klik/klika/kliknij/klikam/klikaj are all in the Polish one. It is therefore
 * the only trigger here that depends on no substitution at all, which makes it the robust choice
 * and the one to prefer. Several Polish inflections are listed because which of them a spoken
 * "klik" lands on is a property of the voice, not of the word.
 *
 * `prad` is the fallback for presenters who say "Prompt" in Polish. Measured on the device: that
 * lexicon holds no prompt/promptly at all, so it returns the nearest word it does have — "prąd"
 * (normalizeWord folds the ogonek). Kept because it is confirmed working, unlike the earlier
 * prom- guesses at the same substitution, which were simply wrong and have been removed.
 *
 * `asystent` is kept as the guaranteed fallback: it is an ordinary Polish word the model knows
 * outright, so it works even if none of the prom- forms match a particular voice. Remove it only
 * once "Prompt" is confirmed working on the device.
 *
 * This list is the tuning knob — widen it if the model turns out to hear something else
 * consistently, but every addition costs false-trigger resistance.
 */
export const WAKE_WORDS = [
  // Held outright by both models — the robust, universal choice.
  'klik',
  'click',
  'klika',
  'kliknij',
  'klikam',
  'klikaj',
  // English brand phrase; both are in the en-US lexicon.
  'promptly',
  'prompt',
  // Polish fallbacks, both confirmed working.
  'prad',
  'asystent',
] as const

/**
 * Verb → what it does. "up" is BACK: the presenter's reading position moves up the script.
 *
 * The Polish entries are stored folded (gora, dol) because that is what `normalizeWord` hands the
 * detector — it strips the diacritics Vosk actually emits in "góra" and "dół". The table test
 * pins that; an entry left as "góra" would silently never match.
 */
export const COMMAND_VERBS: Record<string, VoiceCommand> = {
  up: 'back',
  down: 'forward',
  go: 'resume',
  gora: 'back',
  dol: 'forward',
  start: 'resume',
}

/**
 * Find a command at the tail of `recent` (already normalized by `normalizeWord`).
 * Returns null when the last two words are not a wake word followed by a verb.
 */
export function detectCommand(recent: string[]): VoiceCommand | null {
  if (recent.length < 2) return null
  const verb = recent[recent.length - 1]
  const wake = recent[recent.length - 2]
  if (!(WAKE_WORDS as readonly string[]).includes(wake)) return null
  return COMMAND_VERBS[verb] ?? null
}

/**
 * The resume phrase to SHOW the presenter for a given recognition language. Detection itself
 * accepts both vocabularies regardless; this only picks which one is worth advertising, because
 * the other one physically cannot be recognized by the loaded model.
 */
export function resumePhraseFor(lang: string): string {
  return lang.startsWith('pl') ? 'Klik start' : 'Click go'
}

// --- grammar-constrained recognition ---------------------------------------

/**
 * Vosk's out-of-grammar token. Anything the presenter says that is not one of the listed phrases
 * comes back as this.
 *
 * It is NOT optional. A grammar without it forces every utterance onto its nearest listed phrase,
 * so reading the script aloud would fire commands continuously — the recognizer would have no way
 * to say "that wasn't a command". With it, ordinary speech returns [unk] and is discarded.
 */
export const GRAMMAR_UNKNOWN = '[unk]'

/**
 * The phrases a command recognizer is allowed to return, for one language.
 *
 * Open-vocabulary recognition is what failed in Polish: the decoder had to pick "klik góra" out of
 * a ~280k-word lexicon, against every inflection that sounds like it (`górę`, `górą`, `górze`…).
 * A grammar turns that into a choice between three phrases and "not a command", which is a
 * different and far easier problem — and it is why this needs no guessing about which inflection
 * comes back: the recognizer can only return what is listed here.
 *
 * Deliberately ONE wake form per language rather than every accepted spelling. The grammar's power
 * comes from being small; adding near-identical alternatives just reintroduces the confusion it
 * exists to remove. The broader WAKE_WORDS list still applies to the open-vocabulary path.
 *
 * Never mix languages: every word must be in the loaded model's lexicon, and the two models share
 * none of these.
 */
export function commandGrammarFor(lang: string): string[] {
  const phrases = lang.startsWith('pl')
    ? ['klik góra', 'klik dół', 'klik start']
    : ['click up', 'click down', 'click go']
  return [...phrases, GRAMMAR_UNKNOWN]
}
