import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext({viewport:{width:1194,height:834}})).newPage()
p.on('pageerror', e=>console.log('  [pageerror]', e.message))
const lines = [
 'The morning report begins now','Weather will be sunny today','Traffic is light downtown',
 'Markets opened slightly higher','The mayor announced new parks','Schools will reopen on Monday',
 'A festival starts this weekend','Local team won the final','Roadworks continue on the bridge','That is all for now',
]
await p.goto('http://localhost:5173/', { waitUntil:'networkidle' }); await new Promise(r=>setTimeout(r,300))
const ed = p.getByRole('textbox', { name:'Script' }); await ed.click()
for (const l of lines) await ed.type(l+'\n')
await new Promise(r=>setTimeout(r,600))
await p.goto('http://localhost:5173/#lab', { waitUntil:'networkidle' }); await new Promise(r=>setTimeout(r,500))

const linePct = (i) => p.evaluate((idx)=>{
  const vp = document.querySelector('[data-testid="sf-viewport"]').getBoundingClientRect()
  const el = document.querySelectorAll('[data-prompter-line]')[idx].getBoundingClientRect()
  return Math.round(((el.top - vp.top) / vp.height) * 100)
}, i)

const input = p.getByRole('textbox', { name:'Spoken phrase' })
console.log('line4 start %:', await linePct(4))
await input.fill('the mayor announced new parks'); await input.press('Enter')
// sample gradual motion
const samples = []
for (const ms of [200, 600, 1200, 2200, 3500]) { await new Promise(r=>setTimeout(r, ms - (samples.at(-1)?.ms||0))); samples.push({ms, pct: await linePct(4)}) }
console.log('line4 motion:', samples.map(s=>`${s.ms}ms:${s.pct}%`).join('  '))
console.log('status:', await p.getByTestId('sf-status').textContent())

// garbled -> hold
const beforeGarble = await linePct(4)
await input.fill('qwerty asdfgh zxcvbn'); await input.press('Enter'); await new Promise(r=>setTimeout(r,1500))
console.log('line4 after garbled (should stay ~same):', beforeGarble, '->', await linePct(4))

// step to line 7
await input.fill('local team won the final'); await input.press('Enter'); await new Promise(r=>setTimeout(r,3500))
console.log('line7 % after feed (target ~40):', await linePct(7))
await p.screenshot({ path:'/tmp/prompter/follow-lineby.png' })
await b.close(); console.log('DONE')
