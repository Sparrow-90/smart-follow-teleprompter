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
 * There are two vocabularies, because the small Vosk models have a CLOSED lexicon and cannot emit
 * a word they do not hold. `promptly` is in vosk-model-small-en-us-0.15 and not in
 * vosk-model-small-pl-0.22 — which is why "Promptly up" is inert in Polish however clearly it is
 * spoken. `asystent`/`góra`/`dół`/`akapit` are the mirror image: present in the Polish model,
 * absent from the English one.
 *
 * Both sets live in one table and are accepted whatever the language setting, with no per-language
 * fork. An earlier version of this comment justified that by claiming the two lexicons were
 * disjoint, so neither model could produce the other's triggers. **That is not true**, and
 * `verify-lexicon.mjs` measures it: the Polish model does hold click/up/down/go, and the English
 * one holds start. Nothing is broken by the overlap, but the reason it is safe is the rule below,
 * not the lexicons — a command needs a WAKE WORD immediately followed by a verb, at the very end
 * of the recognition window. That is what the script cannot accidentally satisfy.
 */

export type VoiceCommand = 'back' | 'forward' | 'resume' | 'paragraphBack'

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
 *
 * `paragraph`/`akapit` move BACK a whole paragraph, and are named `paragraphBack` rather than
 * `paragraph` because every other command here says which way it goes. There is deliberately no
 * forward twin: the presenter gets forward for free by reading on, whereas restarting a fumbled
 * paragraph is what currently costs them a run of `klik góra` on camera. Both spellings are
 * already diacritic-free, so they satisfy the folded-key rule above without transformation.
 */
export const COMMAND_VERBS: Record<string, VoiceCommand> = {
  up: 'back',
  down: 'forward',
  go: 'resume',
  paragraph: 'paragraphBack',
  gora: 'back',
  dol: 'forward',
  start: 'resume',
  akapit: 'paragraphBack',
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
 * A grammar turns that into a choice between four phrases and "not a command", which is a
 * different and far easier problem — and it is why this needs no guessing about which inflection
 * comes back: the recognizer can only return what is listed here.
 *
 * Deliberately ONE wake form per language rather than every accepted spelling. The grammar's power
 * comes from being small; adding near-identical alternatives just reintroduces the confusion it
 * exists to remove. The broader WAKE_WORDS list still applies to the open-vocabulary path.
 *
 * Never mix languages: every word must be in the loaded model's lexicon. Note that this is a
 * requirement about coverage, NOT a claim that the lexicons are disjoint — they are not, and
 * `verify-lexicon.mjs` prints the overlap (the Polish model holds click/up/down/go, the English
 * one holds start). A mixed grammar would be partly undecodable; it is the wake-word + verb pair
 * at the end of the window, never lexicon separation, that keeps the script from firing commands.
 * That script also fails the build if any word here is missing from its model.
 */
export function commandGrammarFor(lang: string): string[] {
  const phrases = lang.startsWith('pl')
    ? ['klik góra', 'klik dół', 'klik start', 'klik akapit']
    : ['click up', 'click down', 'click go', 'click paragraph']
  return [...phrases, GRAMMAR_UNKNOWN]
}
