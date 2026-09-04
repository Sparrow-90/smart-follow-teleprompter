/**
 * Smart Follow never sends the script somewhere the presenter is not.
 *
 * `matchPosition` widens its search to the WHOLE script when the local window looks unconvincing,
 * and it used to accept whatever came back on the same low bar the local search uses. On a long
 * script that bar is a chance event: six ordinary words carrying no real evidence — an off-script
 * aside, a garbled patch of recognition, another voice over the mic — line up three-of-six
 * *somewhere* in three thousand and score exactly 0.5. The follow engine is then handed a target
 * hundreds of screens away and chases it at its speed cap, and that is the script scrolling
 * upward on its own with nobody reading it. `FAR_MIN_CONFIDENCE` / `FAR_MIN_EVIDENCE` are what
 * refuse it.
 *
 * The unit tests pin single cases; this bug was a RATE, so this driver measures one. It replays
 * the rolling window `useVosk` really emits — last eight words, matcher reads the last six — over
 * this repo's own PRD, which is the only long piece of real Polish prose in the tree. Both halves
 * are asserted together, because either alone passes for the wrong reason: a matcher that refuses
 * every far jump scores a perfect 0% runaway, and one that takes every far jump catches up
 * fastest.
 *
 * Deliberately NOT in `vercel-build`, unlike the other pure-Node drivers: `verify-lexicon` and
 * `verify-type-motion` read a file and match bytes, while a widened scan here is O(script) per
 * call. The run below is sized to a few seconds; the calibration sweep it came from took minutes
 * per variant.
 *
 * No server and no browser needed: node scripts/verify-false-jump.mjs
 */
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

// Node strips the types itself; it just will not resolve TypeScript's extensionless imports.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch {
      return next(`${specifier}.ts`, context)
    }
  },
})
const { matchPosition } = await import('../src/smartfollow/matcher.ts')
const { tokenizeScript } = await import('../src/smartfollow/tokenizeScript.ts')

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- the corpus: the PRD, read as a script the way the editor would hold it ------------------
const md = readFileSync('PRD — PWA Teleprompter with Smart Follow.md', 'utf8')
const blocks = md
  .split(/\n\s*\n/)
  .map((p) => p.replace(/\s+/g, ' ').trim())
  .filter((p) => p.split(' ').length >= 4)
  .map((p) => ({ type: 'text', runs: [{ text: p }] }))
const tokens = tokenizeScript({ blocks })

// A far jump is one that leaves the presenter's screen entirely — 50 words is several lines at
// any preset, and the failures this exists for were hundreds to thousands.
const FAR = 50
// Deterministic: a rate guard that shifts run to run cannot be a guard.
let seed = 13
const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff)
const pick = (a) => a[Math.floor(rng() * a.length)]

// The words an off-script aside is most likely to be made of are the script's own commonest ones,
// which is exactly what makes them worthless as evidence of position.
const counts = new Map()
for (const t of tokens) counts.set(t.text, (counts.get(t.text) ?? 0) + 1)
const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w]) => w)

console.log(`script: ${tokens.length} words, ${counts.size} distinct`)

// --- 1. the bug: the presenter says eight words that are not in the script here --------------
{
  let runs = 0
  let ranAway = 0
  let worst = 0
  for (let p = 200; p < tokens.length - 200; p += 97) {
    let window = tokens.slice(p - 7, p + 1).map((t) => t.text)
    let cur = p
    for (let k = 0; k < 8; k++) {
      window = [...window.slice(1), pick(commonest)]
      const r = matchPosition(tokens, cur, window)
      if (r.confidence >= 0.45) cur = r.index // the gate useSmartFollow applies
      worst = Math.max(worst, Math.abs(cur - p))
    }
    runs++
    if (Math.abs(cur - p) > FAR) ranAway++
  }
  const rate = (100 * ranAway) / runs
  check(
    rate <= 5,
    'an off-script aside leaves the script where the presenter is',
    `${rate.toFixed(1)}% of ${runs} asides moved it more than ${FAR} words (was 48.6%), worst ${worst}`,
  )
}

// --- 2. the other half: a deliberate skip elsewhere must still be found ----------------------
{
  const garble = (w) => (rng() < 0.18 ? null : rng() < 0.15 && w.length > 4 ? `${w.slice(0, -2)}a` : w)
  let runs = 0
  let caught = 0
  let words = 0
  for (let p = 300; p < tokens.length - 40; p += 101) {
    let cur = (p + 1700) % (tokens.length - 80) + 20 // somewhere else entirely
    const window = []
    let found = 0
    for (let k = 0; k < 12; k++) {
      const heard = garble(tokens[p + k].text)
      if (heard) window.push(heard)
      if (window.length === 0) continue
      const r = matchPosition(tokens, cur, window.slice(-8))
      if (r.confidence >= 0.45) cur = r.index
      if (!found && Math.abs(cur - (p + k)) <= 8) found = k + 1
    }
    runs++
    if (found) {
      caught++
      words += found
    }
  }
  const rate = (100 * caught) / runs
  check(
    rate >= 95,
    'a deliberate skip elsewhere in the script is still found',
    `caught up in ${rate.toFixed(1)}% of ${runs} skips (was 98.8%)` +
      (caught ? `, after ${(words / caught).toFixed(1)} words` : ''),
  )
}

// --- 3. one word can never move you across the script ---------------------------------------
{
  let runs = 0
  let moved = 0
  for (let p = 200; p < tokens.length - 200; p += 53) {
    const r = matchPosition(tokens, p, [pick(commonest)])
    runs++
    if (Math.abs(r.index - p) > FAR) moved++
  }
  check(
    moved === 0,
    'a single recognized word never crosses the script',
    `${moved} of ${runs} (was ~48%)`,
  )
}

console.log(
  failures === 0
    ? '\n✓ weak evidence holds the script still, strong evidence still moves it'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
