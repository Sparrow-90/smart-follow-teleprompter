/**
 * A tap on the Prompt Mode controls is the controls' own — it must not reach the viewport's
 * drag/tap handling underneath.
 *
 * The bug this pins: the chrome sits inside the viewport, so a press on Play also arrived at the
 * viewport's pointer handlers, which read it as a tap on empty script and hid the whole interface
 * — and hiding it puts `pointer-events-none` on the button before the browser dispatches `click`,
 * so on Safari the press did nothing at all. Only a finger that drifted the 6px which makes it a
 * drag ever started the prompter.
 *
 * Driven with touchscreen taps, not mouse clicks: the failure is a touch one, and a tap is the
 * only input that produces the pointerdown → pointerup → click ordering it depends on.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1194, height: 834 }, // iPad landscape
  hasTouch: true,
  isMobile: false,
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Tap the centre of an element the way a finger does. */
const tap = async (locator) => {
  const box = await locator.boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

/** How far the script has been scrolled, in px — the translateY the engine writes each frame. */
const offset = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-prompter-text]')
    if (!el) throw new Error('no prompter text')
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
  })
/**
 * Is the chrome up? Read through the Restart button rather than looking for the container the fix
 * marks — `pointer-events` is an inherited property, so the hidden chrome's `pointer-events-none`
 * shows up on the button itself. A check that keyed on the fix's own attribute would find nothing
 * on unfixed code and pass by vacuum.
 */
const chromeVisible = () =>
  page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Restart"]')
    if (!btn) throw new Error('no Restart button — not in Prompt Mode?')
    return getComputedStyle(btn).pointerEvents !== 'none'
  })

console.log('1. Script -> Setup, Smart Follow OFF (headless has no mic; manual mode really scrolls)')
await page.goto(BASE, { waitUntil: 'networkidle' })
await sleep(400)
const editor = page.getByRole('textbox', { name: 'Script' })
await editor.click()
for (let i = 1; i <= 12; i++) await editor.type(`Line number ${i} of the running script\n`)
await sleep(400)
await page.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
await page.getByText('Smart Follow', { exact: true }).click()
await sleep(200)
await page.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(500)

console.log('2. One tap on Play')
const before = await offset()
await tap(page.getByRole('button', { name: 'Play' }))
await sleep(150)
check('chrome still visible after tapping Play', await chromeVisible())
check(
  'Play switched to Pause (the press was received)',
  await page.getByRole('button', { name: 'Pause' }).isVisible(),
)
await sleep(1200)
const after = await offset()
check('script is moving', Math.abs(after - before) > 10, `${before} -> ${after.toFixed(1)}px`)

console.log('3. One tap on Pause')
await tap(page.getByRole('button', { name: 'Pause' }))
await sleep(150)
check('chrome still visible after tapping Pause', await chromeVisible())
check(
  'Pause switched back to Play',
  await page.getByRole('button', { name: 'Play' }).isVisible(),
)
// Pause eases the velocity down rather than cutting it, so the text coasts to a halt: the ramp
// is exponential and never reaches exactly zero. Sample after it has settled and ask that the
// remaining drift be under a pixel, not that the number has stopped changing at all.
await sleep(2000)
const settled = await offset()
await sleep(800)
const drift = Math.abs((await offset()) - settled)
check('script has stopped', drift < 1, `${drift.toFixed(2)}px of drift in 800ms`)

console.log('4. The viewport still gets taps that are not on the chrome')
// A point over no rendered line and no chrome — the "tapped empty space" case, which dismisses.
const empty = await page.evaluate(() => {
  for (let y = 60; y < window.innerHeight - 60; y += 8) {
    const el = document.elementFromPoint(window.innerWidth / 2, y)
    if (el && !el.closest('[data-prompter-line]') && !el.closest('[data-prompt-chrome]')) {
      return { x: window.innerWidth / 2, y }
    }
  }
  return null
})
check('found a point of empty script to tap', !!empty)
if (empty) {
  await page.touchscreen.tap(empty.x, empty.y)
  await sleep(150)
  check('chrome hidden by a tap on empty script', !(await chromeVisible()))
  // The path the guard must NOT take: the chrome is pointer-events-none while hidden, so this
  // tap targets the script beneath it and has to wake the controls back up.
  await page.touchscreen.tap(empty.x, empty.y)
  await sleep(150)
  check('chrome woken again by the next tap', await chromeVisible())
}

console.log('5. One tap on Exit — a swallowed press here traps the presenter in Prompt Mode')
await tap(page.getByRole('button', { name: 'Exit' }))
await sleep(400)
check(
  'back in the editor',
  await page.getByRole('textbox', { name: 'Script' }).isVisible(),
)

await browser.close()
console.log(failures ? `FAILED (${failures})` : 'DONE — all checks passed')
process.exit(failures ? 1 : 0)
