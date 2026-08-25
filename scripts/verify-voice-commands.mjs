/**
 * The spoken commands actually move the script — "Klik góra/dół/start" in Polish,
 * "Click up/down/go" in English ("Promptly …" survives as an English-only fallback).
 *
 * Drives the real Prompt Mode through the __prompter dev seam, so no microphone and no 50MB
 * model are needed — feed() is the same callback Vosk's recognized words arrive on, so the
 * detector, the suppression and the nudge all run exactly as they do in a live session.
 *
 * What this canNOT cover: the recognition itself. Whether the model hears "promptly up" at all
 * is a device check (and in Polish it is expected not to — those words are outside that model's
 * lexicon). Run with the dev server up: node scripts/verify-voice-commands.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// A script long enough that a line of travel is unambiguous.
const lines = [
  'The morning report begins now', 'Weather will be sunny today', 'Traffic is light downtown',
  'Markets opened slightly higher', 'The mayor announced new parks', 'Schools will reopen on Monday',
  'A festival starts this weekend', 'Local team won the final', 'Roadworks continue on the bridge',
  'That is all for now',
]
await p.goto(BASE, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
for (const l of lines) await ed.type(l + '\n')
await sleep(400)

// Editor -> Setup -> Prompt Mode, the same route verify.mjs takes.
await p.getByRole('button', { name: 'Continue' }).click()
await sleep(400)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(600)
const seam = await p.evaluate(() => typeof window.__prompter !== 'undefined')
check(seam, 'Prompt Mode is up and the dev seam is exposed')
if (!seam) { await b.close(); process.exit(1) }

const pos = () => p.evaluate(() => window.__prompter.position())
const lineHeight = await p.evaluate(() => window.__prompter.lineHeight())
// A spoken command moves further than the nudge button: one line rarely gets the presenter back
// to the line they fumbled, and repeating a phrase is slow enough to show on camera.
const VOICE_LINES = 2
const travel = lineHeight * VOICE_LINES
const settle = async () => {
  for (let i = 0; i < 60 && (await p.evaluate(() => window.__prompter.gliding())); i++) await sleep(50)
  await sleep(120)
}
const say = async (words) => { await p.evaluate((w) => window.__prompter.feed(w), words); await settle() }

await p.evaluate(() => window.__prompter.followMode())
// Start a few lines in, so a backward nudge has somewhere to go.
await say(['a', 'festival', 'starts', 'this', 'weekend'])
const start = await pos()
check(start > 0, 'speech moved the script into the page', `position ${start.toFixed(1)}px`)

// --- "Promptly down" advances one line -----------------------------------
await say(['promptly', 'down'])
const afterDown = await pos()
const downDelta = afterDown - start
check(
  Math.abs(downDelta - travel) < lineHeight * 0.25,
  `"Promptly down" advances exactly ${VOICE_LINES} lines`,
  `moved ${downDelta.toFixed(1)}px, expected ${travel.toFixed(1)}px`,
)

// --- "Promptly up" goes back one line ------------------------------------
await say(['promptly', 'up'])
const afterUp = await pos()
const upDelta = afterUp - afterDown
check(
  upDelta < 0 && Math.abs(Math.abs(upDelta) - travel) < lineHeight * 0.25,
  `"Promptly up" goes BACK ${VOICE_LINES} lines`,
  `moved ${upDelta.toFixed(1)}px, expected -${travel.toFixed(1)}px`,
)

// --- the script must not be able to trigger itself -----------------------
const beforeProse = await pos()
await say(['we', 'will', 'look', 'up', 'the', 'answer'])
await say(['further', 'down', 'the', 'page', 'she', 'wrote'])
const afterProse = await pos()
check(
  Math.abs(afterProse - beforeProse) < lineHeight * 0.9,
  'ordinary prose containing "up"/"down" does not nudge the script',
  `drifted ${(afterProse - beforeProse).toFixed(1)}px`,
)

// --- the Polish vocabulary works from the same table ----------------------
// Accepted whatever the language setting: the two models' lexicons are disjoint for these
// words, so neither set can steal the other's triggers.
// Spoken as "Prompt góra" / "Prompt dół"; the Polish model returns the prom- neighbour, since
// it holds no "prompt" of its own. "asystent" is the kept fallback and is exercised below.
const beforePl = await pos()
await say(['klik', 'dol'])
const plDown = (await pos()) - beforePl
check(
  Math.abs(plDown - travel) < lineHeight * 0.25,
  `"Klik dol" advances exactly ${VOICE_LINES} lines`,
  `moved ${plDown.toFixed(1)}px, expected ${travel.toFixed(1)}px`,
)
await say(['klika', 'gora'])
const plUp = (await pos()) - beforePl - plDown
check(
  plUp < 0 && Math.abs(Math.abs(plUp) - travel) < lineHeight * 0.25,
  `"Klik gora" goes BACK ${VOICE_LINES} lines`,
  `moved ${plUp.toFixed(1)}px, expected -${travel.toFixed(1)}px`,
)

// --- "Promptly go" resumes from a pause ----------------------------------
await p.evaluate(() => window.__prompter.pause())
check(!(await p.evaluate(() => window.__prompter.following())), 'pausing stops following')
await say(['promptly', 'go'])
check(await p.evaluate(() => window.__prompter.following()), '"Promptly go" resumes following')

await p.evaluate(() => window.__prompter.pause())
// "Asystent start" is the same command as "Promptly go" (both resume), so the repeat-guard
// legitimately swallows it if we ask again straight away. Wait the cooldown out.
await sleep(1400)
await say(['asystent', 'start'])
check(
  await p.evaluate(() => window.__prompter.following()),
  '"Asystent start" still resumes following (kept fallback)',
)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
await b.close()
process.exit(failures === 0 ? 0 : 1)
