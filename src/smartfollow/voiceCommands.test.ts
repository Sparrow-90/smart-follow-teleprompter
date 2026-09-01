import { describe, it, expect } from 'vitest'
import { normalizeWord, tokenizePhrase } from './tokenizeScript'
import {
  detectCommand,
  commandGrammarFor,
  GRAMMAR_UNKNOWN,
  WAKE_WORDS,
  COMMAND_VERBS,
} from './voiceCommands'

describe('voiceCommands — the tables', () => {
  // The detector is fed `normalizeWord` output, so any table entry that is not already a fixed
  // point of it can never match. That failure is silent, which is why it is pinned here.
  it('stores every wake word in its normalized form', () => {
    for (const w of WAKE_WORDS) expect(normalizeWord(w)).toBe(w)
  })

  it('stores every verb in its normalized form', () => {
    for (const v of Object.keys(COMMAND_VERBS)) expect(normalizeWord(v)).toBe(v)
  })
})

describe('voiceCommands — detection', () => {
  it('reads the three commands the presenter is given', () => {
    expect(detectCommand(['promptly', 'up'])).toBe('back')
    expect(detectCommand(['promptly', 'down'])).toBe('forward')
    expect(detectCommand(['promptly', 'go'])).toBe('resume')
  })

  it('takes the pair from the end of a longer window', () => {
    expect(detectCommand(['and', 'so', 'we', 'begin', 'promptly', 'up'])).toBe('back')
  })

  it('tolerates the model hearing the wake word slightly short', () => {
    expect(detectCommand(['prompt', 'down'])).toBe('forward')
  })

  // The Polish model cannot emit "promptly" — the word is not in its lexicon — so Polish gets
  // its own phrases. Both vocabularies live in one table and are accepted in either language:
  // neither model can emit the other's words, so they cannot collide.
  it('reads the Polish commands too', () => {
    expect(detectCommand(['asystent', 'gora'])).toBe('back')
    expect(detectCommand(['asystent', 'dol'])).toBe('forward')
    expect(detectCommand(['asystent', 'start'])).toBe('resume')
  })

  it('reads Polish commands as the recognizer actually spells them', () => {
    // Vosk emits "góra" and "dół" with their diacritics; normalizeWord folds them before the
    // detector sees them, which is exactly what the table stores.
    expect(detectCommand(['asystent', 'góra'].map(normalizeWord))).toBe('back')
    expect(detectCommand(['asystent', 'dół'].map(normalizeWord))).toBe('forward')
  })

  // Said in Polish, "Prompt" cannot come back as "prompt" — that word is not in the Polish
  // model. It comes back as the nearest thing that IS: the prom- family.
  // "Klik" / "Click" is the one wake word BOTH models hold outright, so neither has to
  // substitute anything. It is the only trigger here that needs no evidence about mishearing.
  it('accepts "Klik" in Polish and "Click" in English', () => {
    expect(detectCommand(['klik', 'gora'])).toBe('back')
    expect(detectCommand(['klika', 'dol'])).toBe('forward')
    expect(detectCommand(['kliknij', 'start'])).toBe('resume')
    expect(detectCommand(['click', 'up'])).toBe('back')
    expect(detectCommand(['click', 'down'])).toBe('forward')
    expect(detectCommand(['click', 'go'])).toBe('resume')
  })

  it('still accepts "Prompt" in Polish, which the model returns as "prąd"', () => {
    // Measured on device: that model holds no prompt/promptly, so it returns the nearest word
    // it does have. normalizeWord folds the ogonek, hence `prad` in the table.
    expect(detectCommand(['prad', 'gora'])).toBe('back')
    expect(detectCommand(['prąd', 'dol'].map(normalizeWord))).toBe('forward')
  })

  it('still needs the Polish wake word', () => {
    expect(detectCommand(['w', 'gore'])).toBeNull()
    expect(detectCommand(['na', 'dol', 'strony'])).toBeNull()
    expect(detectCommand(['gora'])).toBeNull()
  })
})

describe('voiceCommands — paragraph back', () => {
  it('hears "klik akapit" / "click paragraph"', () => {
    expect(detectCommand(tokenizePhrase('klik akapit'))).toBe('paragraphBack')
    expect(detectCommand(tokenizePhrase('click paragraph'))).toBe('paragraphBack')
  })

  it('needs the wake word, like every other command', () => {
    // "akapit" is an ordinary Polish word — a script about writing would fire this constantly
    // if the verb acted alone.
    expect(detectCommand(tokenizePhrase('nowy akapit'))).toBeNull()
    expect(detectCommand(tokenizePhrase('akapit'))).toBeNull()
  })

  it('only fires at the END of the window, like every other command', () => {
    // Vosk resends the whole utterance on each partial, so a pair matched anywhere would fire
    // repeatedly as it drifts back through the rolling window.
    expect(detectCommand(tokenizePhrase('klik akapit i tak dalej'))).toBeNull()
  })
})

describe('voiceCommands — resisting the script', () => {
  // Every one of these is ordinary script text. A teleprompter that jumps a line because the
  // presenter read the word "up" out loud is worse than one with no voice control at all.
  it('ignores a verb with no wake word in front of it', () => {
    expect(detectCommand(['look', 'up'])).toBeNull()
    expect(detectCommand(['further', 'down', 'the', 'page'])).toBeNull()
    expect(detectCommand(['here', 'we', 'go'])).toBeNull()
  })

  it('ignores the wake word on its own', () => {
    expect(detectCommand(['he', 'replied', 'promptly'])).toBeNull()
  })

  it('ignores the pair when it is not at the end of the window', () => {
    // Already acted on when it was last; the words then drift back through the rolling window
    // on subsequent partials and must not fire a second time.
    expect(detectCommand(['promptly', 'up', 'and', 'then'])).toBeNull()
  })

  it('ignores the wake word followed by something that is not a verb', () => {
    expect(detectCommand(['promptly', 'answered', 'the', 'question'])).toBeNull()
    expect(detectCommand(['promptly', 'upward'])).toBeNull()
  })

  it('ignores an empty or single-word window', () => {
    expect(detectCommand([])).toBeNull()
    expect(detectCommand(['promptly'])).toBeNull()
    expect(detectCommand(['up'])).toBeNull()
  })
})

describe('voiceCommands — the grammar', () => {
  // The grammar constrains the recognizer to these phrases alone, instead of making it pick them
  // out of a 280,000-word lexicon. That is what open-vocabulary recognition kept failing at.
  it('offers each command in the language the model can actually speak', () => {
    const pl = commandGrammarFor('pl-PL')
    expect(pl).toContain('klik góra')
    expect(pl).toContain('klik dół')
    expect(pl).toContain('klik start')
    expect(pl).toContain('klik akapit')

    const en = commandGrammarFor('en-US')
    expect(en).toContain('click up')
    expect(en).toContain('click down')
    expect(en).toContain('click go')
    expect(en).toContain('click paragraph')
  })

  it('never mixes the two languages into one grammar', () => {
    // Every grammar word must be in the loaded model's lexicon. Polish words handed to the
    // English model are not, so a mixed grammar would be partly undecodable.
    expect(commandGrammarFor('pl-PL').join(' ')).not.toMatch(/\b(click|up|down|go|paragraph)\b/)
    expect(commandGrammarFor('en-US').join(' ')).not.toMatch(/\b(klik|góra|dół|start|akapit)\b/)
  })

  it('always includes the unknown token', () => {
    // Without [unk] the recognizer force-fits EVERY utterance to its nearest grammar phrase, so
    // reading the script aloud would fire commands continuously. This is the whole safety catch.
    for (const lang of ['pl-PL', 'en-US']) {
      expect(commandGrammarFor(lang)).toContain(GRAMMAR_UNKNOWN)
    }
  })

  it('reads a grammar result through the same detector as open speech', () => {
    // The recognizer returns a whole phrase; normalizing it gives exactly the token pair
    // detectCommand already understands, so there is no second mapping to keep in sync.
    expect(detectCommand(tokenizePhrase('klik góra'))).toBe('back')
    expect(detectCommand(tokenizePhrase('klik dół'))).toBe('forward')
    expect(detectCommand(tokenizePhrase('klik start'))).toBe('resume')
    expect(detectCommand(tokenizePhrase('click up'))).toBe('back')
  })

  it('treats an unknown result as no command', () => {
    expect(detectCommand(tokenizePhrase(GRAMMAR_UNKNOWN))).toBeNull()
    expect(detectCommand(tokenizePhrase(''))).toBeNull()
  })
})
