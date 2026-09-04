import { describe, it, expect } from 'vitest'
import type { ScriptDoc } from '../model/document'
import { tokenizeScript } from './tokenizeScript'
import { matchPosition } from './matcher'

/** Build tokens from one line of text. */
const toks = (text: string) => tokenizeScript({ blocks: [{ type: 'text', runs: [{ text }] }] } as ScriptDoc)

describe('matchPosition — basic alignment', () => {
  const t = toks('Dzisiaj premier przedstawił nowy program mieszkaniowy') // 0..5

  it('locates an exact phrase with high confidence', () => {
    const r = matchPosition(t, 0, ['premier', 'przedstawił', 'nowy'])
    expect(r.index).toBe(3) // "nowy"
    expect(r.confidence).toBeGreaterThan(0.75)
    expect(r.moved).toBe(true)
  })

  it('returns confidence 0 and stays put for an empty phrase', () => {
    const r = matchPosition(t, 2, [])
    expect(r.index).toBe(2)
    expect(r.confidence).toBe(0)
    expect(r.moved).toBe(false)
  })
})

describe('matchPosition — natural language tolerance (§31)', () => {
  it('localises through paraphrase, added and dropped words', () => {
    const t = toks('Dzisiaj premier przedstawił nowy program mieszkaniowy')
    // "Dziś rano premier przedstawił zupełnie nowy program dotyczący mieszkalnictwa"
    const r = matchPosition(t, 0, [
      'dziś', 'rano', 'premier', 'przedstawił', 'zupełnie', 'nowy', 'program',
    ])
    expect(r.index).toBe(4) // "program"
    expect(r.confidence).toBeGreaterThan(0.5)
    expect(r.moved).toBe(true)
  })
})

describe('matchPosition — local context priority (§32)', () => {
  it('picks the nearby occurrence, not an identical phrase far away', () => {
    const t = toks(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima alpha bravo charlie',
    ) // "alpha bravo charlie" at 0-2 and 12-14
    const r = matchPosition(t, 1, ['alpha', 'bravo', 'charlie'])
    expect(r.index).toBe(2) // the near one, not 14
  })
})

describe('matchPosition — backtracking (§33)', () => {
  it('allows a small move back when the presenter repeats an earlier line', () => {
    const t = toks('one two three four five six seven eight nine ten eleven twelve')
    const r = matchPosition(t, 10, ['four', 'five', 'six'])
    expect(r.index).toBe(5) // "six"
    expect(r.moved).toBe(true)
  })
})

describe('matchPosition — skipping content (§34)', () => {
  it('jumps forward when the presenter skips ahead and matches strongly', () => {
    const t = toks(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen',
    )
    const r = matchPosition(t, 2, ['sixteen', 'seventeen', 'eighteen'])
    expect(r.index).toBe(17) // "eighteen"
    expect(r.confidence).toBeGreaterThan(0.75)
  })
})

describe('matchPosition — false-jump resistance (§30)', () => {
  it('keeps the current position for a garbled phrase', () => {
    const t = toks('one two three four five six seven eight nine ten')
    const r = matchPosition(t, 6, ['qwerty', 'asdfgh', 'zxcvbn'])
    expect(r.index).toBe(6)
    expect(r.moved).toBe(false)
    expect(r.confidence).toBeLessThan(0.4)
  })
})

describe('matchPosition — tracks a long continuous read (§73.7)', () => {
  it('advances monotonically to the end through 30% word dropout', () => {
    const text =
      'dzisiaj premier przedstawil nowy program mieszkaniowy dla mlodych rodzin w calym kraju ' +
      'program ma na celu obnizenie kosztow i wsparcie osob kupujacych pierwsze mieszkanie ' +
      'krytycy pytaja jak ten program bedzie finansowany i czy to sie uda ' +
      'zwolennicy mowia ze to odpowiada na dlugotrwaly niedobor mieszkan w miastach ' +
      'opozycja zazadala wiecej szczegolow na temat harmonogramu i kosztow calego programu'
    const t = toks(text)
    let cur = 0
    let maxBack = 0
    for (let readPos = 3; readPos <= t.length; readPos += 2) {
      const win: string[] = []
      for (let k = Math.max(0, readPos - 6); k < readPos; k++) {
        if (k % 3 !== 0) win.push(t[k].text) // drop every 3rd word (recognition noise)
      }
      const prev = cur
      cur = matchPosition(t, cur, win).index
      maxBack = Math.max(maxBack, prev - cur) // watch for big backward slips
    }
    expect(cur).toBeGreaterThan(t.length - 8) // reached the end
    expect(maxBack).toBeLessThan(6) // never lurched backward
  })
})

describe('matchPosition — reports the matched line', () => {
  it('carries lineIndex of the matched token', () => {
    const doc: ScriptDoc = {
      blocks: [
        { type: 'text', runs: [{ text: 'first line here' }] },
        { type: 'text', runs: [{ text: 'second line words' }] },
      ],
    }
    const t = tokenizeScript(doc)
    const r = matchPosition(t, 0, ['second', 'line', 'words'])
    expect(r.lineIndex).toBe(1)
  })
})

describe('matchPosition — localOnly (manual re-anchor guard)', () => {
  // The distinctive phrase sits ~70 words past the current position, far outside the
  // forward window of 40, so only a global widening can reach it.
  const t = toks(
    'alpha beta gamma delta epsilon ' +
      Array.from({ length: 70 }, (_, i) => `filler${i}`).join(' ') +
      ' zeppelin kalejdoskop sygnalizacja',
  )

  it('reaches a distant phrase by default (global widening)', () => {
    const r = matchPosition(t, 0, ['zeppelin', 'kalejdoskop', 'sygnalizacja'])
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('sygnalizacja')
  })

  it('holds position when localOnly is set and the phrase is out of local range', () => {
    const r = matchPosition(t, 0, ['zeppelin', 'kalejdoskop', 'sygnalizacja'], { localOnly: true })
    expect(r.moved).toBe(false)
    expect(r.index).toBe(0)
  })

  it('still tracks normally inside the local window when localOnly is set', () => {
    const r = matchPosition(t, 0, ['beta', 'gamma', 'delta'], { localOnly: true })
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('delta')
    expect(r.confidence).toBeGreaterThan(0.75)
  })
})

describe('matchPosition — a far jump needs real evidence (§30)', () => {
  // The presenter is at the top. Sixty words of padding push the rest of the script outside the
  // forward window (40), so nothing below can be reached except by widening the search.
  const t = toks(
    'alfa beta gamma delta epsilon zeta ' +
      Array.from({ length: 60 }, (_, i) => `wypelniacz${i}`).join(' ') +
      ' pierwszy raport zaczyna sie teraz nadchodzi',
  )

  it('holds position when only half the phrase lines up far away', () => {
    // "raport … sie … nadchodzi" — three of six, in order: exactly the chance alignment an
    // off-script sentence or a garbled patch of recognition produces somewhere in a long script.
    // It scores 0.5, which clears the local bar and used to move the presenter 68 words down.
    const r = matchPosition(t, 3, ['raport', 'wczoraj', 'sie', 'okazalo', 'nadchodzi', 'burza'])
    expect(r.moved).toBe(false)
    expect(r.index).toBe(3)
  })

  it('still reaches that phrase when the whole of it lines up', () => {
    const r = matchPosition(t, 3, ['pierwszy', 'raport', 'zaczyna', 'sie', 'teraz', 'nadchodzi'])
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('nadchodzi')
  })

  it('never crosses the script on a single word, however well it matches', () => {
    // One word scores a perfect 1.0 wherever it occurs, so no ratio can refuse it — the evidence
    // floor is the only thing that can, and one word can never carry enough of it.
    const r = matchPosition(t, 3, ['nadchodzi'])
    expect(r.moved).toBe(false)
    expect(r.index).toBe(3)
  })

  it('still tracks inside the local window on a single word', () => {
    const r = matchPosition(t, 3, ['epsilon'])
    expect(r.moved).toBe(true)
    expect(t[r.index].text).toBe('epsilon')
  })

  // The evidence floor is absolute while a word's rarity is normalized by log(N), so a SHORT
  // script is where a legitimate phrase could fall under it — the asymmetric failure direction.
  // A twenty-word script with the presenter at the end, restarting from the top, is the smallest
  // real case that still needs a widened search: `back` only reaches 8 words up.
  it('still finds a restart from the top of a twenty-word script', () => {
    const short = toks(
      'dzisiaj premier przedstawil nowy program mieszkaniowy dla mlodych rodzin kraju ' +
        'obnizenie kosztow wsparcie osob kupujacych pierwsze mieszkanie krytycy pytaja finansowany',
    )
    const r = matchPosition(short, short.length - 1, ['dzisiaj', 'premier', 'przedstawil'])
    expect(r.moved).toBe(true)
    expect(short[r.index].text).toBe('przedstawil')
  })
})
