/**
 * Paragraph markers render as numbered rules, and "Klik akapit" moves back a paragraph.
 *
 * Drives the real Editor -> Setup -> Prompt Mode flow through the __prompter dev seam, so no
 * microphone and no 50MB model are needed: feed() is the same callback Vosk's recognized words
 * arrive on, so the detector, the cooldown, the re-anchor and the glide all run exactly as they
 * do in a live session.
 *
 * The assertion that matters is the SECOND command. One "Klik akapit" restarts the paragraph
 * being read; saying it again steps back a paragraph. That only works because reanchorTo leaves
 * the matcher exactly on the first jump's target, which is a fact about the running app and not
 * something a unit test of previousParagraphIndex can reach.
 *
 * Run with the dev server up: node scripts/verify-paragraph-marker.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- the two numbering paths must start from the same place ----------------
// Prompt Mode counts markers in JS; the editor counts them with a CSS counter. Nothing at
// runtime can catch them drifting apart (a CSS counter's resolved value is not readable from
// the DOM), so the start values are pinned at the source instead. Both mean "the section this
// marker OPENS", the top of the script being section 1.
{
  const css = readFileSync('src/index.css', 'utf8')
  const tsx = readFileSync('src/components/prompt/PromptText.tsx', 'utf8')
  const cssStart = css.match(/counter-reset:\s*section\s+(\d+)/)?.[1]
  const jsStart = tsx.match(/const section = \{\s*n:\s*(\d+)\s*\}/)?.[1]
  check(
    cssStart != null && cssStart === jsStart,
    'editor and Prompt Mode number markers from the same start value',
    `index.css=${cssStart} PromptText=${jsStart}`,
  )
}

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

// Three paragraphs, parted by markers inserted through the real toolbar button.
const paragraphs = [
  ['The morning report begins now', 'Weather will be sunny today', 'Traffic is light downtown'],
  ['Markets opened slightly higher', 'The mayor announced new parks', 'Schools reopen on Monday'],
  ['A festival starts this weekend', 'The local team won the final', 'That is all for now'],
]

await p.goto(BASE, { waitUntil: 'networkidle' })
await sleep(300)
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
for (let i = 0; i < paragraphs.length; i++) {
  if (i > 0) {
    await p.getByRole('button', { name: 'Insert paragraph marker' }).click()
    await sleep(150)
  }
  for (const line of paragraphs[i]) await ed.type(line + '\n')
}
await sleep(500)

const editorMarkers = await p.evaluate(
  () => document.querySelectorAll('.script-editor [data-block="section"]').length,
)
check(editorMarkers === 2, 'the toolbar button inserts a marker into the editor', `found ${editorMarkers}`)

await p.getByRole('button', { name: 'Continue' }).click()
await sleep(400)
await p.getByRole('button', { name: 'Start Prompt' }).click()
await sleep(700)

const seam = await p.evaluate(() => typeof window.__prompter !== 'undefined')
check(seam, 'Prompt Mode is up and the dev seam is exposed')
if (!seam) { await b.close(); process.exit(1) }

// --- the visual ------------------------------------------------------------
const rendered = await p.evaluate(() =>
  [...document.querySelectorAll('[data-prompter-text] [data-block="section"]')].map((el) => ({
    text: el.textContent.trim(),
    isLine: el.hasAttribute('data-prompter-line') || !!el.closest('[data-prompter-line]'),
    rules: el.querySelectorAll('span.h-px, span[class*="h-px"]').length,
  })),
)
check(rendered.length === 2, 'both markers render in Prompt Mode', `found ${rendered.length}`)
check(
  rendered.map((r) => r.text).join(',') === '2,3',
  'markers are numbered by the section they OPEN (top of script is 1)',
  `got ${rendered.map((r) => r.text).join(',') || '(none)'}`,
)
check(
  rendered.every((r) => !r.isLine),
  'a marker is not a [data-prompter-line] — it holds no words to tap or anchor to',
)

// --- the jump targets ------------------------------------------------------
const targets = await p.evaluate(() => window.__prompter.paragraphTargets())
check(
  targets.length === 3 && targets[0] === 0,
  'three jump targets: the top of the script plus one per marker',
  `got [${targets}]`,
)

const pos = () => p.evaluate(() => window.__prompter.position())
/**
 * How far the word at `index` sits from the Focus Zone anchor, in line heights.
 *
 * This is the real contract of a jump — "the line you asked for is where you read" — and it is
 * what to assert rather than a raw position delta. Follow mode smooth-damps toward its target
 * instead of running a one-shot glide, so `gliding()` goes false while the text is still
 * travelling and any absolute position read around it is a coin flip.
 */
const anchorOffsetLines = (index) =>
  p.evaluate((i) => {
    const w = document.querySelector(`[data-w="${i}"]`)
    const vp = document.querySelector('[data-prompter-text]')?.parentElement
    if (!w || !vp) return null
    const r = w.getBoundingClientRect()
    const v = vp.getBoundingClientRect()
    return (r.top - (v.top + 0.4 * v.height)) / window.__prompter.lineHeight()
  }, index)
const idx = () => p.evaluate(() => window.__prompter.index())
const settle = async () => {
  for (let i = 0; i < 80 && (await p.evaluate(() => window.__prompter.gliding())); i++) await sleep(50)
  await sleep(150)
}
const say = async (words) => {
  await p.evaluate((w) => window.__prompter.feed(w), words)
  await settle()
}

await p.evaluate(() => window.__prompter.followMode())
// Read into the MIDDLE of the third paragraph, so the first command has a paragraph to restart.
await say(['the', 'local', 'team', 'won', 'the', 'final'])
const startIdx = await idx()
check(
  startIdx > targets[2],
  'speech put the matcher inside the third paragraph',
  `index ${startIdx}, paragraph starts at ${targets[2]}`,
)

// --- first command: restart THIS paragraph ---------------------------------
await say(['klik', 'akapit'])
const afterFirst = await idx()
check(
  afterFirst === targets[2],
  '"Klik akapit" goes back to the top of the paragraph being read',
  `index ${startIdx} -> ${afterFirst}, expected ${targets[2]}`,
)
const firstOffset = await anchorOffsetLines(targets[2])
check(
  firstOffset != null && Math.abs(firstOffset) < 1.5,
  'and the script put that paragraph at the Focus Zone',
  `off by ${firstOffset?.toFixed(2)} lines`,
)

// --- second command: step back a paragraph ---------------------------------
// The per-command cooldown absorbs one utterance's repeated partials; wait it out so this
// reads as a deliberate second command, exactly as saying it twice would.
await sleep(1400)
await say(['klik', 'akapit'])
const afterSecond = await idx()
check(
  afterSecond === targets[1],
  'saying it AGAIN steps back to the previous paragraph',
  `index ${afterFirst} -> ${afterSecond}, expected ${targets[1]}`,
)
const secondOffset = await anchorOffsetLines(targets[1])
check(
  secondOffset != null && Math.abs(secondOffset) < 1.5,
  'and that paragraph is now the one at the Focus Zone',
  `off by ${secondOffset?.toFixed(2)} lines`,
)

// --- and again, to the top -------------------------------------------------
await sleep(1400)
await say(['klik', 'akapit'])
check(
  (await idx()) === targets[0],
  'a third command reaches the top of the script',
  `index ${afterSecond} -> ${await idx()}, expected ${targets[0]}`,
)

// --- it must not fire on the script itself ---------------------------------
// Read from a position the command would visibly MOVE. The earlier version took this reading
// immediately after asserting the index was already at targets[0], which made its own escape
// clause (`beforeProse === targets[0]`) permanently true — the check could not fail however
// freely "akapit" fired, and tested nothing at all.
await sleep(1400)
await say(['the', 'local', 'team', 'won', 'the', 'final'])
const beforeProse = await idx()
check(
  beforeProse > targets[2],
  'back inside the third paragraph, where a stray command would be obvious',
  `index ${beforeProse}`,
)
await say(['zaczynamy', 'nowy', 'akapit', 'w', 'tym', 'miejscu'])
const afterProse = await idx()
check(
  afterProse >= targets[2],
  'ordinary prose containing "akapit" does not fire the command',
  `index ${beforeProse} -> ${afterProse}; a stray command would have pulled it to ${targets[2]} or below`,
)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
await b.close()
process.exit(failures === 0 ? 0 : 1)
