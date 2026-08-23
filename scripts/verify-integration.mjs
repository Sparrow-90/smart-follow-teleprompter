import { chromium } from 'playwright'
const b = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, permissions: ['microphone'] })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('  [pageerror]', e.message))

const seedAndSetup = async () => {
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await new Promise((r) => setTimeout(r, 300))
  const ed = p.getByRole('textbox', { name: 'Script' })
  await ed.click()
  await ed.type('The first line of the script goes here.\nThe second line continues the story now.')
  await new Promise((r) => setTimeout(r, 500))
  await p.getByRole('button', { name: 'Continue' }).click()
  await new Promise((r) => setTimeout(r, 300))
}

console.log('A. Setup — Smart Follow toggle + language')
await seedAndSetup()
console.log('  SF toggle checked by default:', await p.getByRole('switch', { name: 'Smart Follow' }).isChecked())
console.log('  language selector visible:', await p.getByRole('combobox', { name: 'Smart Follow language' }).count() === 1)
await p.getByText('Smart Follow', { exact: true }).click() // turn OFF
await new Promise((r) => setTimeout(r, 200))
console.log('  after turning OFF → language hidden:', await p.getByRole('combobox', { name: 'Smart Follow language' }).count() === 0)

console.log('B. Manual mode regression (SF off) — play scrolls')
await p.getByRole('button', { name: 'Start Prompt' }).click()
await new Promise((r) => setTimeout(r, 300))
const ty = () => p.evaluate(() => { const el = document.querySelector('[data-prompter-text]'); return el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0 })
const before = await ty()
await p.getByRole('button', { name: 'Play' }).click()
await new Promise((r) => setTimeout(r, 1500))
console.log('  manual scroll moved:', Math.abs((await ty()) - before) > 1)
console.log('  slower button present (manual):', await p.getByRole('button', { name: 'Slower' }).count() === 1)
await p.getByRole('button', { name: 'Exit' }).click().catch(() => {})
await new Promise((r) => setTimeout(r, 300))

console.log('C. Smart Follow mode UI (SF on)')
await p.getByRole('button', { name: 'Continue' }).click() // Editor → Setup
await new Promise((r) => setTimeout(r, 300))
await p.getByText('Smart Follow', { exact: true }).click() // turn ON again
await new Promise((r) => setTimeout(r, 200))
await p.getByRole('button', { name: 'Start Prompt' }).click()
await new Promise((r) => setTimeout(r, 400))
console.log('  chrome shows Smart Follow status:', await p.getByText('Smart Follow', { exact: false }).count() >= 1)
console.log('  slower/faster hidden in SF mode:', await p.getByRole('button', { name: 'Slower' }).count() === 0)
console.log('  play button present:', await p.getByRole('button', { name: /Play|Pause/ }).count() >= 1)
await p.screenshot({ path: '/tmp/prompter/integration.png' })
await b.close()
console.log('DONE')
