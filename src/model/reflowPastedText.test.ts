import { describe, it, expect } from 'vitest'
import { reflowPastedText } from './reflowPastedText'

/**
 * Text copied out of a PDF carries a newline at every *visual* line ending — where the page ran
 * out of width, not where the writer ended a thought. Pasted verbatim into a block-per-line
 * editor, every one of those becomes a paragraph, and the presenter's script arrives shredded.
 */

// The real case: a paragraph from a podcast script, copied out of a PDF. Six hard-wrapped lines,
// two paragraphs, and no blank line anywhere — the break that mattered did not survive the copy.
const PDF_PASTE = [
  '17 września 2000 r. w Muzeum Narodowym w Poznaniu doszło do jednej z najbardziej',
  'zuchwałych kradzieży dzieł sztuki w historii Polski. Bezrobotny z Olkusza w biały dzień',
  'dokonał rabunku obrazu Claude’a Moneta – „Plaża w Pourville”. Robert Z. dzieło warte kilka',
  'milionów dolarów przez 10 lat trzymał za szafą w mieszkaniu swoich rodziców.',
  'Ja nazywam się Łukasz Piątek, wy oglądacie podcast No to Piątek, a ta historia wydarzyła się',
  'naprawdę.',
].join('\n')

describe('reflowPastedText', () => {
  it('rejoins a hard-wrapped PDF paste into its original paragraphs', () => {
    expect(reflowPastedText(PDF_PASTE)).toBe(
      '17 września 2000 r. w Muzeum Narodowym w Poznaniu doszło do jednej z najbardziej ' +
        'zuchwałych kradzieży dzieł sztuki w historii Polski. Bezrobotny z Olkusza w biały dzień ' +
        'dokonał rabunku obrazu Claude’a Moneta – „Plaża w Pourville”. Robert Z. dzieło warte ' +
        'kilka milionów dolarów przez 10 lat trzymał za szafą w mieszkaniu swoich rodziców.' +
        '\n\n' +
        'Ja nazywam się Łukasz Piątek, wy oglądacie podcast No to Piątek, a ta historia ' +
        'wydarzyła się naprawdę.',
    )
  })
})

describe('reflowPastedText — leaves alone what is already right', () => {
  it('does not touch prose that is already one paragraph per line', () => {
    const clean = [
      'Pierwszy akapit jest już poprawny i nie powinien zostać w żaden sposób zmieniony.',
      '',
      'Drugi akapit również, ponieważ autor zakończył go świadomie w tym właśnie miejscu.',
      '',
      'Trzeci akapit zamyka ten krótki tekst i także musi przetrwać wklejenie bez zmian.',
    ].join('\n')
    expect(reflowPastedText(clean)).toBe(clean)
  })

  it('never swallows a list item into the line above it', () => {
    const list = [
      'Zanim zaczniemy nagranie, sprawdź proszę następujące rzeczy po kolei:',
      '- mikrofon jest podłączony i poziom dźwięku został ustawiony poprawnie',
      '- światło nie zmienia się w trakcie nagrania ani nie miga w tle',
      '- telefon jest wyciszony i leży poza zasięgiem ręki prowadzącego',
    ].join('\n')
    expect(reflowPastedText(list)).toBe(list)
  })

  it('leaves a single line exactly as it is', () => {
    expect(reflowPastedText('Jedna linia, żadnych złamań.')).toBe('Jedna linia, żadnych złamań.')
  })

  it('leaves a handful of short typed lines alone', () => {
    const typed = ['Wstęp', 'Rozwinięcie', 'Zakończenie'].join('\n')
    expect(reflowPastedText(typed)).toBe(typed)
  })
})

describe('reflowPastedText — the smaller repairs', () => {
  it('keeps a blank line the source did state as a paragraph break', () => {
    const withBlank = [
      'Pierwsza linia tego akapitu jest długa i została zawinięta przez szerokość strony,',
      'więc jej dalszy ciąg trafił do następnej linii pliku PDF i musi wrócić na miejsce.',
      '',
      'Drugi akapit zaczyna się po pustej linii, którą trzeba zachować jako prawdziwy odstęp.',
    ].join('\n')
    expect(reflowPastedText(withBlank)).toBe(
      'Pierwsza linia tego akapitu jest długa i została zawinięta przez szerokość strony, ' +
        'więc jej dalszy ciąg trafił do następnej linii pliku PDF i musi wrócić na miejsce.' +
        '\n\n' +
        'Drugi akapit zaczyna się po pustej linii, którą trzeba zachować jako prawdziwy odstęp.',
    )
  })

  it('reunites a word broken by a hyphen at the end of a line', () => {
    const hyphenated = [
      'Ta historia zaczyna się w miejscu, którego nikt się nie spodziewał, czyli w tele-',
      'prompterze stojącym w rogu studia nagraniowego przy ulicy Świętego Marcina w Poznaniu,',
      'gdzie prowadzący czytał swój tekst prosto z ekranu podczas porannego nagrania.',
    ].join('\n')
    expect(reflowPastedText(hyphenated)).toContain('teleprompterze')
    expect(reflowPastedText(hyphenated)).not.toContain('tele-')
  })

  it('removes the invisible characters a PDF copy smuggles in', () => {
    // A soft hyphen inside a word and a non-breaking space between words: both invisible on
    // screen, both fatal to Smart Follow, which would look for a word that is not there.
    const smuggled = 'Muzeum­Narodowe w Poznaniu'
    expect(reflowPastedText(smuggled)).toBe('MuzeumNarodowe w Poznaniu')
  })
})
