/**
 * A refused microphone says WHY, and Smart Follow can be recovered without leaving Prompt Mode.
 *
 * Two defects this pins. `useVosk` has always composed a precise reason for the failure and
 * PromptScreen used to discard it, so a refused mic looked exactly like a missing one. And
 * `sfFailure` was write-once: once Smart Follow fell back, pressing Play ran the manual branch
 * forever and never re-attempted start(), which made "allow the mic and try again" advice the app
 * itself made impossible to follow — only exiting and re-entering Prompt Mode cleared it.
 *
 * Permission is denied first and granted mid-session, which is exactly the shape of the real
 * situation: the presenter answers the prompt, or fixes it in site settings, and comes back.
 *
 * The denial is stubbed rather than driven through Playwright's permission API, deliberately.
 * Headless Chromium with permissions cleared rejects getUserMedia with `NotSupportedError`, not
 * the `NotAllowedError` a real browser raises when a user says no — so the permission path could
 * never be reached that way, and the first version of this script "failed" on an artefact of its
 * own environment. Throwing the real DOMException once, then delegating to the fake capture
 * device, models the actual sequence exactly.
 *
 * Run with the dev server up: node scripts/verify-mic-recovery.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const b = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await b.newContext({ permissions: ['microphone'], viewport: { width: 1194, height: 834 } })
const p = await ctx.newPage()
// Refuse the FIRST getUserMedia exactly as a browser does when the user clicks Block, then get
// out of the way so the retry meets a working microphone.
await p.addInitScript(() => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  let refused = false
  navigator.mediaDevices.getUserMedia = (...args) => {
    if (refused) return real(...args)
    refused = true
    return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  }
})
p.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)))

// Addressed by its own attribute, not by position in the bar. Reading "the last button" picked up
// Exit once the status cleared, which made the recovery check pass on the wrong element entirely.
const status = () =>
  p.evaluate(() => {
    const el = document.querySelector('[data-prompt-chrome] [data-sf-status]')
    return { text: el?.textContent?.trim() ?? '(no status)', actionable: el?.tagName === 'BUTTON' }
  })

await p.goto(BASE, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
for (const l of ['Good evening and welcome', 'Tonight we begin with the markets', 'That is all for now'])
  await ed.type(l + '\n')
await sleep(400)
await p.getByRole('button', { name: 'Continue' }).click()
await sleep(400)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(700)

// --- press Play with the mic refused ---------------------------------------
await p.getByRole('button', { name: /play|pause/i }).first().click({ force: true })
await sleep(1200)
const denied = await status()
console.log(`  status: "${denied.text}"`)
check(
  /allow the mic/i.test(denied.text),
  'a REFUSED mic says so, instead of the same dead end as a missing one',
  denied.text,
)
check(denied.actionable, 'and the status is a button offering the retry')

// --- the old dead end: pressing Play again must not be the only option ------
// (Play still falls back to manual scrolling on purpose; that is the graceful degradation.)
check(
  (await p.getByRole('button', { name: /faster|slower/i }).count()) > 0,
  'manual speed controls appear, so the presenter is not stranded meanwhile',
)

// --- retry, without leaving Prompt Mode ------------------------------------
// The stub above now lets the mic through, as granting permission would.
await p.getByRole('button', { name: /allow the mic/i }).click()
// Wait for a state that only a LIVE microphone produces. "Smart Follow" is the idle label shown
// before listening starts, so stopping at the first non-failure text would prove only that the
// flag cleared — not that the mic actually reopened. The model is a real load even from disk.
let recovered = await status()
for (let i = 0; i < 60; i++) {
  recovered = await status()
  if (/Loading model|Finding your place|Following|Paused/i.test(recovered.text)) break
  await sleep(500)
}
console.log(`  status: "${recovered.text}"`)
// Asserted positively: Smart Follow must be doing something, not merely "not saying Manual".
check(
  /Loading model|Finding your place|Following|Paused/i.test(recovered.text),
  'THE FIX: tapping it reopens the mic in place — no exit and re-entry',
  recovered.text,
)
check(
  (await p.getByRole('button', { name: /faster|slower/i }).count()) === 0,
  'and the manual speed controls are gone again',
)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
await b.close()
process.exit(failures === 0 ? 0 : 1)
