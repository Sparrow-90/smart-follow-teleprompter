/**
 * Guards the motion work on the Editor + Setup flow.
 *
 * Settled states are what Playwright is good at; "does it feel right" is not automatable and
 * is still judged by eye on the device. What IS worth automating are the invariants that are
 * invisible when they break:
 *
 *   - the push/pop actually overlaps both screens (otherwise it is a cross-fade, or nothing)
 *   - Start Prompt stays a HARD CUT, so nothing outlives the presenter's Exit
 *   - the segmented pill genuinely travels rather than teleporting
 *   - reduced motion flattens the UI but leaves the teleprompter scrolling — the project's
 *     stated invariant, and the one most likely to regress unnoticed
 *
 * Run with the dev server up: node scripts/verify-motion.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5188'
const OUT = '/tmp/prompter-motion'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const check = (ok, label) => {
  checks.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const browser = await chromium.launch()

async function newPage(reducedMotion) {
  const ctx = await browser.newContext({
    viewport: { width: 1194, height: 834 }, // iPad landscape
    reducedMotion,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  return page
}

/** Types a script into the editor so Continue becomes enabled. */
async function seedScript(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await sleep(400)
  const editor = page.getByRole('textbox', { name: 'Script' })
  await editor.click()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.type(`Line ${i} of the script, long enough to scroll past the fold. `)
    await page.keyboard.press('Enter')
  }
  await sleep(400)
}

// ── 1. The push overlaps both screens ────────────────────────────────────────────────────
console.log('\n1. Editor → Setup push')
{
  const page = await newPage('no-preference')
  await seedScript(page)

  await page.getByRole('button', { name: 'Continue' }).click()
  await sleep(120) // mid-flight

  const midFlight = await page.evaluate(() => ({
    editor: !!document.body.textContent?.includes('by Mateusz Wróbel'),
    setup: !!document.querySelector('[aria-label="Reading distance"]'),
    screens: document.querySelectorAll('.absolute.inset-0').length,
  }))
  await page.screenshot({ path: `${OUT}/01-push-midflight.png` })
  check(
    midFlight.editor && midFlight.setup,
    `both screens are on stage mid-push — editor:${midFlight.editor} setup:${midFlight.setup}`,
  )

  await sleep(600) // settle
  const settled = await page.evaluate(() => ({
    editor: !!document.body.textContent?.includes('by Mateusz Wróbel'),
    setup: !!document.querySelector('[aria-label="Reading distance"]'),
  }))
  await page.screenshot({ path: `${OUT}/02-push-settled.png` })
  check(!settled.editor && settled.setup, 'the editor is gone once the push settles')

  // ── 1b. The pop runs the other way, with the departing screen on top ───────────────────
  console.log('\n1b. Setup → Editor pop')
  await page.getByRole('button', { name: 'Back to editor' }).click()
  await sleep(120)
  const popMid = await page.evaluate(() => {
    const screens = [...document.querySelectorAll('[data-screen]')]
    return screens.map((el) => ({
      // Which screen is this, and where has it got to?
      setup: el.getAttribute('data-screen') === 'setup',
      x: Math.round(el.getBoundingClientRect().x),
      z: getComputedStyle(el).zIndex,
    }))
  })
  await page.screenshot({ path: `${OUT}/07-pop-midflight.png` })
  const leaving = popMid.find((s) => s.setup)
  const arriving = popMid.find((s) => !s.setup)
  check(
    popMid.length === 2 && leaving && arriving,
    `both screens are on stage mid-pop — ${JSON.stringify(popMid)}`,
  )
  check(
    !!leaving && !!arriving && leaving.x > arriving.x,
    'the departing Setup is to the right of the arriving Editor (travelling back)',
  )
  check(
    !!leaving && !!arriving && Number(leaving.z) > Number(arriving.z),
    `the departing screen slides off on top — leaving z:${leaving?.z} arriving z:${arriving?.z}`,
  )

  await sleep(700)

  // The editor is a contentEditable that has just been inside an animated wrapper. Framer
  // resets the transform to `none` once at rest (verified), which is what keeps iPad Safari's
  // caret behaviour normal — a *persistent* transform ancestor is the known hazard there.
  // This catches a gross break; the real iPad check is still by hand on the device.
  const settledTransform = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-screen]')).transform,
  )
  check(
    settledTransform === 'none',
    `no transform is left on the screen wrapper at rest — ${settledTransform}`,
  )

  await page.getByRole('textbox', { name: 'Script' }).click()
  await page.keyboard.type(' Typed after the pop.')
  await sleep(400)
  const typed = await page.evaluate(
    () => document.querySelector('[contenteditable]')?.textContent ?? '',
  )
  check(
    typed.includes('Typed after the pop.'),
    'the editor still accepts typing after a pop transition',
  )

  await page.getByRole('button', { name: 'Continue' }).click()
  await sleep(700)

  // ── 2. The segmented pill travels ──────────────────────────────────────────────────────
  console.log('\n2. Segmented pill')
  const pillBox = () => page.locator('[data-pill]').boundingBox()
  const closeBox = await page.getByRole('radio', { name: 'Close' }).boundingBox()
  const distanceBox = await page.getByRole('radio', { name: 'Distance' }).boundingBox()

  const before = await pillBox()
  check(
    Math.abs(before.x - (await page.getByRole('radio', { name: 'Standard' }).boundingBox()).x) < 2,
    'the pill starts on the selected segment (Standard)',
  )

  await page.getByRole('radio', { name: 'Distance' }).click()
  await sleep(110) // mid-slide
  const during = await pillBox()
  await page.screenshot({ path: `${OUT}/03-pill-midslide.png` })
  check(
    during.x > before.x && during.x < distanceBox.x - 2,
    `the pill is mid-travel, not teleported — start ${Math.round(before.x)}, ` +
      `mid ${Math.round(during.x)}, target ${Math.round(distanceBox.x)}`,
  )

  await sleep(600)
  const after = await pillBox()
  check(Math.abs(after.x - distanceBox.x) < 2, 'the pill lands exactly on the new segment')
  check(closeBox.x < distanceBox.x, 'sanity: segments are laid out left→right')

  // ── 3. The Language row collapses ──────────────────────────────────────────────────────
  console.log('\n3. Language row')
  const langVisible = () => page.locator('[aria-label="Smart Follow language"]').count()
  check((await langVisible()) === 1, 'the Language row is present while Smart Follow is on')
  await page.getByText('Smart Follow', { exact: true }).click()
  await sleep(700)
  check((await langVisible()) === 0, 'the Language row is gone after turning Smart Follow off')
  await page.screenshot({ path: `${OUT}/04-language-collapsed.png` })

  // ── 3b. The theme cross-fade has not eaten the transition utilities ─────────────────────
  // `transition-property` is replaced, not merged. The theme rule in index.css lives in
  // `@layer base` precisely so Tailwind's utilities still win; unlayered, it silently strips
  // `transition-opacity` from Prompt Mode's auto-hiding chrome and everything else.
  console.log('\n3b. Theme cross-fade stays in its layer')
  const utilityTransition = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Reading distance"] [role="radio"]')
    return getComputedStyle(el).transitionProperty
  })
  check(
    utilityTransition.includes('color') && utilityTransition !== 'background-color, border-color, color',
    `a Tailwind transition utility still owns its own property list — ${utilityTransition}`,
  )

  // ── 4. Start Prompt is a HARD CUT ──────────────────────────────────────────────────────
  console.log('\n4. Start Prompt hard cut')
  await page.getByRole('button', { name: 'Start Prompt' }).click()
  await sleep(50) // well inside any transition window
  const justAfter = await page.evaluate(() => ({
    setup: !!document.querySelector('[aria-label="Reading distance"]'),
    prompt: !!document.querySelector('[data-prompter-text]'),
  }))
  await page.screenshot({ path: `${OUT}/05-prompt-hardcut.png` })
  check(
    !justAfter.setup && justAfter.prompt,
    `Setup vanishes instantly, no exit animation — setup:${justAfter.setup} prompt:${justAfter.prompt}`,
  )

  await page.context().close()
}

// ── 5. Reduced motion: UI flat, teleprompter still scrolls ───────────────────────────────
console.log('\n5. Reduced motion')
{
  const page = await newPage('reduce')
  await seedScript(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await sleep(600)

  // Smart Follow off, so Play drives the auto-scroll engine rather than the (absent) mic.
  await page.getByText('Smart Follow', { exact: true }).click()
  await sleep(500)
  await page.getByRole('button', { name: 'Start Prompt' }).click()
  await sleep(500)

  const readTransform = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-prompter-text]')
      return el ? getComputedStyle(el).transform : null
    })

  const t0 = await readTransform()
  await page.getByRole('button', { name: 'Play' }).click()
  await sleep(1600)
  const t1 = await readTransform()
  await page.screenshot({ path: `${OUT}/06-reduced-motion-scrolling.png` })

  check(t0 !== null && t1 !== null, 'the prompter text element is present')
  check(
    t0 !== t1,
    `THE INVARIANT: the teleprompter still scrolls with reduced motion on — ` +
      `before ${t0}, after ${t1}`,
  )

  await page.context().close()
}

await browser.close()

const passed = checks.filter(Boolean).length
console.log(`\n${passed}/${checks.length} checks passed`)
console.log(`screenshots: ${OUT}`)
process.exit(passed === checks.length ? 0 : 1)
