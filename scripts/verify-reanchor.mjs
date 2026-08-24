import { chromium } from 'playwright'

const URL = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1194, height: 834 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// 1. Seed a script through the editor (autosaves to IndexedDB, debounced ~250ms).
await p.goto(URL, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
const lines = [
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
]
for (const l of lines) await ed.type(l + '\n')
await sleep(500)

// 2. Turn Smart Follow on, then enter Prompt Mode.
await p.getByRole('button', { name: 'Continue' }).click()
await sleep(300)
const sfToggle = p.getByRole('switch', { name: 'Smart Follow' })
if (!(await sfToggle.isChecked())) await sfToggle.check()
await sleep(200)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(600)

// 3. Put the engine in follow mode and advance a few paragraphs by "speech".
await p.evaluate(() => window.__prompter.followMode())
await p.evaluate(() => window.__prompter.feed(['opposition', 'demanded', 'more', 'detail']))
await sleep(1800)
const advanced = await p.evaluate(() => window.__prompter.position())
check('speech advanced the script', advanced > 100, `position ${Math.round(advanced)}`)

// 4. Drag the text back down — the presenter pulling a fumbled line back into view.
const box = await p.locator('[data-prompter-text]').boundingBox()
const cx = box.x + box.width / 2
await p.mouse.move(cx, 300)
await p.mouse.down()
for (let y = 300; y <= 600; y += 30) {
  await p.mouse.move(cx, y)
  await sleep(16)
}
const duringDrag = await p.evaluate(() => window.__prompter.position())
check('the engine did not fight the finger', duringDrag < advanced - 100,
  `${Math.round(advanced)} -> ${Math.round(duringDrag)}`)
await p.mouse.up()

// 5. It must stay where it was put — the bug that made the feature impossible.
await sleep(900)
const afterRelease = await p.evaluate(() => window.__prompter.position())
check('the text stayed where the presenter put it', Math.abs(afterRelease - duringDrag) < 12,
  `${Math.round(duringDrag)} -> ${Math.round(afterRelease)}`)

// 5b. The matcher must now believe the presenter is at the word under the Focus Zone. This is
// the check that fails if reanchorTo was never wired up — every other check here can pass with
// Task 4 completely inert.
const anchored = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const y = vp.top + 0.4 * vp.height
  const el = document.elementFromPoint(vp.left + vp.width / 2, y)
  const w = el?.closest('[data-w]') ?? el?.closest('[data-prompter-line]')?.querySelector('[data-w]')
  return { matcher: window.__prompter.index(), onScreen: w ? Number(w.getAttribute('data-w')) : null }
})
check('the matcher re-anchored to the word at the Focus Zone',
  anchored.onScreen != null && Math.abs(anchored.matcher - anchored.onScreen) <= 8,
  `matcher ${anchored.matcher} vs on-screen ${anchored.onScreen}`)

// 6. An apology during the local-only window must not move the document.
await p.evaluate(() => window.__prompter.feed(['sorry', 'let', 'me', 'take', 'that', 'again']))
await sleep(900)
const afterApology = await p.evaluate(() => window.__prompter.position())
check('an apology did not teleport the script', Math.abs(afterApology - afterRelease) < 40,
  `${Math.round(afterRelease)} -> ${Math.round(afterApology)}`)

// 7. Re-reading the line at the Focus Zone resumes following from there.
const spoken = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const y = vp.top + 0.4 * vp.height
  const el = document.elementFromPoint(vp.left + vp.width / 2, y)
  const line = el?.closest('[data-prompter-line]')
  return line ? line.textContent.trim().split(/\s+/).slice(0, 4) : null
})
check('a line sits at the Focus Zone', spoken != null, spoken?.join(' '))

// Do NOT assert the position moves forward here. The re-anchor lands on whichever word sat at the
// anchor — usually the line's LAST word, since that is what occupies the anchor point after a drag.
// Speaking that line from its start therefore pulls the matcher earlier within the same line, moving
// the text back by up to a line. That is correct behaviour, not drift. The two invariants worth
// pinning are below: the matched word parks at the Focus Zone, and reading on advances the script.
const measure = () =>
  p.evaluate(() => {
    const text = document.querySelector('[data-prompter-text]')
    const vp = text.parentElement.getBoundingClientRect()
    const anchorY = vp.top + 0.4 * vp.height
    const r = document.querySelector(`[data-w="${window.__prompter.index()}"]`)?.getBoundingClientRect()
    const lh = parseFloat(getComputedStyle(text).lineHeight)
    return {
      pos: window.__prompter.position(),
      offset: r ? r.top - anchorY : null,
      lineHeight: Number.isFinite(lh) ? lh : 60,
    }
  })

await p.evaluate((w) => window.__prompter.feed(w), spoken ?? ['the'])
await sleep(1800)
const resumed = await measure()
check('the spoken word settled at the Focus Zone',
  resumed.offset != null && Math.abs(resumed.offset) < 0.75 * resumed.lineHeight,
  `${Math.round(resumed.offset)}px from anchor (tolerance ${Math.round(0.75 * resumed.lineHeight)}px)`)

// 7b. Reading on must carry the script forward again — that is what "following resumed" means.
await p.evaluate(() => window.__prompter.feed(['lower', 'interest', 'rates', 'for', 'first', 'buyers']))
await sleep(1800)
const readOn = await measure()
check('reading on advances the script', readOn.pos > resumed.pos + 30,
  `${Math.round(resumed.pos)} -> ${Math.round(readOn.pos)}`)

// 8. Tap-to-jump must stick too. It shares the glide path with Restart, and its stale-target bug
// (glideTo never sets targetPosition) was caught only in review — nothing else guards it. Controls
// stay visible here because we never pressed Play, so a tap routes to jumpToLineAt rather than
// merely revealing the controls.
const tapAt = await p.evaluate(() => {
  const vp = document.querySelector('[data-prompter-text]').parentElement.getBoundingClientRect()
  const lines = [...document.querySelectorAll('[data-prompter-line]')]
  const target = lines.find((l) => l.getBoundingClientRect().top > vp.top + 0.62 * vp.height)
  if (!target) return null
  const r = target.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
if (tapAt) {
  const beforeTap = await p.evaluate(() => window.__prompter.position())
  await p.mouse.click(tapAt.x, tapAt.y)
  await sleep(1400) // let the glide finish
  const afterGlide = await p.evaluate(() => window.__prompter.position())
  check('tap-to-jump moved the text', Math.abs(afterGlide - beforeTap) > 30,
    `${Math.round(beforeTap)} -> ${Math.round(afterGlide)}`)
  await sleep(1600) // the stale-target drift, if any, happens here
  const afterSettle = await p.evaluate(() => window.__prompter.position())
  check('tap-to-jump did not drift back to a stale target', Math.abs(afterSettle - afterGlide) < 12,
    `${Math.round(afterGlide)} -> ${Math.round(afterSettle)}`)
} else {
  check('tap-to-jump moved the text', false, 'no line found below 62% of the viewport')
  check('tap-to-jump did not drift back to a stale target', false, 'skipped')
}

await p.screenshot({ path: '/tmp/prompter/reanchor.png' })
await b.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
