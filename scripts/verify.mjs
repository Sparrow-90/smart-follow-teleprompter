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
await page.getByRole('button', { name: 'Insert pause' }).click()
await editor.type('I hope this reads naturally')
// bold "naturally" — the caret is already at the end of it, so walk the selection back
// over the word with real keystrokes. (dblclick does NOT select inside this contentEditable
// under headless Chromium, which is why this step used to pass without bolding anything.)
await page.keyboard.down('Shift')
for (let i = 0; i < 'naturally'.length; i++) await page.keyboard.press('ArrowLeft')
await page.keyboard.up('Shift')
await page.getByRole('button', { name: 'Bold selection' }).click()
await sleep(400)
const boldPressed = await page
  .getByRole('button', { name: 'Bold selection' })
  .getAttribute('aria-pressed')
const boldedText = await editor.locator('b, strong').allTextContents()
console.log('  Bold button aria-pressed:', boldPressed, '| bolded runs:', boldedText)
await shot('02-editor-filled')

console.log('3. Continue -> Setup (landscape two-pane)')
await page.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
await shot('03-setup-landscape')

console.log('4. Voice commands row (the only place the phrases are listed)')
/*
 * Smart Follow is ON by default, so the row is on screen the moment Setup opens — which is the
 * whole discoverability claim. What a unit test cannot reach is whether it RENDERS, under the
 * right condition, saying what the recognizer can actually hear.
 */
const voiceRow = page.locator('[data-voice-commands]')
const rowText = async () => (await voiceRow.innerText()).replace(/\s+/g, ' ').trim()
console.log('  collapsed:', JSON.stringify(await rowText()))
await page.getByLabel('Smart Follow language').selectOption('pl-PL')
await sleep(250)
// The wake-word hint follows the language, which is how the presenter learns the two are bound.
console.log('  after switching to Polish:', JSON.stringify(await rowText()))
await voiceRow.click()
await sleep(500)
const listed = await page.locator('[data-voice-command-list] dt').allTextContents()
const meanings = await page.locator('[data-voice-command-list] dd').allTextContents()
console.log('  aria-expanded:', await voiceRow.getAttribute('aria-expanded'))
console.log('  listed:', listed.join(' / '))
console.log('  meanings:', meanings.join(' / '))
// The four phrases commandGrammarFor('pl-PL') returns, in VOICE_COMMAND_DISPLAY_ORDER — the
// READING order, which is NOT the grammar's (back, forward, resume, paragraphBack). Kept literal
// for the same reason verify-grammar.mjs keeps its copy. The comparison is order-sensitive on
// purpose: it checks the phrases AND the order they are read in, so a deliberate reordering is
// meant to land here and be re-confirmed rather than pass unnoticed.
const expectedPhrases = ['“Klik góra”', '“Klik dół”', '“Klik akapit”', '“Klik start”']
console.log(
  "  the grammar's phrases, in reading order:",
  JSON.stringify(listed) === JSON.stringify(expectedPhrases),
)
await page.getByLabel('Smart Follow language').selectOption('en-US')
await sleep(250)
console.log(
  '  English:',
  (await page.locator('[data-voice-command-list] dt').allTextContents()).join(' / '),
)
await shot('04-setup-voice-commands')
// The list is expanded here, so these two shots are the states nothing else looks at: portrait
// stacks the grid and runs the list full width, and the light theme repaints every token in it.
// Both are token-based — but "token-based" is a claim about the code, not a look at the screen.
await page.setViewportSize({ width: 834, height: 1194 })
await sleep(300)
await shot('04b-setup-voice-commands-portrait')
await page.setViewportSize({ width: 1194, height: 834 })
await page.getByText('Light theme', { exact: true }).click()
await sleep(400)
await shot('04c-setup-voice-commands-light')
await page.getByText('Light theme', { exact: true }).click()
await sleep(400)
// The row belongs to Smart Follow: turning it off takes the whole group with it, and brings it
// back collapsed, because the open flag lives in the component that unmounts.
const settles = (state) =>
  voiceRow
    .waitFor({ state, timeout: 3000 })
    .then(() => true)
    .catch(() => false)
// Waited on rather than slept through: `travel` is a spring, and a spring keeps settling well
// past its visualDuration, so AnimatePresence unmounts noticeably later than the motion looks
// finished. A fixed delay here reported the row as still present and then toggled Smart Follow
// back on mid-exit, which is exactly the false negative this avoids.
await page.getByText('Smart Follow', { exact: true }).click()
console.log('  row gone with Smart Follow off:', await settles('detached'))
await page.getByText('Smart Follow', { exact: true }).click()
console.log('  and back with it:', await settles('attached'))
// Collapsed again because the open flag lives in the component that just unmounted.
console.log('  reopened collapsed:', (await voiceRow.getAttribute('aria-expanded')) === 'false')

console.log('5. Switch preset to Distance + toggle Mirror')
await page.getByRole('radio', { name: 'Distance' }).click()
await page.getByText('Mirror', { exact: true }).click()
await sleep(300)
await shot('05-setup-distance-mirror')

console.log('6. Setup portrait (stacking)')
await page.setViewportSize({ width: 834, height: 1194 })
await sleep(300)
await shot('06-setup-portrait')
await page.setViewportSize({ width: 1194, height: 834 })
// undo mirror so prompt reads normally
await page.getByText('Mirror', { exact: true }).click()
await sleep(200)

console.log('7. Start Prompt (enters paused, controls visible)')
await page.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(400)
const pauseBtnVisible = await page.getByRole('button', { name: 'Play' }).isVisible()
console.log('  Play button visible on entry (paused):', pauseBtnVisible)
await shot('07-prompt-paused')

console.log('8. Press play, let it scroll, screenshot moving')
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
await shot('08-prompt-playing')

console.log('9. Exit -> back to editor, script persisted')
// tap to reveal controls (they auto-hid while playing), then Exit
await page.mouse.click(597, 417)
await sleep(300)
await page.getByRole('button', { name: 'Exit' }).click()
await sleep(300)
const editorText = await page.getByRole('textbox', { name: 'Script' }).textContent()
console.log('  editor still has script:', (editorText || '').slice(0, 40) + '...')
await shot('09-editor-persisted')

console.log('10. Reload -> autosave persistence across reload')
await page.reload({ waitUntil: 'networkidle' })
await sleep(600)
const afterReload = await page.getByRole('textbox', { name: 'Script' }).textContent()
console.log('  after reload script present:', (afterReload || '').length > 0)
await shot('10-editor-after-reload')

await browser.close()
console.log('DONE')
