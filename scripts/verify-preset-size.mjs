/**
 * What the presenter actually reads, measured on screen — and what Setup PROMISED they would read.
 *
 * Preset sizes are authored for one tablet and fitted to the real viewport by resolvePreset. This
 * checks the fitting reaches the DOM: that each preset fills most of the screen at tablet, laptop
 * and desktop sizes, and — the part that matters most — that the rendered line height matches the
 * lineHeightPx Smart Follow aims a line with. If those two drift, the follow targets a line the
 * presenter is not looking at.
 *
 * BOTH presets run, which they did not use to. The old version hardcoded `fontSize * 1.5` — that
 * is Distance's lineHeight, and it is the reason only Distance could ever be checked here. The
 * value is now read from the source, so Standard (1.45) goes through the same code.
 *
 * The last section is a different claim entirely: that Setup's preview does not LIE. It is a
 * scaled replica of this screen, and it used to scale the column but not the padding beside it —
 * so it wrapped text 18.5% earlier at Standard than the real thing, and nothing anywhere caught
 * it. The measure compared is content-width ÷ fontSize, which is scale-free by construction: it
 * is the same number on a 282px miniature and a 1128px screen, or the preview is not a replica.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * lineHeight per preset, READ FROM SOURCE rather than repeated. Repeating it is what limited this
 * script to one preset, and a copy here would drift the moment a device check retunes either.
 */
const presetsSrc = readFileSync('src/model/presets.ts', 'utf8')
const lineHeightOf = (preset) =>
  Number(
    presetsSrc
      .match(new RegExp(`${preset}: \\{[\\s\\S]*?\\n  \\}`))?.[0]
      ?.match(/lineHeight: ([\d.]+)/)?.[1],
  )

const PRESETS = [
  { name: 'Standard', lineHeight: lineHeightOf('standard') },
  { name: 'Distance', lineHeight: lineHeightOf('distance') },
]

const SCREENS = [
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'external display', width: 1920, height: 1080 },
]

/** How much of the screen a column must reach. Both presets clear this comfortably by design. */
const MIN_SCREEN_SHARE = 0.85
/** How far the preview's line length may sit from the real one. It should be 0. */
const MAX_MEASURE_DRIFT = 0.02

for (const p of PRESETS) {
  if (!Number.isFinite(p.lineHeight)) {
    console.log(`✗ could not read ${p.name}'s lineHeight out of presets.ts`)
    process.exit(1)
  }
}

const browser = await chromium.launch()
let failed = false
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}

/**
 * Content width ÷ font size: the line length in ems, which is what scaling must preserve.
 *
 * One object argument rather than two positional ones — page.evaluate passes exactly ONE, and a
 * two-parameter version silently receives the array as its first and `undefined` as its second.
 */
const measureIn = ({ colSel, textSel }) => {
  const col = document.querySelector(colSel)
  const cs = getComputedStyle(col)
  const box = col.getBoundingClientRect()
  const content = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const fontSize = parseFloat(getComputedStyle(document.querySelector(textSel)).fontSize)
  return { content, fontSize, em: content / fontSize, box: box.width }
}

for (const screen of SCREENS) {
  const page = await (await browser.newContext({ viewport: screen })).newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 140)))
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })

  const editor = page.getByRole('textbox', { name: 'Script' })
  await editor.click()
  await editor.type('Reading this from across the room is the entire point of the Distance preset.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await sleep(300)

  console.log(`\n${screen.name} (${screen.width}×${screen.height})`)

  for (const preset of PRESETS) {
    await page.getByRole('radio', { name: preset.name }).click()
    await sleep(500)

    // Setup's promise, measured before entering Prompt Mode.
    const promised = await page.evaluate(measureIn, {
      colSel: '[data-preview-column]',
      textSel: '[data-preview-column]',
    })
    const panelWidth = await page.evaluate(
      () => document.querySelector('[data-preview-panel]').getBoundingClientRect().width,
    )

    await page.getByRole('button', { name: 'Start Prompt' }).click()
    await sleep(600)

    const m = await page.evaluate(measureIn, {
      colSel: '[data-prompter-column]',
      textSel: '[data-prompter-text]',
    })
    const rendered = await page.evaluate(
      () => parseFloat(getComputedStyle(document.querySelector('[data-prompter-text]')).lineHeight),
    )

    // The same measurement again at a manual size, because the check is only ever as good as the
    // scale it runs at: a manual scale that reached the renderer without reaching the resolved
    // preset would leave lineHeightPx describing a line nobody is reading, and at 100% the two
    // agree whether or not that is true.
    await page.getByRole('button', { name: 'Smaller text' }).click()
    await sleep(400)
    const scaled = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-prompter-text]'))
      return { fontSize: parseFloat(cs.fontSize), lineHeight: parseFloat(cs.lineHeight) }
    })

    const share = m.box / screen.width
    console.log(`  ${preset.name}: ${m.fontSize}px, column ${Math.round(m.box)}px`)

    check(
      Math.abs(rendered - m.fontSize * preset.lineHeight) < 1,
      `${preset.name}: lineHeightPx matches what renders`,
      `${rendered}px = fontSize × ${preset.lineHeight}`,
    )
    check(
      scaled.fontSize < m.fontSize &&
        Math.abs(scaled.lineHeight - scaled.fontSize * preset.lineHeight) < 1,
      `${preset.name}: the manual size reached the RESOLVED preset`,
      `${scaled.fontSize}px / ${scaled.lineHeight}px`,
    )
    check(
      share >= MIN_SCREEN_SHARE,
      `${preset.name}: the column fills the screen`,
      `${(share * 100).toFixed(1)}% of ${screen.width}px`,
    )

    // --- Setup told the truth about all of that -----------------------------
    const drift = Math.abs(promised.em - m.em) / m.em
    check(
      drift <= MAX_MEASURE_DRIFT,
      `${preset.name}: the PREVIEW wraps where Prompt Mode wraps`,
      `preview ${promised.em.toFixed(2)} em vs real ${m.em.toFixed(2)} em (${(drift * 100).toFixed(2)}% drift)`,
    )
    check(
      promised.box / panelWidth > 0.8,
      `${preset.name}: the preview fills its panel`,
      `${((promised.box / panelWidth) * 100).toFixed(1)}% of ${Math.round(panelWidth)}px`,
    )

    // Put the manual size back BEFORE leaving, on both counts. The scale is persisted, so left
    // where it was it would leak into the next preset and quietly measure it at 92% — which is
    // what made Distance read 87.9% of the screen here instead of its real 95.5%. And 'Larger
    // text' only exists in Prompt Mode, so doing it after the exit just waits out a locator
    // timeout per preset.
    await page.getByRole('button', { name: 'Larger text' }).click()
    await sleep(300)

    // Back to Setup for the next preset.
    await page.locator('[data-prompt-chrome] button').first().click()
    await sleep(400)
    await page.getByRole('button', { name: 'Continue' }).click()
    await sleep(400)
  }
  await page.context().close()
}

await browser.close()
if (failed) {
  console.log('\n✗ a preset does not fill the screen, the follow target drifted, or Setup lied')
  process.exit(1)
}
console.log('\n✓ both presets fill the screen, lineHeightPx matches, and the preview does not lie')
