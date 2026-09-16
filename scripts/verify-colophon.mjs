/**
 * The colophon sits under the CTA at every width, and its two links do not fight over a tap.
 *
 * It lives in the FOOTER, and the two things that bought are what this pins. It shares no line
 * with the byline, so the -2px that buys Figma's 4px mark-to-cap gap is still on the span where
 * nothing can disturb it — the header is byte-for-byte what it was before this work. And a
 * full-width footer fits it at every viewport, where the byline row needed 290px against the 342px
 * a 390px header has and had to hide below `sm`.
 *
 * The byline gap is checked anyway. Not because this branch moves it — it does not — but because
 * an earlier draft DID put the colophon on that row, and the cheapest way to keep that from being
 * re-attempted silently is to leave a guard behind that fails when the gap changes.
 *
 * Reading the byline's box is the subtle part, and it turns on ONE property. An inline element's
 * `getBoundingClientRect()` returns the font-metrics content area (ascent + descent) and ignores
 * `line-height` entirely, which would put its rect 4px below its line box and make the cap 2px
 * down rather than 6. But the byline is a FLEX ITEM — the direct child of a `flex flex-col` — and
 * flex items are blockified, so its rect is its border box and its top IS the line-box top.
 *
 * That is a layout fact, not a constant, so it is asserted rather than assumed: the height check
 * below pins the rect at exactly one line box. Restructure the header so the span is genuinely
 * inline and that check fails first, naming the reason, instead of the gap silently reading 4px
 * off while every other assertion passes.
 *
 * Run with the dev server up: node scripts/verify-colophon.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'

/** Urbanist at 10/20 — every number derived from the font's own metrics, none of them taste. */
const LINE_BOX = 20
const ASCENT = 9 // 0.9em
const DESCENT = 3 // 0.3em
const CAP = 7 // 0.7em, and exactly the height of Figma's text node
const BASELINE = (LINE_BOX - (ASCENT + DESCENT)) / 2 + ASCENT // 13
const CAP_TOP = BASELINE - CAP // 6, below the LINE BOX top
const FIGMA_GAP = 4

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// --- the offset is read from source AND compared, not just reported -----------
const editor = readFileSync('src/screens/EditorScreen.tsx', 'utf8')
const offset = editor.match(/font-byline -mt-\[(\d+)px\]/)
check(Boolean(offset), 'the byline still carries its measured offset on the span itself')
const OFFSET = offset ? Number(offset[1]) : NaN
check(
  OFFSET === CAP_TOP - FIGMA_GAP,
  "the authored offset is what Urbanist's metrics require",
  `-${OFFSET}px, expected -${CAP_TOP - FIGMA_GAP}px (cap top ${CAP_TOP} − Figma's ${FIGMA_GAP})`,
)
check(
  /data-colophon/.test(editor.slice(editor.indexOf('<footer'))),
  'the colophon is in the FOOTER, not back on the byline row',
)

const measure = (p) =>
  p.evaluate(() => {
    const row = document.querySelector('[data-colophon]')
    const mark = document.querySelector('header svg[role="img"]')
    const byline = document.querySelector('header .font-byline')
    const cta = document.querySelector('footer button')
    const version = row?.querySelector('button')
    if (!row || !mark || !byline || !version) return null
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return {
        top: b.top, bottom: b.bottom, left: b.left, right: b.right,
        height: b.height, width: b.width, centre: b.left + b.width / 2,
      }
    }
    return {
      row: r(row), mark: r(mark), byline: r(byline), version: r(version),
      cta: cta ? r(cta) : null,
      versionText: version.textContent.trim(),
      versionFont: getComputedStyle(version).fontFamily,
      hoverRule: getComputedStyle(byline).color,
      links: [...row.querySelectorAll('a')].map((a) => ({
        label: a.getAttribute('aria-label'),
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        ...r(a),
      })),
      footerOverflow: +(
        document.querySelector('footer').scrollWidth - document.querySelector('footer').clientWidth
      ).toFixed(1),
    }
  })

const browser = await chromium.launch()

/*
 * Both tablet orientations because those are the devices this is for, AND the phone — which is now
 * a first-class case rather than an exception, since the footer has room the byline row did not.
 */
for (const vp of [
  { width: 1024, height: 768, name: 'tablet landscape' },
  { width: 768, height: 1024, name: 'tablet portrait' },
  { width: 390, height: 844, name: 'phone' },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-colophon]')
  // Urbanist and Geist Mono are self-hosted; a rect measured before they land is the fallback's.
  await page.evaluate(() => document.fonts.ready)

  const m = await measure(page)
  if (!m) {
    check(false, `${vp.name}: the colophon renders`)
    await page.close()
    continue
  }

  // --- the header the colophon left behind is still correct -------------------
  check(
    Math.abs(m.byline.height - LINE_BOX) < 0.5,
    `${vp.name}: the byline is blockified, so its rect IS its line box`,
    `${m.byline.height.toFixed(1)}px, expected ${LINE_BOX}px — if this fails the gap below is measured against the wrong box`,
  )
  const gap = m.byline.top + CAP_TOP - m.mark.bottom
  check(
    Math.abs(gap - FIGMA_GAP) < 0.5,
    `${vp.name}: the byline still sits Figma's ${FIGMA_GAP}px under the mark`,
    `measured ${gap.toFixed(2)}px (line box top ${m.byline.top.toFixed(1)} + cap ${CAP_TOP} − mark bottom ${m.mark.bottom.toFixed(1)})`,
  )

  // --- it is present at EVERY width, which is the point of the footer ---------
  check(m.links.length === 2, `${vp.name}: both account links render`, `${m.links.length} found`)
  check(
    m.footerOverflow <= 0,
    `${vp.name}: the colophon adds no horizontal overflow to the footer`,
    `${m.footerOverflow}px`,
  )
  if (m.cta) {
    check(
      Math.abs(m.row.centre - m.cta.centre) < 1,
      `${vp.name}: it is centred under the CTA it hangs from`,
      `row ${m.row.centre.toFixed(1)} vs CTA ${m.cta.centre.toFixed(1)}`,
    )
    check(
      m.row.top >= m.cta.bottom,
      `${vp.name}: it sits below the CTA rather than overlapping it`,
      `row top ${m.row.top.toFixed(1)}, CTA bottom ${m.cta.bottom.toFixed(1)}`,
    )
  }

  for (const link of m.links) {
    check(
      /^https:\/\//.test(link.href) && link.target === '_blank' && /noopener/.test(link.rel ?? ''),
      `${vp.name}: ${link.label} opens safely in a new tab`,
      `${link.href} target=${link.target} rel=${link.rel}`,
    )
  }
  if (m.links.length === 2) {
    const [a, b] = m.links
    // `-m-1.5 p-1.5` grows each 14px mark to a 26px target while leaving its LAYOUT box at 14px,
    // so the boxes overhang 6px each way and `gap-2` would have them fight over a 4px strip. A tap
    // landing there opens whichever link won — the WRONG account, which beats missing entirely.
    check(
      a.right <= b.left + 0.5,
      `${vp.name}: the two tap targets abut rather than overlap`,
      `${a.label} ends ${a.right.toFixed(1)}, ${b.label} starts ${b.left.toFixed(1)}`,
    )
    check(
      a.height >= 24 && b.height >= 24,
      `${vp.name}: each tap target clears 24px`,
      `${a.height.toFixed(1)} / ${b.height.toFixed(1)}`,
    )
  }

  // --- the hover colour IS the byline's, not a lookalike ----------------------
  await page.hover('[data-colophon] a[aria-label="GitHub"]')
  await page.waitForTimeout(350)
  const hovered = await page.evaluate(() => ({
    link: getComputedStyle(document.querySelector('[data-colophon] a')).color,
    byline: getComputedStyle(document.querySelector('header .font-byline')).color,
  }))
  check(
    hovered.link === hovered.byline,
    `${vp.name}: hover resolves to the byline's own colour`,
    `${hovered.link} vs ${hovered.byline}`,
  )

  // --- the version reveals its build, and re-collapses -------------------------
  const resting = m.versionText
  await page.click('[data-colophon] button')
  const revealed = (await measure(page)).versionText
  check(
    revealed.length > resting.length && revealed.startsWith(resting),
    `${vp.name}: a tap reveals the build behind the version`,
    `"${resting}" → "${revealed}"`,
  )
  await page.click('[data-colophon] button')
  check(
    (await measure(page)).versionText === resting,
    `${vp.name}: a second tap puts it away`,
  )
  check(
    /mono/i.test(m.versionFont),
    `${vp.name}: the version is set in the numeral face`,
    m.versionFont,
  )

  await page.close()
}

await browser.close()

console.log(
  failures === 0
    ? '\n✓ the colophon hangs under the CTA at every width, and its links do not overlap'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
