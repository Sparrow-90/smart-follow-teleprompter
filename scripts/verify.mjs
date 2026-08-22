import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5188'
const OUT = '/tmp/prompter'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1194, height: 834 }, // iPad landscape
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text())
})
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('  shot:', name)
}

console.log('1. Editor empty state')
await page.goto(BASE, { waitUntil: 'networkidle' })
await sleep(400)
const continueDisabled = await page.getByRole('button', { name: 'Continue' }).isDisabled()
console.log('  Continue disabled on empty:', continueDisabled)
await shot('01-editor-empty')

console.log('2. Type script, bold a word, insert pause')
const editor = page.getByRole('textbox', { name: 'Script' })
await editor.click()
await editor.type('Something I want to tell, but what is the starting point\n')
await editor.type('Now I can see it correctly\n')
await page.getByRole('button', { name: 'Pause', exact: true }).click()
await editor.type('I hope this reads naturally')
// bold "naturally": double-click selects the word
await page.getByText('naturally', { exact: false }).last().dblclick()
await page.getByRole('button', { name: 'Bold selection' }).click()
await sleep(400)
const words = await page.getByText(/words$/).textContent()
console.log('  word count label:', words)
await shot('02-editor-filled')

console.log('3. Continue -> Setup (landscape two-pane)')
await page.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
await shot('03-setup-landscape')

console.log('4. Switch preset to Distance + toggle Mirror')
await page.getByRole('radio', { name: 'Distance' }).click()
await page.getByText('Mirror', { exact: true }).click()
await sleep(300)
await shot('04-setup-distance-mirror')

console.log('5. Setup portrait (stacking)')
await page.setViewportSize({ width: 834, height: 1194 })
await sleep(300)
await shot('05-setup-portrait')
await page.setViewportSize({ width: 1194, height: 834 })
// undo mirror so prompt reads normally
await page.getByText('Mirror', { exact: true }).click()
await sleep(200)

console.log('6. Start Prompt (enters paused, controls visible)')
await page.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(400)
const pauseBtnVisible = await page.getByRole('button', { name: 'Play' }).isVisible()
console.log('  Play button visible on entry (paused):', pauseBtnVisible)
await shot('06-prompt-paused')

console.log('7. Press play, let it scroll, screenshot moving')
const before = await page.evaluate(() => {
  const el = document.querySelector('[data-prompter-text]')
  return el ? getComputedStyle(el).transform : 'none'
})
await page.getByRole('button', { name: 'Play' }).click()
await sleep(1500)
const after = await page.evaluate(() => {
  const el = document.querySelector('[data-prompter-text]')
  return el ? getComputedStyle(el).transform : 'none'
})
console.log('  transform before:', before)
console.log('  transform after :', after)
console.log('  scrolled:', before !== after)
await shot('07-prompt-playing')

console.log('8. Exit -> back to editor, script persisted')
// tap to reveal controls (they auto-hid while playing), then Exit
await page.mouse.click(597, 417)
await sleep(300)
await page.getByRole('button', { name: 'Exit' }).click()
await sleep(300)
const editorText = await page.getByRole('textbox', { name: 'Script' }).textContent()
console.log('  editor still has script:', (editorText || '').slice(0, 40) + '...')
await shot('08-editor-persisted')

console.log('9. Reload -> autosave persistence across reload')
await page.reload({ waitUntil: 'networkidle' })
await sleep(600)
const afterReload = await page.getByRole('textbox', { name: 'Script' }).textContent()
console.log('  after reload script present:', (afterReload || '').length > 0)
await shot('09-editor-after-reload')

await browser.close()
console.log('DONE')
