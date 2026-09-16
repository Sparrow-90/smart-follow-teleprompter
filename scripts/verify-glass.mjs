/**
 * The Editor header is real frosted glass, and everything in it stays legible.
 *
 * "Real" is the first assertion and it is not pedantry. `backdrop-filter` blurs what is painted
 * BEHIND an element, and until the header moved out of flow nothing ever was: the scrollbar lives
 * on the contenteditable and `<main>` carried `mt-8`, so the scroll viewport began 32px below the
 * header and clipped there. A blur of the flat page fill returns the flat page fill — visually
 * identical to no blur at all, while still costing a compositor layer on a budget Android tablet.
 * So this check scrolls text under the header and asserts the sampled backdrop actually DIFFERS
 * from `--color-bg`. Revert the layout and every contrast number below still passes, beautifully,
 * for the wrong reason; only this one notices.
 *
 * Contrast is measured, not reasoned. The header's CHILDREN are hidden (`visibility: hidden`,
 * which leaves layout intact so the rects stay valid) while the glass panel keeps painting, then
 * the pixels under each element's own rect are sampled and compared against its computed `color`.
 *
 * TWO floors, not one — see the CLAUDE.md gotcha:
 *   - wordmark + toolbar glyphs >= 4.5, functional, stricter than WCAG's 3:1 for graphics;
 *   - byline >= 4.0, decorative, and already shipped at 4.09:1 on flat colour by explicit
 *     argument. Holding it to a floor the app never met would be a new rule smuggled in here.
 * Light theme is the binding case for the byline (lime-700 is 4.99:1 on white, half a point of
 * headroom, and blurred dark script DARKENS its backdrop); dark is the risk for the wordmark
 * (white script blurring behind a white mark RAISES the backdrop luminance).
 *
 * Run with the dev server up: node scripts/verify-glass.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const FLOOR = { wordmark: 4.5, toolbar: 4.5, byline: 4.0 }

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- the token is a calc() that TRACKS the status bar, so it is resolved live --
// It used to be a literal and could be read with a regex. It now folds in `--safe-top`, because
// an installed iPad PWA draws under the status bar and the editor's first line has to clear the
// real chrome, not a desk-measured one. So the source check is about SHAPE, and the value is
// resolved by the browser below (via the padding the editor actually gets).
const css = readFileSync('src/index.css', 'utf8')
check(
  /--editor-chrome-h:\s*calc\([^;]*var\(--safe-top\)/.test(css),
  'the chrome height tracks the safe-area inset rather than a fixed number',
)
check(
  /pt-\[var\(--editor-chrome-h\)\]/.test(readFileSync('src/components/editor/ScriptEditor.tsx', 'utf8')),
  'the editor pads its first line past the glass from that same token',
)

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255)
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const parseRGB = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)

/**
 * Worst-case contrast of each header element against the glass backdrop actually behind it.
 *
 * The MEAN is not good enough and that is not a nicety — it was measured. A mean backdrop washes
 * out local hot spots: the byline sitting across one bright blurred word averages out to a dark
 * box and scores 14:1 while being visibly hard to read. Blur leaves structure, so legibility is
 * decided by the worst patch under a glyph, not by the average of the box.
 *
 * So contrast is computed PER PIXEL against the element's own ink and reduced by percentile. The
 * 5th percentile rather than the raw minimum: a single antialiased pixel at a glyph edge is not
 * what anyone reads, and pinning to it would make the check fail for reasons nobody can see.
 *
 * Decoded by the BROWSER rather than a Node PNG library — the repo has no image dependency and
 * needs none: the shot goes back in as a data URI onto an offscreen canvas (never appended, so it
 * cannot disturb the layout whose rects we just read). `dsf` maps CSS pixels to device pixels.
 */
const sampleRects = (page, buf, targets, dsf) =>
  page.evaluate(
    async ({ uri, targets, dsf }) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const c = new OffscreenCanvas(img.width, img.height)
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const srgb = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      const lum = (r, g, b) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255)
      const ratio = (a, b) => {
        const hi = Math.max(a, b)
        const lo = Math.min(a, b)
        return (hi + 0.05) / (lo + 0.05)
      }

      const out = {}
      for (const [key, t] of Object.entries(targets)) {
        const [ir, ig, ib] = t.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        const inkLum = lum(ir, ig, ib)
        const x = Math.max(0, Math.round(t.rect.x * dsf))
        const y = Math.max(0, Math.round(t.rect.y * dsf))
        const w = Math.min(img.width - x, Math.round(t.rect.width * dsf))
        const h = Math.min(img.height - y, Math.round(t.rect.height * dsf))
        if (w <= 0 || h <= 0) { out[key] = null; continue }
        const { data } = ctx.getImageData(x, y, w, h)
        const ratios = []
        let R = 0, G = 0, B = 0
        let worstRGB = null
        let worst = Infinity
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          R += r; G += g; B += b
          const cr = ratio(inkLum, lum(r, g, b))
          ratios.push(cr)
          if (cr < worst) { worst = cr; worstRGB = [r, g, b] }
        }
        ratios.sort((m, n) => m - n)
        const n = data.length / 4
        out[key] = {
          p05: ratios[Math.floor(ratios.length * 0.05)],
          min: ratios[0],
          mean: [R / n, G / n, B / n],
          worstRGB,
        }
      }
      return out
    },
    { uri: `data:image/png;base64,${buf.toString('base64')}`, targets, dsf },
  )

const SCRIPT_TEXT =
  'Dzień dobry i witam Państwa w dzisiejszym wydaniu wiadomości wieczornych. ' +
  'Zaczynamy od najważniejszych wydarzeń dnia, które poruszyły opinię publiczną. '

const browser = await chromium.launch()
const DSF = 2

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: DSF })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('header')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate((t) => {
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(t)
  }, theme)

  // --- the header matches the token it is padded by --------------------------
  const { headerH, tokenPx, paneChildren } = await page.evaluate(() => {
    const header = document.querySelector('header')
    const pane = header.firstElementChild
    return {
      headerH: header.getBoundingClientRect().height,
      // The editor's own padding IS the token, resolved by the engine — no calc() parsing here.
      tokenPx: parseFloat(getComputedStyle(document.querySelector('.script-editor')).paddingTop),
      paneChildren: pane.childElementCount,
    }
  })
  check(
    Math.abs(headerH - tokenPx) <= 1,
    `${theme}: the rendered header matches the resolved --editor-chrome-h`,
    `${headerH.toFixed(1)}px vs ${tokenPx.toFixed(1)}px`,
  )
  /*
   * The blurred element must stay CHILDLESS. iOS Safari blurred the header's own content when the
   * filter sat on the element that contained it — reported from an installed iPad PWA, invisible
   * in Chromium and headless WebKit both. An element with no descendants has nothing of its own to
   * blur whatever an engine thinks the backdrop root is, so this is the invariant, not the tint.
   */
  check(
    paneChildren === 0,
    `${theme}: the blurred pane has no content of its own (the iOS fix)`,
    `${paneChildren} child element(s)`,
  )

  // --- fill the editor and scroll text under the glass -----------------------
  await page.click('.script-editor')
  await page.evaluate((t) => {
    const ed = document.querySelector('.script-editor')
    ed.innerHTML = Array.from({ length: 60 }, () => `<p>${t}</p>`).join('')
    ed.dispatchEvent(new InputEvent('input', { bubbles: true }))
    ed.scrollTop = 600
  }, SCRIPT_TEXT)
  await page.waitForTimeout(400)

  const firstLineClear = await page.evaluate(() => {
    const ed = document.querySelector('.script-editor')
    ed.scrollTop = 0
    const p = ed.querySelector('p')
    return p.getBoundingClientRect().top - document.querySelector('header').getBoundingClientRect().bottom
  })
  check(
    firstLineClear >= -0.5,
    `${theme}: an unscrolled script starts below the glass, not under it`,
    `${firstLineClear.toFixed(1)}px clear`,
  )
  await page.evaluate(() => { document.querySelector('.script-editor').scrollTop = 600 })
  await page.waitForTimeout(300)

  // --- the caret never scrolls under the glass ------------------------------
  // `pt-` protects the first line only. Every other line is protected by `scroll-pt-`, and
  // without it a browser bringing the caret "into view" puts it flush against the scrollport
  // top — which is behind the bar. Measured at 91px of caret hidden before the fix, so this
  // drives the real failure: caret above the viewport, then a keystroke.
  const caret = await page.evaluate(() => {
    const ed = document.querySelector('.script-editor')
    const target = ed.querySelectorAll('p')[19]
    const r = document.createRange()
    r.selectNodeContents(target)
    r.collapse(true)
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    ed.scrollTop = ed.scrollHeight // the caret is now off-screen ABOVE the viewport
    return getComputedStyle(ed).scrollPaddingTop
  })
  await page.keyboard.type('X') // the browser now scrolls the caret minimally into view
  await page.waitForTimeout(250)
  const caretPos = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.textContent = '\u200b'
    getSelection().getRangeAt(0).cloneRange().insertNode(probe)
    const c = probe.getBoundingClientRect()
    const h = document.querySelector('header').getBoundingClientRect()
    probe.remove()
    return { hidden: +(h.bottom - c.top).toFixed(1), caretTop: +c.top.toFixed(1) }
  })
  check(
    caretPos.hidden <= 0.5,
    `${theme}: the caret never scrolls under the glass`,
    `${caretPos.hidden}px hidden (caret top ${caretPos.caretTop}, scroll-padding-top ${caret})`,
  )
  // Put the scroll back where the contrast sampling expects it.
  await page.evaluate(() => { document.querySelector('.script-editor').scrollTop = 600 })
  await page.waitForTimeout(250)

  // --- hide the header's CONTENT, keep the glass painting --------------------
  const targets = await page.evaluate(() => {
    const header = document.querySelector('header')
    const bar = header.lastElementChild // the content row; firstElementChild is the glass pane
    const pick = {
      wordmark: header.querySelector('svg[role="img"]'),
      byline: header.querySelector('.font-byline'),
      toolbar: header.querySelector('button'),
    }
    const out = {}
    for (const [k, el] of Object.entries(pick)) {
      const r = el.getBoundingClientRect()
      out[k] = {
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        color: getComputedStyle(k === 'wordmark' ? el : el).color,
      }
    }
    // The wordmark paints with `fill: currentColor`, so its own `color` is the ink.
    out.bg = getComputedStyle(document.body).backgroundColor
    for (const el of bar.children) el.style.visibility = 'hidden'
    return out
  })
  await page.waitForTimeout(250)

  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: Math.ceil(headerH) + 4 } })
  const sampled = await sampleRects(
    page,
    buf,
    Object.fromEntries(['wordmark', 'byline', 'toolbar'].map((k) => [k, targets[k]])),
    DSF,
  )
  await page.evaluate(() => {
    for (const el of document.querySelector('header').lastElementChild.children) el.style.visibility = ''
  })

  // --- the effect is REAL: the backdrop is not flat page colour --------------
  const flat = parseRGB(targets.bg)
  const delta = Math.max(...sampled.wordmark.mean.map((c, i) => Math.abs(c - flat[i])))
  check(
    delta >= 3,
    `${theme}: text actually shows through the glass (backdrop ≠ flat page colour)`,
    `max channel delta ${delta.toFixed(1)} vs bg ${flat.join(',')}`,
  )

  // --- contrast, per element, against its own ink ---------------------------
  for (const key of ['wordmark', 'byline', 'toolbar']) {
    const { p05, mean, worstRGB } = sampled[key]
    check(
      p05 >= FLOOR[key],
      `${theme}: ${key} clears ${FLOOR[key]}:1 against its WORST backdrop`,
      `p05 ${p05.toFixed(2)}:1 (ink ${targets[key].color}, worst patch rgb(${worstRGB.join(',')}), mean rgb(${mean.map((n) => Math.round(n)).join(',')}))`,
    )
  }

  await page.close()
}

await browser.close()
console.log(
  failures === 0
    ? '\n✓ the glass is real, and everything in the header stays legible in both themes'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
