/**
 * Paste a real PDF copy into the real editor and count the paragraphs it lands as.
 *
 * reflowPastedText is unit-tested on its own; this proves the editor actually calls it, and that
 * what comes out survives the contentEditable round-trip into the document model — which is the
 * part the screenshots showed going wrong.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'

// Exactly what copying the two-paragraph script out of the PDF gives: a newline at every visual
// line ending, and no blank line between the paragraphs.
const PDF_CLIPBOARD = [
  '17 września 2000 r. w Muzeum Narodowym w Poznaniu doszło do jednej z najbardziej',
  'zuchwałych kradzieży dzieł sztuki w historii Polski. Bezrobotny z Olkusza w biały dzień',
  'dokonał rabunku obrazu Claude’a Moneta – „Plaża w Pourville”. Robert Z. dzieło warte kilka',
  'milionów dolarów przez 10 lat trzymał za szafą w mieszkaniu swoich rodziców.',
  'Ja nazywam się Łukasz Piątek, wy oglądacie podcast No to Piątek, a ta historia wydarzyła się',
  'naprawdę.',
].join('\n')

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)))

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
const editor = page.getByRole('textbox', { name: 'Script' })
await editor.click()

await page.evaluate((text) => {
  const el = document.querySelector('[role="textbox"][aria-label="Script"]')
  const dt = new DataTransfer()
  dt.setData('text/plain', text)
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, PDF_CLIPBOARD)
await page.waitForTimeout(500)

// childNodes, not children: inserting into an empty editor leaves the first line as a bare text
// node under the root, which `children` would silently drop. serializeElement reads it too.
const blocks = await page.evaluate(() =>
  [...document.querySelector('[role="textbox"][aria-label="Script"]').childNodes].map((c) =>
    (c.textContent ?? '').trim(),
  ),
)

const paragraphs = blocks.filter((b) => b !== '')
console.log(`blocks in the editor : ${blocks.length}  (${paragraphs.length} with text)`)
blocks.forEach((b, i) => console.log(`  [${i}] ${b === '' ? '(blank line)' : b.slice(0, 62) + '…'}`))

const ok =
  paragraphs.length === 2 &&
  blocks.length === 3 &&
  blocks[1] === '' &&
  paragraphs[0].startsWith('17 września') &&
  paragraphs[0].endsWith('swoich rodziców.') &&
  paragraphs[1].startsWith('Ja nazywam się') &&
  paragraphs[1].endsWith('naprawdę.')

await browser.close()
if (!ok) {
  console.log('\n✗ the PDF paste did not land as two paragraphs split by one blank line')
  process.exit(1)
}
console.log('\n✓ six hard-wrapped lines landed as the two paragraphs the PDF actually had')
