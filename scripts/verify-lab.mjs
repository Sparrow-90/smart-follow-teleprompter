import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport:{width:1194,height:834} })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('  [pageerror]', e.message))

// 1. Seed a multi-line script via the editor (autosaves to IndexedDB)
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' }); await new Promise(r=>setTimeout(r,300))
const ed = p.getByRole('textbox', { name:'Script' }); await ed.click()
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
for (const l of lines) await ed.type(l+'\n')
await new Promise(r=>setTimeout(r,500))

// 2. Open the hidden lab (fresh load hydrates the saved script)
await p.goto('http://localhost:5173/#lab', { waitUntil:'networkidle' }); await new Promise(r=>setTimeout(r,500))
const linesShown = await p.locator('[data-prompter-line]').count()
console.log('lab loaded, script lines rendered:', linesShown)

const lineTopPct = async (lineIdx) => p.evaluate((i)=>{
  const vp = document.querySelector('[data-testid="sf-viewport"]').getBoundingClientRect()
  const el = document.querySelectorAll('[data-prompter-line]')[i].getBoundingClientRect()
  return Math.round(((el.top - vp.top) / vp.height) * 100)
}, lineIdx)

// 3. Feed a phrase from line 7 (index 6) and watch it glide to ~40%
console.log('line6 start % (before feed):', await lineTopPct(6))
const input = p.getByRole('textbox', { name:'Spoken phrase' })
await input.fill('opposition demanded more detail')
await input.press('Enter')
await new Promise(r=>setTimeout(r,1600))
console.log('status:', await p.getByTestId('sf-status').textContent())
console.log('matched line testid:', await p.getByTestId('sf-line').textContent())
console.log('line6 end % (after feed, target ~40):', await lineTopPct(6))
await p.screenshot({ path:'/tmp/prompter/lab-follow.png' })

// 4. Garbled phrase should NOT jump (false-jump resistance)
const idxBefore = await p.getByTestId('sf-index').textContent()
await input.fill('qwerty asdfgh zxcvbn'); await input.press('Enter')
await new Promise(r=>setTimeout(r,800))
console.log('index before garbled:', idxBefore, '| after garbled:', await p.getByTestId('sf-index').textContent(), '| status:', await p.getByTestId('sf-status').textContent())

await b.close(); console.log('DONE')
