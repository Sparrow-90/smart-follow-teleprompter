/**
 * One press, one line — exactly.
 *
 * Tap-to-jump recentres whatever line you hit, so it travels further the lower on screen you tap;
 * at Distance, where a line is 150px and only ~5 fit, that is a lot of script for one tap. The
 * nudge buttons are the precise counterpart, and "precise" is the whole claim: this asserts the
 * move is exactly one rendered line, not roughly one.
 *
 * It also covers the trap tap-to-jump documents — follow mode smooth-damping back to its stale
 * pre-move target the instant the glide ends.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { chromium } from 'playwright'

const URL = `http://localhost:${process.env.PORT ?? '5173'}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

await p.goto(URL, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
for (const l of [
  'Today the prime minister presented a new housing program',
  'It aims to support young families across the country',
  'The plan includes lower interest rates for first buyers',
  'Construction will begin in several regions next spring',
  'Critics question how the program will be funded',
  'Supporters say it addresses a long standing shortage',
  'The opposition demanded more detail on the timeline',
  'Officials promised a full report within two weeks',
  'Markets reacted calmly to the announcement today',
  'We will follow this story as it develops further',
]) await ed.type(l + '\n')
await sleep(500)

await p.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
const sfToggle = p.getByRole('switch', { name: 'Smart Follow' })
if (!(await sfToggle.isChecked())) await sfToggle.check()
await sleep(200)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(600)

// The rendered line height — the unit a nudge is defined in.
const lineHeight = await p.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('[data-prompter-text]')).lineHeight),
)
const pos = () => p.evaluate(() => window.__prompter.position())

// Controls are already visible on entry, and Prompt Mode starts paused so they do not auto-hide.
// Do NOT tap empty space to "wake" them — a tap that hits no line dismisses them instead, and
// the text layer then swallows every later click.
const settle = async () => {
  for (let i = 0; i < 120; i++) {
    if (!(await p.evaluate(() => window.__prompter.gliding()))) return
    await sleep(16)
  }
}

const forward = p.getByRole('button', { name: 'Forward one line' })
const back = p.getByRole('button', { name: 'Back one line' })
check('the nudge buttons are on screen', await forward.isVisible(), `line height ${lineHeight}px`)

const start = await pos()
await forward.click()
await settle()
const afterOne = await pos()
const movedOne = afterOne - start
check('one press moves exactly one line', Math.abs(movedOne - lineHeight) < 1.5,
  `moved ${movedOne.toFixed(1)}px, line is ${lineHeight}px`)

await forward.click(); await settle()
await forward.click(); await settle()
const afterThree = await pos()
check('three presses move exactly three lines', Math.abs(afterThree - start - 3 * lineHeight) < 2,
  `moved ${(afterThree - start).toFixed(1)}px, expected ${(3 * lineHeight).toFixed(1)}px`)

// The failure this exists to catch: follow mode easing back to its pre-nudge target.
await sleep(1200)
const settled = await pos()
check('it does not drift back afterwards', Math.abs(settled - afterThree) < 2,
  `${afterThree.toFixed(0)} -> ${settled.toFixed(0)}`)

await back.click(); await settle()
const afterBack = await pos()
check('back one line returns exactly one line', Math.abs(afterBack - (afterThree - lineHeight)) < 2,
  `${afterThree.toFixed(0)} -> ${afterBack.toFixed(0)}`)

// Smart Follow must know where the presenter now is, or the next spoken word drags the text back.
const anchored = await p.evaluate(() => {
  const i = window.__prompter.index()
  const r = document.querySelector(`[data-w="${i}"]`)?.getBoundingClientRect()
  return { i, top: r ? r.top : null }
})
check('Smart Follow re-anchored to a word near the Focus Zone',
  anchored.top != null && Math.abs(anchored.top - 0.4 * 834) < 2 * lineHeight,
  `word #${anchored.i} at ${anchored.top == null ? '?' : Math.round(anchored.top)}px (anchor ~334px)`)

// Nudging back at the very top must not run the count off past the start.
for (let i = 0; i < 8; i++) { await back.click(); await sleep(120) }
await settle(); await sleep(600)
const atTop = await pos()
await forward.click(); await settle()
const afterTopForward = await pos()
check('at the top, one press forward still moves exactly one line',
  Math.abs(afterTopForward - atTop - lineHeight) < 2,
  `${atTop.toFixed(0)} -> ${afterTopForward.toFixed(0)}`)

// Trackpad / mouse wheel. A two-finger swipe is a wheel event, not a pointer drag, so this was
// never handled at all — on a laptop the script could not be scrolled by hand.
const beforeWheel = await pos()
await p.mouse.move(600, 400)
await p.mouse.wheel(0, 300)
await sleep(500)
const afterWheel = await pos()
check('a trackpad / wheel scroll moves the text', afterWheel > beforeWheel + 100,
  `${beforeWheel.toFixed(0)} -> ${afterWheel.toFixed(0)}`)

await sleep(1200)
const wheelSettled = await pos()
check('the wheel scroll does not drift back', Math.abs(wheelSettled - afterWheel) < 3,
  `${afterWheel.toFixed(0)} -> ${wheelSettled.toFixed(0)}`)

await b.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
