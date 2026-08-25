/**
 * What the presenter actually reads, measured on screen.
 *
 * Preset sizes are authored for one tablet and fitted to the real viewport by resolvePreset.
 * This checks the fitting reaches the DOM: that Distance fills most of the screen at both tablet
 * and laptop sizes, and — the part that matters most — that the rendered line height matches the
 * lineHeightPx Smart Follow aims a line with. If those two drift, the follow targets a line the
 * presenter is not looking at.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SCREENS = [
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'external display', width: 1920, height: 1080 },
]

const browser = await chromium.launch()
let failed = false

for (const screen of SCREENS) {
  const page = await (await browser.newContext({ viewport: screen })).newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 140)))
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })

  const editor = page.getByRole('textbox', { name: 'Script' })
  await editor.click()
  await editor.type('Reading this from across the room is the entire point of the Distance preset.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await sleep(300)
  await page.getByRole('radio', { name: 'Distance' }).click()
  await sleep(200)
  await page.getByRole('button', { name: 'Start Prompt' }).click()
  await sleep(500)

  const m = await page.evaluate(() => {
    const text = document.querySelector('[data-prompter-text]')
    const col = document.querySelector('[data-prompter-column]')
    const line = document.querySelector('[data-prompter-line]')
    const cs = getComputedStyle(text)
    return {
      fontSize: parseFloat(cs.fontSize),
      renderedLineHeight: parseFloat(cs.lineHeight),
      columnWidth: col.getBoundingClientRect().width,
      lineWidth: line.getBoundingClientRect().width,
    }
  })

  const share = m.columnWidth / screen.width
  // PromptScreen computes lineHeightPx as fontSize × lineHeight; the browser resolves the same
  // multiplication for `line-height`. They must agree, or Smart Follow aims at the wrong line.
  const lineHeightAgrees = Math.abs(m.renderedLineHeight - m.fontSize * 1.5) < 1

  console.log(`${screen.name} (${screen.width}×${screen.height})`)
  console.log(`  font rendered      : ${m.fontSize}px`)
  console.log(`  column             : ${Math.round(m.columnWidth)}px  (${Math.round(share * 100)}% of screen)`)
  console.log(`  line height        : ${m.renderedLineHeight}px  ${lineHeightAgrees ? '= fontSize × 1.5 ✓' : '✗ DRIFTED'}`)

  if (!lineHeightAgrees) { console.log('  ✗ Smart Follow would aim at the wrong line'); failed = true }
  if (share < 0.85) { console.log(`  ✗ column uses only ${Math.round(share * 100)}% of the screen`); failed = true }
  await page.context().close()
}

await browser.close()
if (failed) { console.log('\n✗ Distance does not fill the screen, or the follow target drifted'); process.exit(1) }
console.log('\n✓ Distance fills the screen at every size, and lineHeightPx matches what renders')
