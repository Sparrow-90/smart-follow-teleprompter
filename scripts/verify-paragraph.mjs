import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))
// ONE long paragraph (no newlines) => a single <p data-prompter-line> that wraps to many visual lines
const para =
  'The morning report begins now with several important updates from around the region. ' +
  'Weather will be sunny across the coast while heavier rain moves through the northern valleys by afternoon. ' +
  'Traffic remains light downtown although roadworks continue near the central bridge so drivers should expect minor delays. ' +
  'Markets opened slightly higher after yesterday session as investors welcomed the new economic figures released this morning.'
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await new Promise((r) => setTimeout(r, 300))
const ed = p.getByRole('textbox', { name: 'Script' })
await ed.click()
await ed.type(para)
await new Promise((r) => setTimeout(r, 600))
await p.goto('http://localhost:5173/#lab', { waitUntil: 'networkidle' })
await new Promise((r) => setTimeout(r, 500))
console.log('paragraphs (data-prompter-line):', await p.locator('[data-prompter-line]').count(), '(expect 1)')

const ty = () =>
  p.evaluate(() => {
    const el = document.querySelector('[data-prompter-text]')
    return Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)
  })
const matchedWordPct = () =>
  p.evaluate(() => {
    const idx = document.querySelector('[data-testid="sf-index"]').textContent.replace('#', '')
    const el = document.querySelector(`[data-w="${idx}"]`)
    if (!el) return null
    const vp = document.querySelector('[data-testid="sf-viewport"]').getBoundingClientRect()
    return Math.round(((el.getBoundingClientRect().top - vp.top) / vp.height) * 100)
  })
const input = p.getByRole('textbox', { name: 'Spoken phrase' })
async function feed(phrase, label) {
  await input.fill(phrase)
  await input.press('Enter')
  await new Promise((r) => setTimeout(r, 3500))
  console.log(
    `${label}: translateY=${await ty()}  matchedWord=${await p.getByTestId('sf-index').textContent()}  wordAt=${await matchedWordPct()}%`,
  )
}
await feed('the morning report begins now', 'START ')
await feed('traffic remains light downtown', 'MIDDLE')
await feed('investors welcomed the new economic figures', 'END   ')
await p.screenshot({ path: '/tmp/prompter/para-follow.png' })
await b.close()
console.log('DONE')
