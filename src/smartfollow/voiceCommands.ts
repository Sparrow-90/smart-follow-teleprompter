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

// --- what the presenter is shown -------------------------------------------

/**
 * Lines a SPOKEN nudge moves — deliberately more than the on-screen button, which moves one.
 * A finger can press twice; a voice cannot without saying the whole phrase again, and a command
 * is a recovery tool, so it should arrive somewhere useful in one go.
 *
 * It lives here rather than in PromptScreen because it is a fact about what a command DOES, and
 * the row in Setup has to describe it in the presenter's words. Two places saying "2" is how the
 * description ends up outliving the behaviour.
 */
export const VOICE_NUDGE_LINES = 2

/** One command, as the presenter is shown it. */
export interface VoiceCommandHelp {
  command: VoiceCommand
  /** Exactly the phrase the grammar recognizer may return — lowercase, diacritics intact. */
  phrase: string
  /** What it does, in the presenter's words. */
  meaning: string
}

/**
 * What each command does. English for both languages: the app has no i18n layer, every other
 * string in the UI is an English literal, and it is the PHRASE that has to be in the presenter's
 * language, not the gloss beside it.
 *
 * `Record<VoiceCommand, string>` rather than a list, so adding a fifth command and forgetting to
 * describe it is a type error rather than a row the presenter never hears about — which is the
 * exact bug this whole surface exists to fix.
 */
const COMMAND_MEANINGS: Record<VoiceCommand, string> = {
  back: `back ${VOICE_NUDGE_LINES} lines`,
  forward: `forward ${VOICE_NUDGE_LINES} lines`,
  resume: 'resume following',
  // The two-stage behaviour is the half nobody would guess, and it is easy to describe wrongly:
  // `previousParagraphIndex` returns the top of the paragraph the presenter is ALREADY IN unless
  // they are within `toleranceWords` of it, so the first say restarts this beat and only the
  // second steps back. "back one paragraph" would send someone fumbling mid-paragraph one further
  // back than they meant.
  paragraphBack: 'back to the start of this paragraph — again for the one before',
}

/**
 * The phrases themselves. This table is not documentation ABOUT the grammar; it IS the grammar —
 * `commandGrammarFor` builds the recognizer's list from it, `resumePhraseFor` reads the status
 * chip's copy out of it, and Setup's Voice commands row renders it.
 *
 * That direction is the whole point. A phrase outside the grammar physically cannot be returned by
 * the recognizer, so a list written BESIDE it could teach the presenter a command the app can never
 * obey — silently, and only in whichever language's model happens to be loaded. Derived, that
 * cannot happen. The cost is that an edit here changes UI COPY as well as what is listened for;
 * `verify-lexicon.mjs` checks every phrase against the model that has to hear it, and runs in
 * `vercel-build`, so the row's claims are build-checked for free.
 */
const COMMAND_PHRASES: Record<'pl' | 'en', Record<VoiceCommand, string>> = {
  pl: { back: 'klik góra', forward: 'klik dół', resume: 'klik start', paragraphBack: 'klik akapit' },
  en: {
    back: 'click up',
    forward: 'click down',
    resume: 'click go',
    paragraphBack: 'click paragraph',
  },
}

const phrasesFor = (lang: string) => COMMAND_PHRASES[lang.startsWith('pl') ? 'pl' : 'en']

/**
 * The order the GRAMMAR is built in. Load-bearing: `verify-lexicon.mjs` and `verify-grammar.mjs`
 * both keep the phrase list as a literal, because node cannot import a `.ts`, so reordering here
 * fails them for a reason nobody touched.
 */
const GRAMMAR_ORDER: VoiceCommand[] = ['back', 'forward', 'resume', 'paragraphBack']

/**
 * The order the presenter READS them in — the two line nudges together, the paragraph jump beside
 * them, and resume last because it is the odd one out. A separate array from `GRAMMAR_ORDER` on
 * purpose: reading order and recognizer order answer to different things, and pinning them to each
 * other would mean one of the two is always wrong.
 */
export const VOICE_COMMAND_DISPLAY_ORDER: VoiceCommand[] = [
  'back',
  'forward',
  'paragraphBack',
  'resume',
]

/** Every command, in grammar order, for the language whose model is loaded. */
export function voiceCommandHelpFor(lang: string): VoiceCommandHelp[] {
  const phrases = phrasesFor(lang)
  return GRAMMAR_ORDER.map((command) => ({
    command,
    phrase: phrases[command],
    meaning: COMMAND_MEANINGS[command],
  }))
}

/**
 * A phrase as it is WRITTEN to the presenter. `phrase` stays the recognizer's exact lowercase
 * truth; the capital is a display rule, and it lives in one place so the chip and the Setup row
 * cannot disagree about it.
 */
export function displayPhrase(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

/**
 * The resume phrase to SHOW the presenter for a given recognition language. Detection itself
 * accepts both vocabularies regardless; this only picks which one is worth advertising, because
 * the other one physically cannot be recognized by the loaded model.
 */
export function resumePhraseFor(lang: string): string {
  return displayPhrase(phrasesFor(lang).resume)
}

/**
 * The wake word alone, for the collapsed Voice commands row: `Klik…` / `Click…`.
 *
 * Read off a phrase rather than typed, so the row cannot name a wake word the grammar does not
 * actually begin with. Every phrase in a language shares it, so any of them will do.
 */
export function wakeWordHintFor(lang: string): string {
  return `${displayPhrase(phrasesFor(lang).resume.replace(/ .*/, ''))}…`
}

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
  return [...voiceCommandHelpFor(lang).map((c) => c.phrase), GRAMMAR_UNKNOWN]
}
