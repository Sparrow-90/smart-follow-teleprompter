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
 * And it pins WHEN Smart Follow is told. A nudge is a recovery tool, so the presenter is
 * re-reading within the second: `reanchorTo` is what empties the recognition window, and the
 * words still in it were spoken ahead of the line just chosen, so they out-vote the re-anchor on
 * the next partial. The re-anchor used to wait for `isGliding()` to clear, which is not when the
 * motion stops looking finished but when it comes within half a pixel of its target — measured,
 * 1.7s for one line and 2.3s for four. The destination is known at the press, so the wait was
 * never necessary.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const URL = `http://localhost:${process.env.PORT ?? '5173'}`
// Read from source, not retyped. verify-line-gap.mjs greps `src/` for the idiom `0.4 * ...height`
// to stop the anchor drifting; a copy here would be one more place for it to, and one it cannot
// see. This file used to hold two — the fraction AND the viewport height it was multiplied by.
const FOCUS_ANCHOR = Number(
  readFileSync('src/smartfollow/positionMap.ts', 'utf8').match(
    /export const FOCUS_ANCHOR = ([\d.]+)/,
  )?.[1],
)
/** How long after the text starts moving the matcher may still be ignorant of it. */
const REANCHOR_BUDGET_MS = 150
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
const anchored = await p.evaluate((anchor) => {
  const i = window.__prompter.index()
  const r = document.querySelector(`[data-w="${i}"]`)?.getBoundingClientRect()
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  return { i, top: r ? r.top : null, anchorY: vp.top + anchor * vp.height }
}, FOCUS_ANCHOR)
check('Smart Follow re-anchored to a word near the Focus Zone',
  anchored.top != null && Math.abs(anchored.top - anchored.anchorY) < 2 * lineHeight,
  `word #${anchored.i} at ${anchored.top == null ? '?' : Math.round(anchored.top)}px (anchor ${Math.round(anchored.anchorY)}px)`)

/**
 * The word actually under the reading anchor, measured off the settled DOM.
 *
 * Deliberately the same resolution rule the app uses — the anchor point, then half a pitch either
 * side. Lines carry 0.45em margins, so the anchor landing in the gap between two of them is
 * routine and a single point there finds nothing at all. Using one rule on both sides is the
 * point of the check, not a weakening of it: the app computes this BEFORE the move from a shifted
 * anchor, and this reads it AFTER, off where the text really came to rest.
 */
const wordOnScreen = () =>
  p.evaluate(
    ({ anchor, pitch }) => {
      const vp = document.querySelector('[data-prompter-text]').parentElement
      const r = vp.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + anchor * r.height
      for (const dy of [0, -pitch / 2, pitch / 2]) {
        const hit = document.elementFromPoint(x, y + dy)
        const w =
          hit?.closest('[data-w]') ?? hit?.closest('[data-prompter-line]')?.querySelector('[data-w]')
        if (w) return Number(w.getAttribute('data-w'))
      }
      return null
    },
    { anchor: FOCUS_ANCHOR, pitch: lineHeight },
  )

/**
 * Press, and watch from INSIDE the page so the measurement excludes Playwright's click
 * round-trip: the clock starts when the text actually begins to move, not when we asked it to.
 */
const nudgeAndWatch = async (button, presses) => {
  const startIndex = await p.evaluate(() => window.__prompter.index())
  const startPos = await pos()
  const watcher = p.evaluate(
    ({ startIndex, startPos, budget }) =>
      new Promise((resolve) => {
        const t0 = performance.now()
        let movedAt = null
        const tick = () => {
          const now = performance.now()
          if (movedAt == null && Math.abs(window.__prompter.position() - startPos) > 0.5) movedAt = now
          if (window.__prompter.index() !== startIndex) {
            return resolve({
              // Still easing toward the destination when the matcher was told: the whole claim.
              stillMoving: window.__prompter.gliding(),
              afterMove: movedAt == null ? null : now - movedAt,
            })
          }
          if (now - t0 > 6000 + budget) return resolve(null)
          requestAnimationFrame(tick)
        }
        tick()
      }),
    { startIndex, startPos, budget: REANCHOR_BUDGET_MS },
  )
  for (let i = 0; i < presses; i++) { await button.click(); await sleep(55) }
  const r = await watcher
  await settle()
  // Follow mode does not glide — it damps at up to 320px/s — and the glide's own tail is
  // exponential, so let both come to rest before reading where the text ended up.
  await sleep(400)
  return { startIndex, ...(r ?? {}) }
}

for (const [label, button, presses] of [
  ['one press', forward, 1],
  ['four stacked presses', back, 4],
]) {
  const r = await nudgeAndWatch(button, presses)
  const [index, onScreen] = [await p.evaluate(() => window.__prompter.index()), await wordOnScreen()]
  check(`${label}: Smart Follow is told while the text is STILL TRAVELLING`,
    r.stillMoving === true,
    r.stillMoving === true ? '' : 'the re-anchor waited for the motion to finish')
  check(`${label}: within ${REANCHOR_BUDGET_MS}ms of the text starting to move`,
    r.afterMove != null && r.afterMove <= REANCHOR_BUDGET_MS,
    `${r.afterMove == null ? '?' : Math.round(r.afterMove)}ms`)
  // Fast is worthless if it is wrong. Read after settling: a stack re-anchors once per press, so
  // the first answer is where the first press was heading, not where the text ends up.
  check(`${label}: and told the RIGHT word — the one the move lands on`,
    onScreen != null && index === onScreen,
    `matcher ${index}, word under the anchor ${onScreen}`)
}

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
