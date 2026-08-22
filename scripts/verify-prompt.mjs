import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport:{width:1194,height:834}, deviceScaleFactor:1 })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('  [pageerror]', e.message))
await p.goto('http://localhost:5173', { waitUntil:'networkidle' })
await new Promise(r=>setTimeout(r,300))
const ed = p.getByRole('textbox', { name:'Script' })
await ed.click()
for (let i=1;i<=10;i++){ await ed.type(`This is line number ${i} of the script\n`) }
await new Promise(r=>setTimeout(r,300))
await p.getByRole('button', { name:'Continue' }).click()
await new Promise(r=>setTimeout(r,200))
await p.getByRole('button', { name:'Start Prompt' }).click()
await new Promise(r=>setTimeout(r,300))

const ty = () => p.evaluate(() => {
  const el = document.querySelector('[data-prompter-text]')
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
  return m.m42
})

console.log('1. Play ~2s then Restart -> eases back to top + pauses')
await p.getByRole('button', { name:'Play' }).click()
await new Promise(r=>setTimeout(r,2000))
const scrolled = await ty()
await p.getByRole('button', { name:'Restart' }).click()
await new Promise(r=>setTimeout(r,1400))
const afterRestart = await ty()
const playVisible = await p.getByRole('button', { name:'Play' }).isVisible()
console.log(`  translateY scrolled=${scrolled.toFixed(1)} afterRestart=${afterRestart.toFixed(1)} pausedNow=${playVisible}`)

console.log('2. Tap-to-jump: tap a lower line -> it glides to ~40% (334px)')
// controls are visible (paused). find a line below center
const pick = await p.evaluate(() => {
  const lines = [...document.querySelectorAll('[data-prompter-line]')]
  const target = lines.find(l => l.getBoundingClientRect().top > 480 && l.getBoundingClientRect().top < 760)
  if (!target) return null
  const r = target.getBoundingClientRect()
  return { text: target.textContent, top: r.top, cx: r.left + r.width/2, cy: r.top + r.height/2 }
})
console.log('  picked line:', pick && JSON.stringify({text:pick.text, top:Math.round(pick.top)}))
if (pick) {
  await p.mouse.click(pick.cx, pick.cy)
  await new Promise(r=>setTimeout(r,1300))
  const newTop = await p.evaluate((txt) => {
    const l = [...document.querySelectorAll('[data-prompter-line]')].find(e=>e.textContent===txt)
    return l ? l.getBoundingClientRect().top : null
  }, pick.text)
  console.log(`  line top before=${Math.round(pick.top)} after=${newTop!=null?Math.round(newTop):'?'} (target ~334)`)
}
await p.screenshot({ path:'/tmp/prompter/p1-tap-jump.png' })

console.log('3. Hidden-controls tap only reveals (no jump)')
// hide controls: tap empty area while visible -> hides
await p.mouse.click(1100, 120)  // top-right empty-ish
await new Promise(r=>setTimeout(r,300))
const before = await ty()
await p.mouse.click(597, 417)   // center tap while hidden -> should just reveal
await new Promise(r=>setTimeout(r,600))
const after = await ty()
const controlsShown = await p.getByRole('button', { name:/Play|Pause/ }).isVisible()
console.log(`  translateY before=${before.toFixed(1)} after=${after.toFixed(1)} unchanged=${Math.abs(before-after)<2} controlsShown=${controlsShown}`)

await b.close(); console.log('DONE')
