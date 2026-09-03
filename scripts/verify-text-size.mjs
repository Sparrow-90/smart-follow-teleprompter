/**
 * The presenter sets their own text size, in Prompt Mode, without losing their place.
 *
 * Size is the one setting that cannot be decided at a desk — how large the text has to be is a
 * fact about the room. So the two presets are starting points and A− / A+ is the dial, and it
 * lives where the presenter can judge it: looking at the real script from where they will stand.
 *
 * What actually breaks here is not the sizing, it is the RE-ANCHOR. Changing the size reflows the
 * script, and the engine's scroll position is in pixels — the same number means a different place
 * in the text afterwards. Without putting the presenter back on the line they were reading, one
 * press throws them somewhere else in the script, which is worse than no control at all.
 *
 * Run with the dev server up: node scripts/verify-text-size.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'

/**
 * Read from source, never repeated here. verify-line-gap.mjs greps `src/` for the idiom
 * `0.4 * ...height` precisely to stop the anchor being retyped; a copy of it in this file would
 * be one more place for it to drift from, and one the grep cannot reach.
 */
const read = (file, re) => {
  const m = readFileSync(file, 'utf8').match(re)
  if (!m) throw new Error(`could not read ${re} out of ${file}`)
  return Number(m[1])
}
const FOCUS_ANCHOR = read('src/smartfollow/positionMap.ts', /export const FOCUS_ANCHOR = ([\d.]+)/)
const TEXT_SCALE_MIN = read('src/model/settings.ts', /export const TEXT_SCALE_MIN = ([\d.]+)/)
const TEXT_SCALE_MAX = read('src/model/settings.ts', /export const TEXT_SCALE_MAX = ([\d.]+)/)
// Standard's line height. The pitch check below is only meaningful against the ratio that is
// actually authored — pinned to a stale multiplier it would pass while the follow aimed wrong.
const STANDARD_LINE_HEIGHT = read(
  'src/model/presets.ts',
  /standard:\s*\{[\s\S]*?lineHeight:\s*([\d.]+)/,
)
const pct = (scale) => `${Math.round(scale * 100)}%`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// A long script, so the reading line is somewhere in the middle rather than pinned at the top —
// a re-anchor bug at position 0 is invisible, because 0 is 0 at every size.
const PARAGRAPHS = [
  'Dzień dobry i witam Państwa w dzisiejszym wydaniu wiadomości wieczornych.',
  'Zaczynamy od najważniejszych wydarzeń dnia, które poruszyły opinię publiczną.',
  'Nasz korespondent przesyła relację prosto z miejsca, w którym wszystko się zaczęło.',
  'W dalszej części programu rozmowa z ekspertem oraz prognoza pogody na weekend.',
  'A teraz przechodzimy do wiadomości sportowych i wyników wczorajszych meczów.',
  'Na koniec zapraszamy na krótki materiał o tym, jak zmienia się nasze miasto.',
]

/** Where the line at the reading anchor is, and what it says. */
const readAnchor = (p) =>
  p.evaluate((anchor) => {
    const vp = document.querySelector('[data-prompter-text]')?.parentElement
    const text = document.querySelector('[data-prompter-text]')
    if (!vp || !text) return null
    const cs = getComputedStyle(text)
    const vpRect = vp.getBoundingClientRect()
    const anchorY = vpRect.top + anchor * vpRect.height
    let best = null
    let bestDistance = Infinity
    for (const el of vp.querySelectorAll('[data-prompter-line]')) {
      const r = el.getBoundingClientRect()
      const d = anchorY < r.top ? r.top - anchorY : anchorY > r.bottom ? anchorY - r.bottom : 0
      if (d < bestDistance) {
        bestDistance = d
        best = { text: el.textContent.trim().slice(0, 40), offset: r.top - anchorY }
      }
    }
    return {
      fontSize: parseFloat(cs.fontSize),
      renderedLineHeight: parseFloat(cs.lineHeight),
      columnWidth: document.querySelector('[data-prompter-column]').getBoundingClientRect().width,
      readout: document.querySelector('[data-text-scale]')?.textContent ?? null,
      line: best,
    }
  }, FOCUS_ANCHOR)

/** Type the script, choose a preset, and start prompting. */
async function enterPromptMode(p, { preset = 'Standard' } = {}) {
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await sleep(300)
  const ed = p.getByRole('textbox', { name: 'Script' })
  await ed.click()
  for (const para of PARAGRAPHS) {
    await ed.type(para)
    await p.keyboard.press('Enter')
  }
  await sleep(300)
  await p.getByRole('button', { name: 'Continue' }).click()
  await sleep(300)
  await p.getByRole('radio', { name: preset }).click()
  await sleep(250)
  await p.getByRole('button', { name: 'Start Prompt' }).click()
  await sleep(700)
}

const SCREENS = [
  { name: 'iPad landscape', width: 1194, height: 834 },
  // The narrowest window any driver uses. Manual mode now puts six control groups in a cluster
  // that shrink-wraps and does not wrap, so this is where it would run off the screen.
  { name: 'small laptop', width: 1039, height: 732 },
]

const browser = await chromium.launch()

for (const screen of SCREENS) {
  console.log(`\n── ${screen.name} (${screen.width}x${screen.height}) ──`)
  const ctx = await browser.newContext({ viewport: screen })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 140)))
  await enterPromptMode(p)

  const larger = p.getByRole('button', { name: 'Larger text' })
  const smaller = p.getByRole('button', { name: 'Smaller text' })

  // Move down the script first, so the reading line is not the first one.
  const forward = p.getByRole('button', { name: 'Forward one line' })
  for (let i = 0; i < 4; i++) {
    await forward.click()
    await sleep(160)
  }
  // The nudge glide eases in over roughly two seconds — exponential smoothing at tau ~0.66s
  // closing to a 0.5px threshold — and its own Smart Follow re-anchor only fires once
  // isGliding() clears. Measuring before that would compare against a position still moving.
  await sleep(2500)

  const before = await readAnchor(p)
  check(before?.line != null, 'a line is sitting at the reading anchor to begin with')

  // ── 1. The size actually changes, and the follow's pitch changes with it ────────────────
  await smaller.click()
  await sleep(500)
  const smallerNow = await readAnchor(p)
  check(
    smallerNow.fontSize < before.fontSize,
    'A− renders smaller text',
    `${before.fontSize}px → ${smallerNow.fontSize}px`,
  )
  check(
    smallerNow.columnWidth < before.columnWidth,
    'the column narrows with the text, so words-per-line holds',
    `${Math.round(before.columnWidth)}px → ${Math.round(smallerNow.columnWidth)}px`,
  )
  // The number Smart Follow aims a line with is fontSize x lineHeight, and the browser resolves
  // the same multiplication for `line-height`. If the manual scale reached the renderer without
  // reaching the resolved preset, these two would part company and the follow would target a line
  // the presenter is not reading.
  const pitchAgrees = (m) =>
    Math.abs(m.renderedLineHeight - m.fontSize * STANDARD_LINE_HEIGHT) < 1
  check(
    pitchAgrees(smallerNow),
    'the rendered line pitch still matches what Smart Follow aims with',
    `${smallerNow.renderedLineHeight}px vs ${(smallerNow.fontSize * STANDARD_LINE_HEIGHT).toFixed(1)}px`,
  )

  // ── 2. The re-anchor: same line, same place ─────────────────────────────────────────────
  check(
    smallerNow.line.text === before.line.text,
    'the presenter is still on the line they were reading',
    `was ${JSON.stringify(before.line.text)}, now ${JSON.stringify(smallerNow.line.text)}`,
  )
  check(
    Math.abs(smallerNow.line.offset) < smallerNow.renderedLineHeight * 0.5,
    'that line is still AT the anchor, not merely nearest to it',
    `${smallerNow.line.offset.toFixed(0)}px off, half a pitch is ${(smallerNow.renderedLineHeight * 0.5).toFixed(0)}px`,
  )

  await larger.click()
  await sleep(500)
  const backUp = await readAnchor(p)
  check(
    Math.abs(backUp.fontSize - before.fontSize) <= 1,
    'A+ returns to the size it started from',
    `${before.fontSize}px → ${backUp.fontSize}px`,
  )
  check(
    backUp.line.text === before.line.text && Math.abs(backUp.line.offset) < backUp.renderedLineHeight * 0.5,
    'and still on the same line, at the anchor',
    `${JSON.stringify(backUp.line.text)} ${backUp.line.offset.toFixed(0)}px off`,
  )

  // ── 3. The ends of the range ────────────────────────────────────────────────────────────
  let presses = 0
  while (presses < 12 && !(await smaller.isDisabled())) {
    await smaller.click()
    await sleep(120)
    presses++
  }
  check(await smaller.isDisabled(), 'A− goes dead at the floor rather than doing nothing quietly')
  const floor = await readAnchor(p)
  check(
    floor.readout === pct(TEXT_SCALE_MIN),
    'the floor is the size the retired Close preset used to give',
    `readout ${floor.readout} after ${presses} presses`,
  )
  check(pitchAgrees(floor), 'the pitch still agrees at the floor')

  presses = 0
  while (presses < 20 && !(await larger.isDisabled())) {
    await larger.click()
    await sleep(120)
    presses++
  }
  check(await larger.isDisabled(), 'A+ goes dead at the ceiling')
  const ceiling = await readAnchor(p)
  check(
    ceiling.readout === pct(TEXT_SCALE_MAX),
    `the ceiling reads ${pct(TEXT_SCALE_MAX)}`,
    `readout ${ceiling.readout}`,
  )

  // ── 4. The controls still fit on screen ─────────────────────────────────────────────────
  const clusterFits = await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-prompt-chrome]')].map((el) =>
      el.getBoundingClientRect(),
    )
    return boxes.every((b) => b.left >= -1 && b.right <= innerWidth + 1)
  })
  check(clusterFits, 'the control cluster fits inside the screen at this width')

  // ── 5. It survives leaving and re-entering Prompt Mode ──────────────────────────────────
  while (!(await smaller.isDisabled())) {
    await smaller.click()
    await sleep(90)
  }
  // Exit is history.back(), which lands in the editor — Setup is one Continue away from there.
  await p.getByRole('button', { name: 'Exit' }).click()
  await sleep(500)
  await p.getByRole('button', { name: 'Continue' }).click()
  await sleep(300)
  await p.getByRole('button', { name: 'Start Prompt' }).click()
  await sleep(800)
  const reentered = await readAnchor(p)
  check(
    reentered.readout === pct(TEXT_SCALE_MIN),
    'the chosen size is still there after leaving Prompt Mode and coming back',
    `readout ${reentered.readout}`,
  )
  // Setup is the other place it has to show, or the preview promises a size that is not coming.
  await p.getByRole('button', { name: 'Exit' }).click()
  await sleep(400)
  await p.getByRole('button', { name: 'Continue' }).click()
  await sleep(400)
  const previewLabel = await p
    .locator(`text=/Standard ${pct(TEXT_SCALE_MIN)} — Preview/`)
    .count()
  check(previewLabel === 1, "Setup's preview names the manual size it is showing")

  await ctx.close()
}

await browser.close()
console.log(failures === 0 ? '\nAll good.' : `\n${failures} failure(s).`)
process.exit(failures === 0 ? 0 : 1)
