import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5199'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 } })
const page = await ctx.newPage()

console.log('1. Load built app, wait for service worker')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => navigator.serviceWorker?.ready)
const swReady = await page.evaluate(() => !!navigator.serviceWorker?.controller || navigator.serviceWorker?.getRegistrations().then((r) => r.length > 0))
console.log('  service worker registered:', swReady)

console.log('2. Set a script + switch to Light theme, then reload to test persistence')
const ed = page.getByRole('textbox', { name: 'Script' })
await ed.click()
await ed.type('Persistent script line one\nline two')
await sleep(400)
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByText('Light theme', { exact: true }).click()
await sleep(200)
const themeAfterToggle = await page.evaluate(() => document.documentElement.className)
console.log('  html class after toggle:', themeAfterToggle)

await page.reload({ waitUntil: 'networkidle' })
await sleep(600)
const themeAfterReload = await page.evaluate(() => document.documentElement.className)
console.log('  html class after reload:', themeAfterReload, '(expect light)')

console.log('3. Go OFFLINE, reload — app must still run from cache')
await ctx.setOffline(true)
let offlineOk = false
try {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(600)
  offlineOk = await page.getByRole('textbox', { name: 'Script' }).isVisible()
} catch (e) {
  console.log('  reload error:', e.message)
}
console.log('  editor visible offline:', offlineOk)
const offlineScript = await page.getByRole('textbox', { name: 'Script' }).textContent().catch(() => '')
console.log('  script present offline:', (offlineScript || '').slice(0, 30))
await page.screenshot({ path: '/tmp/prompter/10-offline.png' })
await ctx.setOffline(false)

await browser.close()
console.log('DONE')
