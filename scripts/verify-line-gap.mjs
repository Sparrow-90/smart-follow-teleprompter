/**
 * A gap between two lines of script never costs more than ONE line pitch.
 *
 * A gap is dead space the presenter has to read across, and the Focus Zone leaves very little room
 * for it: the current line sits at 40% of the viewport and the gradient has faded the text to near
 * the background colour by 82%, so there are only ~2.4 line pitches of legible runway below the
 * anchor. That figure is the same on every screen — resolvePreset scales the text by whichever
 * viewport axis is tighter, so 0.6 x 834 / (100 x 1.5) holds wherever you run it.
 *
 * Measured before promptBlocks.ts existed, at Distance: a paragraph marker cost 0.93 pitches, a
 * blank line 1.60, and a marker with a blank line beside it 2.23 — putting the next line 3.23
 * pitches below the one being read, past the fade and off the bottom edge. The presenter finished a
 * line with nothing readable to move to.
 *
 * Run with the dev server up: node scripts/verify-line-gap.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Both from FocusZone.tsx. The clear band ends CLEAR_LINES_BELOW line pitches under the anchor —
 * measured in pitches, not in percent of the screen, because a pitch is a different share of the
 * viewport at every preset (5.7% at Close, 17.8% at Distance on a 732px-tall window). A fixed
 * percentage there erased a quarter of the next line at Close and two thirds of it at Distance.
 */
const FOCUS_ANCHOR = 0.4
const CLEAR_LINES_BELOW = 2

const P1 = 'jego celem jest sprawdzenie czy'
const P2 = 'aplikacja dziala poprawnie'

/**
 * The four ways a gap gets into a script. The third is the one from the bug report: the toolbar's
 * marker leaves the caret on a trailing empty line, and pressing Enter — the natural "now start the
 * new paragraph" gesture — makes a second one, which survives into the document.
 */
const SHAPES = [
  { name: 'marker', build: async (p, ed) => { await ed.type(P1); await marker(p); await ed.type(P2) } },
  { name: 'blank line', build: async (p, ed) => { await ed.type(`${P1}\n\n${P2}`) } },
  { name: 'marker + blank line', build: async (p, ed) => { await ed.type(P1); await marker(p); await ed.type(`\n${P2}`) } },
  {
    name: 'marker + pause',
    build: async (p, ed) => {
      await ed.type(P1)
      await marker(p)
      await p.getByRole('button', { name: 'Insert pause' }).click()
      await sleep(150)
      await ed.type(P2)
    },
    bothGlyphs: true,
  },
]

const marker = async (p) => {
  await p.getByRole('button', { name: 'Insert paragraph marker' }).click()
  await sleep(150)
}

// A small window in the largest preset is the tight case, but the box height is derived from the
// preset's lineHeight, so Close (1.4, the smallest) is the one most likely to overflow its box.
const PRESETS = ['Close', 'Standard', 'Distance']

const browser = await chromium.launch()

for (const preset of PRESETS) {
  for (const shape of SHAPES) {
    const ctx = await browser.newContext({ viewport: { width: 1039, height: 732 } })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => console.log('  [pageerror]', e.message))
    await p.goto(BASE, { waitUntil: 'networkidle' })
    await sleep(300)
    const ed = p.getByRole('textbox', { name: 'Script' })
    await ed.click()
    await shape.build(p, ed)
    await sleep(400)
    await p.getByRole('button', { name: 'Continue' }).click()
    await sleep(300)
    // The preset control is a radiogroup, not buttons — getByRole('button') will not find it.
    await p.getByRole('radio', { name: preset }).click()
    await sleep(300)
    await p.getByRole('button', { name: 'Start Prompt' }).click()
    await sleep(700)

    const m = await p.evaluate(() => {
      const text = document.querySelector('[data-prompter-text]')
      const column = document.querySelector('[data-prompter-column]')
      if (!text || !column) return null
      const pitch = parseFloat(getComputedStyle(text).lineHeight)
      const lines = [...column.querySelectorAll('[data-prompter-line]')].map((el) =>
        el.getBoundingClientRect(),
      )
      const gaps = [...column.children].filter((el) => !el.hasAttribute('data-prompter-line'))
      return {
        pitch,
        viewportHeight: innerHeight,
        lineCount: lines.length,
        gapCount: gaps.length,
        // Whitespace between the two paragraphs, and how far the eye must travel from the line
        // being READ to the next one. A block wraps to several visual lines at the larger presets,
        // so the line the presenter is on is the LAST one in the first block, not its top:
        // `bottom - pitch` is that line's top.
        gapPx: lines.length >= 2 ? lines[1].top - lines[0].bottom : null,
        advancePx: lines.length >= 2 ? lines[1].top - (lines[0].bottom - pitch) : null,
        // The word index of the first word in each line. These must stay aligned to
        // tokenizeScript's global indices, which count the DOCUMENT — including the blank blocks
        // this transform drops. A drift here would silently aim Smart Follow at the wrong word.
        firstWordIndices: [...column.querySelectorAll('[data-prompter-line]')].map((el) => {
          const w = el.querySelector('[data-w]')
          return w ? Number(w.getAttribute('data-w')) : null
        }),
        // The px term inside the resolved gradient's clear stop, e.g. `40% + 261px`. Null if the
        // stop carries no px at all — which is the regression this guards against.
        clearStopPx: (() => {
          const grad = [...document.querySelectorAll('div[aria-hidden]')]
            .map((el) => getComputedStyle(el).backgroundImage)
            .find((bg) => bg.includes('gradient') && bg.includes('rgba(0, 0, 0, 0)'))
          const px = grad?.match(/40%\s*\+\s*([\d.]+)px/)
          return px ? Number(px[1]) : null
        })(),
        sectionText: column.querySelector('[data-block="section"]')?.textContent?.trim() ?? null,
        hasRules: (column.querySelector('[data-block="section"]')?.querySelectorAll('span.h-px').length ?? 0) === 2,
        hasPauseGlyph: !!column.querySelector('[data-pause]'),
        // A gap must never be a line: tap-to-jump and wordIndexAtAnchor have to fall through it.
        gapIsLine: gaps.some((el) => el.hasAttribute('data-prompter-line')),
        // A glyph may overflow the one-pitch box — a pause keeps its authored size, which is
        // taller than the box — but it must never reach into the text either side of it. That,
        // not the box, is the invariant: the gap's SPACE is capped, its contents stay legible.
        gapCollides: gaps.some((el) => {
          const content = [...el.querySelectorAll('*')]
            .map((c) => c.getBoundingClientRect())
            .filter((c) => c.height > 0)
          if (content.length === 0) return false
          const top = Math.min(...content.map((c) => c.top))
          const bottom = Math.max(...content.map((c) => c.bottom))
          return lines.some((l) => l.height > 0 && top < l.bottom && bottom > l.top)
        }),
      }
    })

    const label = `${preset} / ${shape.name}`
    if (!m) {
      check(false, `${label}: Prompt Mode rendered`)
      await ctx.close()
      continue
    }

    const pitches = m.gapPx / m.pitch
    check(
      m.lineCount === 2 && m.gapCount === 1,
      `${label}: two lines with exactly one collapsed gap between them`,
      `${m.lineCount} lines, ${m.gapCount} gaps`,
    )
    check(
      pitches <= 1.02,
      `${label}: the gap is at most one line pitch`,
      `${pitches.toFixed(2)} pitches`,
    )
    // The real test of the whole change: having finished the line at the Focus Zone, can the
    // presenter read straight on, or is the next line in the fade? The next line's TOP must reach
    // the anchor no later than the end of the clear band — that is exactly what the Focus Zone
    // promises, and capping the gap at one pitch is what keeps the promise reachable.
    const advance = m.advancePx / m.pitch
    check(
      advance <= CLEAR_LINES_BELOW + 0.02,
      `${label}: the next line begins inside the Focus Zone's clear band`,
      `next line +${advance.toFixed(2)} pitches, clear band runs to ${CLEAR_LINES_BELOW}`,
    )
    // And the band really is where FocusZone says: the resolved gradient must hold the clear stop
    // in PITCHES, not at a fixed percentage. A regression to a percentage passes every check
    // above at Standard and silently greys the next line out at Distance.
    check(
      m.clearStopPx != null && Math.abs(m.clearStopPx - CLEAR_LINES_BELOW * m.pitch) < 2,
      `${label}: the gradient's clear band is measured in line pitches`,
      `stop at +${m.clearStopPx?.toFixed(0) ?? '?'}px, expected +${(CLEAR_LINES_BELOW * m.pitch).toFixed(0)}px`,
    )
    check(!m.gapIsLine, `${label}: a gap is not a [data-prompter-line]`)
    // P1 holds five words (indices 0-4), so P2 must open at 5 however many blocks were collapsed
    // between them. Dropping a blank block must not renumber anything — tokenizeScript still
    // counts it, and every [data-w] has to agree with that or the follow aims one word off.
    check(
      JSON.stringify(m.firstWordIndices) === '[0,5]',
      `${label}: collapsing a gap does not shift the [data-w] word indices`,
      `got ${JSON.stringify(m.firstWordIndices)}, expected [0,5]`,
    )
    check(!m.gapCollides, `${label}: nothing inside a gap reaches into the text either side`)

    if (shape.name !== 'blank line') {
      check(
        m.sectionText?.includes('2') && m.hasRules,
        `${label}: the collapsed marker still draws a numbered rule`,
        `text ${JSON.stringify(m.sectionText)}, rules ${m.hasRules}`,
      )
    }
    if (shape.bothGlyphs) {
      // A pause is a reading instruction and a marker is a bookmark. Collapsing the two into one
      // pitch must not silently drop either signal.
      check(
        m.hasPauseGlyph && m.sectionText?.includes('2'),
        `${label}: one gap carries BOTH the pause glyph and the section number`,
        `pause ${m.hasPauseGlyph}, section ${JSON.stringify(m.sectionText)}`,
      )
    }
    await ctx.close()
  }
}

await browser.close()
console.log(failures === 0 ? '\nAll good.' : `\n${failures} failure(s).`)
process.exit(failures === 0 ? 0 : 1)
