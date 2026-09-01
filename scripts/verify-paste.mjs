/**
 * Paste a real PDF copy into the real editor and count the paragraphs it lands as.
 *
 * reflowPastedText is unit-tested on its own; this proves the editor actually calls it, and that
 * what comes out survives the contentEditable round-trip into the document model — which is the
 * part the screenshots showed going wrong.
 *
 * Since paragraph markers, a reflowed paste also drops a marker at each real paragraph break —
 * the marker REPLACES the blank line that break used to become, rather than joining it. The
 * second half of this script covers the other direction: a paste it declines to reflow must come
 * back untouched and gain no markers at all, which is the invariant the whole module exists for.
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
  [...document.querySelector('[role="textbox"][aria-label="Script"]').childNodes].map((c) => ({
    text: (c.textContent ?? '').trim(),
    // A marker carries a pilcrow, so it is not blank — it has to be recognized structurally or
    // it would be counted as a paragraph of its own.
    marker: c.nodeType === 1 && c.getAttribute('data-block') === 'section',
  })),
)

const paragraphs = blocks.filter((b) => !b.marker && b.text !== '').map((b) => b.text)
console.log(`blocks in the editor : ${blocks.length}  (${paragraphs.length} paragraphs of text)`)
blocks.forEach((b, i) =>
  console.log(`  [${i}] ${b.marker ? '(paragraph marker)' : b.text === '' ? '(blank line)' : b.text.slice(0, 62) + '…'}`),
)

const markers = await page.evaluate(
  () => document.querySelectorAll('.script-editor [data-block="section"]').length,
)

const ok =
  paragraphs.length === 2 &&
  blocks.length === 3 &&
  markers === 1 &&
  paragraphs[0].startsWith('17 września') &&
  paragraphs[0].endsWith('swoich rodziców.') &&
  paragraphs[1].startsWith('Ja nazywam się') &&
  paragraphs[1].endsWith('naprawdę.')

if (!ok) {
  await browser.close()
  console.log(
    `\n✗ the PDF paste did not land as two paragraphs parted by one marker ` +
      `(blocks=${blocks.length}, markers=${markers})`,
  )
  process.exit(1)
}
console.log('\n✓ six hard-wrapped lines landed as the two paragraphs the PDF actually had,')
console.log('  parted by one paragraph marker')

// --- the other direction: a paste it declines to reflow gains no markers ----
// A bulleted list is the case that would be ruined by marking every break: eleven numbered rules
// through a twelve-item list. It must come back exactly as pasted.
const LIST_CLIPBOARD = [
  'Zanim zaczniemy nagranie, sprawdź proszę następujące rzeczy po kolei:',
  '- mikrofon jest podłączony i poziom dźwięku został ustawiony poprawnie',
  '- światło nie zmienia się w trakcie nagrania ani nie miga w tle',
  '- telefon jest wyciszony i leży poza zasięgiem ręki prowadzącego',
].join('\n')

await page.getByRole('button', { name: 'New' }).click()
await page.waitForTimeout(300)
// "New" is destructive, so it asks first.
const confirm = page.getByRole('button', { name: /^(Discard|New|Yes|Confirm|OK)$/ })
if (await confirm.count()) {
  await confirm.first().click()
  await page.waitForTimeout(300)
}
await editor.click()
await page.evaluate((text) => {
  const el = document.querySelector('[role="textbox"][aria-label="Script"]')
  const dt = new DataTransfer()
  dt.setData('text/plain', text)
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, LIST_CLIPBOARD)
await page.waitForTimeout(500)

const listState = await page.evaluate(() => {
  const el = document.querySelector('[role="textbox"][aria-label="Script"]')
  return {
    markers: el.querySelectorAll('[data-block="section"]').length,
    lines: [...el.childNodes].map((c) => (c.textContent ?? '').trim()).filter((t) => t !== ''),
  }
})
console.log(`\nlist paste  : ${listState.lines.length} lines, ${listState.markers} markers`)

await browser.close()
if (listState.markers !== 0 || listState.lines.length !== 4) {
  console.log('\n✗ a list paste must come back as four untouched lines with NO markers')
  process.exit(1)
}
console.log('✓ a list paste is left alone entirely — no markers run through it')
