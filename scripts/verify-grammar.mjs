/**
 * The grammar-constrained command recognizer works against the real Polish model.
 *
 * Open-vocabulary recognition has to find "klik góra" among ~280k Polish words and every
 * inflection that sounds like it; the grammar recognizer chooses between three phrases and
 * "not a command". This drives both on the SAME audio so the difference is visible.
 *
 * IMPORTANT — what this does and does not prove. The fixtures are `say -v Zosia`, i.e. Apple's
 * Polish synthesizer, not a person. So a pass here proves the MECHANISM: that the grammar
 * recognizer builds against this model, returns listed phrases, and returns nothing for ordinary
 * prose. It says nothing about how well it hears a particular human voice — only the device can.
 *
 * Fixtures are gitignored like the other test WAVs. Regenerate them (macOS) with:
 *
 *   cd public
 *   say -v Zosia "klik góra" -o /tmp/a.aiff && afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/a.aiff test-klik-gora.wav
 *   say -v Zosia "klik dół"  -o /tmp/b.aiff && afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/b.aiff test-klik-dol.wav
 *   say -v Zosia "dzisiaj jest bardzo ładna pogoda w naszym mieście" -o /tmp/c.aiff && \
 *     afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/c.aiff test-proza.wav
 *
 * Run with the dev server up: BASE=http://localhost:5173 node scripts/verify-grammar.mjs
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

// Mirrors commandGrammarFor('pl-PL'). Kept literal because node cannot import the .ts module;
// the unit tests own the real definition, and a drift here shows up as an immediate FAIL.
const grammar = ['klik góra', 'klik dół', 'klik start', '[unk]']

const BASE = process.env.BASE ?? 'http://localhost:5173'
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// Fixtures are gitignored, so a fresh clone has none. Say so plainly rather than reporting a
// mysterious empty transcript that looks like a recognition failure.
const missing = ['test-klik-gora.wav', 'test-klik-dol.wav', 'test-proza.wav'].filter(
  (f) => !existsSync(new URL(`../public/${f}`, import.meta.url)),
)
if (missing.length > 0) {
  console.log(`SKIP  fixtures missing: ${missing.join(', ')}`)
  console.log('      see the header of this file for the `say` commands that regenerate them')
  process.exit(0)
}

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)))
await p.goto(`${BASE}/#lab`, { waitUntil: 'networkidle' })
await new Promise((r) => setTimeout(r, 1000))

if (!(await p.evaluate(() => typeof window.__voskTest === 'function'))) {
  console.log('FAIL  __voskTest seam missing (is this a dev build?)')
  await b.close()
  process.exit(1)
}

console.log(`grammar: ${JSON.stringify(grammar)}\n`)

const run = (wav) =>
  p.evaluate(async (a) => await window.__voskTest(a[0], a[1], a[2]), ['pl-PL', wav, grammar])

for (const [wav, spoken, expected] of [
  ['/test-klik-gora.wav', 'klik góra', 'klik góra'],
  ['/test-klik-dol.wav', 'klik dół', 'klik dół'],
]) {
  const r = await run(wav)
  console.log(`  spoken "${spoken}"\n    open    : "${r.open}"\n    grammar : "${r.grammar}"`)
  check(r.grammar === expected, `grammar recognizer returns "${expected}"`, `got "${r.grammar}"`)
  if (r.open !== expected) {
    console.log(`    ^ note: open-vocabulary heard something else — exactly the failure mode`)
  }
}

// The safety catch. Without [unk] in the grammar the recognizer force-fits every utterance onto
// its nearest listed phrase, and reading the script aloud would fire commands continuously.
const prose = await run('/test-proza.wav')
console.log(`\n  spoken ordinary prose\n    grammar : "${prose.grammar}"`)
check(
  !prose.grammar || prose.grammar.split(/\s+/).every((w) => w === '[unk]'),
  'ordinary prose returns only [unk], never a command',
  `got "${prose.grammar}"`,
)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
await b.close()
process.exit(failures === 0 ? 0 : 1)
