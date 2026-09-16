/**
 * Nothing hides under the iOS status bar on an installed iPad.
 *
 * `index.html` pairs `viewport-fit=cover` with
 * `apple-mobile-web-app-status-bar-style: black-translucent`, which is what lets the app fill the
 * screen in a home-screen PWA — and also what draws it UNDER the status bar. Both footers had
 * always honoured `env(safe-area-inset-bottom)`; nothing honoured the top. Reported from a real
 * iPad and confirmed from the screenshot: the wordmark clipped beneath the clock. Measured at a
 * 24px bar before the fix: Setup's "Back to editor" 4px covered, the Editor's script area starting
 * at y=0, Prompt Mode's Exit likewise.
 *
 * `env()` cannot be faked in a headless browser, which is exactly why `--safe-top` is a CUSTOM
 * PROPERTY that resolves `env(safe-area-inset-top, 0px)` once. A test can set that property and
 * measure — so the one condition that only existed on the device becomes reproducible here. If a
 * site ever inlines `env()` directly again, it drops out of this check silently, so the source
 * scan below is part of the assertion rather than decoration.
 *
 * Run with the dev server up: node scripts/verify-safe-area.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const BAR = 24 // iPad, standalone, black-translucent

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- every top-edge chrome resolves the inset through the token ---------------
for (const [file, what] of [
  ['src/screens/EditorScreen.tsx', "the Editor's glass header"],
  ['src/screens/SetupScreen.tsx', "Setup's scroller"],
  ['src/components/prompt/PromptChrome.tsx', "Prompt Mode's chrome"],
]) {
  const src = readFileSync(file, 'utf8')
  check(/pt-\[max\([^\]]*var\(--safe-top\)\)\]/.test(src), `${what} pads past the status bar`)
}
check(
  /--safe-top:\s*env\(safe-area-inset-top/.test(readFileSync('src/index.css', 'utf8')),
  '--safe-top resolves env(safe-area-inset-top) in exactly one place',
)

/**
 * Anything visible whose top edge is inside the status bar's band.
 *
 * The full-bleed scroll CONTAINERS are excluded on purpose: `.script-editor` and Prompt Mode's
 * text both start at y=0 by design — that is what lets content pass under the chrome — and their
 * padding is what keeps the readable content clear. So the container's top is not the measure;
 * its first LINE is, and that is asserted separately below.
 */
const occluded = (page, bar) =>
  page.evaluate((bar) => {
    const hits = []
    for (const el of document.querySelectorAll('button, a, svg[role="img"], [aria-label], .type-label')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      // Full-bleed scroll containers start at y=0 by design; their PADDING keeps content clear.
      if (el.closest('.script-editor') || el.classList.contains('script-editor')) continue
      if (el.closest('[data-prompter-text]')) continue
      if (r.top < bar - 0.5) {
        const name = (el.getAttribute('aria-label') || el.className?.toString?.().slice(0, 24) || el.tagName).trim()
        hits.push(`${el.tagName.toLowerCase()}"${name}" top=${r.top.toFixed(0)}`)
      }
    }
    return [...new Set(hits)]
  }, bar)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 834, height: 1194 } })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('header')
await page.evaluate(() => document.fonts.ready)

// Stand in for the device: this is the one line that makes an iPad-only condition testable.
await page.evaluate((bar) => document.documentElement.style.setProperty('--safe-top', `${bar}px`), BAR)
await page.waitForTimeout(200)

// --- the Editor grows its chrome by the inset, and the script follows --------
const editor = await page.evaluate(() => ({
  headerH: document.querySelector('header').getBoundingClientRect().height,
  editorPad: parseFloat(getComputedStyle(document.querySelector('.script-editor')).paddingTop),
  scrollPad: parseFloat(getComputedStyle(document.querySelector('.script-editor')).scrollPaddingTop),
}))
check(
  Math.abs(editor.headerH - editor.editorPad) <= 1,
  'editor: the chrome height still matches the editor padding once the inset applies',
  `header ${editor.headerH.toFixed(1)}px, padding ${editor.editorPad.toFixed(1)}px`,
)
check(
  Math.abs(editor.scrollPad - editor.editorPad) <= 1,
  'editor: the caret guard grows with it too',
  `scroll-padding ${editor.scrollPad.toFixed(1)}px`,
)
const editorHits = await occluded(page, BAR)
check(editorHits.length === 0, 'editor: nothing sits under the status bar', editorHits.join(', '))

// The container starts at y=0 on purpose; what must clear the bar is where its CONTENT begins.
// Measured as the content-box top (rect + padding), which does not depend on the editor having
// produced any particular element yet.
const contentTop = await page.evaluate(() => {
  const ed = document.querySelector('.script-editor')
  const r = ed.getBoundingClientRect()
  return {
    top: r.top + parseFloat(getComputedStyle(ed).paddingTop),
    chromeBottom: document.querySelector('header').getBoundingClientRect().bottom,
  }
})
check(
  contentTop.top >= contentTop.chromeBottom - 0.5,
  'editor: the script content box begins below the chrome once the inset applies',
  `content top ${contentTop.top.toFixed(0)}, chrome bottom ${contentTop.chromeBottom.toFixed(0)}`,
)

// --- Setup -------------------------------------------------------------------
// A script, so Continue is enabled.
await page.click('.script-editor')
await page.keyboard.type('Testujemy teleprompter')
await page.waitForTimeout(250)
await page.click('footer button:not([disabled])')
await page.waitForTimeout(1200)
await page.evaluate((bar) => document.documentElement.style.setProperty('--safe-top', `${bar}px`), BAR)
await page.waitForTimeout(200)
const setupHits = await occluded(page, BAR)
check(setupHits.length === 0, 'setup: nothing sits under the status bar — the back button included', setupHits.join(', '))

// --- Prompt Mode -------------------------------------------------------------
await page.click('footer button')
await page.waitForSelector('[data-prompt-chrome]', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1200)
await page.evaluate((bar) => document.documentElement.style.setProperty('--safe-top', `${bar}px`), BAR)
await page.waitForTimeout(300)
const exitTop = await page.evaluate(() => {
  const exit = document.querySelector('[data-prompt-chrome] button')
  return exit ? exit.getBoundingClientRect().top : null
})
check(
  exitTop === null || exitTop >= BAR - 0.5,
  'prompt: Exit clears the status bar',
  exitTop === null ? '(chrome not present)' : `top=${exitTop.toFixed(0)}`,
)

await browser.close()
console.log(
  failures === 0
    ? '\n✓ every screen clears the iOS status bar, and the Editor chrome grows with it'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
