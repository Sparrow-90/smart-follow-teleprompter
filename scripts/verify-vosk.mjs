import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
p.on('console', m => { if (m.type()==='error') console.log('  [console.error]', m.text().slice(0,180)) })
p.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0,180)))
await p.goto('http://localhost:5173/#lab', { waitUntil:'networkidle' })
await new Promise(r=>setTimeout(r,1000))
const has = await p.evaluate(() => typeof window.__voskTest === 'function')
console.log('__voskTest present:', has)
for (const [lang, wav, exp] of [['en-US','/test-en.wav','hello world'],['pl-PL','/test-pl.wav','dzień dobry']]) {
  try {
    const t0 = Date.now()
    const out = await p.evaluate(async (args) => await window.__voskTest(args[0], args[1]), [lang, wav])
    console.log(`${lang}: "${out}"  (${Date.now()-t0}ms, expected ~"${exp}")`)
  } catch(e) { console.log(`${lang}: ERROR ${String(e.message).slice(0,180)}`) }
}
await b.close(); console.log('DONE')
