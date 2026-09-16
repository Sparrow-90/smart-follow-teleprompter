/**
 * The colophon does not move the logo, and its two links do not fight over a tap.
 *
 * Putting the version and the social links on the byline row is the placement that touches the
 * most carefully measured markup in the app. `EditorScreen` derives a -2px offset from Urbanist's
 * metrics at 10/20 to buy Figma's 4px mark-to-cap gap, and that offset now sits on a FLEX ROW
 * rather than on the byline span — so `items-center` recentres every child against the tallest
 * one, and a single child with a taller line box drops the byline and voids the derivation. A bare
 * `<span>·</span>` inheriting body 14px at line-height 1.5 is a 21px box: one pixel is enough, and
 * nothing at runtime complains. That is the bug class this exists for.
 *
 * Both numbers below are the source comment's own derivation, asserted rather than snapshotted:
 * Urbanist is ascent 0.9em / descent 0.3em / cap 0.7em, so at 10/20 half-leading is (20 − 12) / 2
 * = 4, the baseline sits at 13, and the cap top lands 6px below the line box's top.
 *
 * Measure the ROW, never the byline span. `getBoundingClientRect()` on an INLINE element returns
 * the font-metrics content area (ascent + descent) and ignores `line-height` entirely — Urbanist
 * at 10px gives a 12px rect sitting 4px below the line box, so the span's `top` is already off by
 * exactly the half-leading and the `+ CAP_TOP` below would compound it. The row is a block box
 * whose rect top IS its box top, and it is the same rect the height check reads.
 *
 * Run with the dev server up: node scripts/verify-colophon.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'

/** Urbanist at 10/20 — see the header. Both follow from the font's metrics, not from taste. */
const ROW_HEIGHT = 20
const CAP_TOP = 6
const FIGMA_GAP = 4

/**
 * Read from source rather than repeated. The offset is the whole subject of this check, so a copy
 * of it here would be one more place for it to drift from — and the one place the check could not
 * notice.
 */
const editor = readFileSync('src/screens/EditorScreen.tsx', 'utf8')
const offsetMatch = editor.match(/data-colophon[^>]*?-mt-\[(\d+)px\]|-mt-\[(\d+)px\][^>]*?data-colophon/)
if (!offsetMatch) throw new Error('could not read the colophon row offset out of EditorScreen.tsx')
const OFFSET = Number(offsetMatch[1] ?? offsetMatch[2])

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const measure = (p) =>
  p.evaluate(() => {
    const row = document.querySelector('[data-colophon]')
    const mark = document.querySelector('svg[role="img"]')
    const links = [...document.querySelectorAll('[data-colophon] a')]
    const version = document.querySelector('[data-colophon] button')
    if (!row || !mark || !version) return null
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }
    }
    return {
      row: r(row),
      mark: r(mark),
      version: r(version),
      versionText: version.textContent.trim(),
      versionFont: getComputedStyle(version).fontFamily,
      links: links.map((a) => ({
        label: a.getAttribute('aria-label'),
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        ...r(a),
      })),
      // Every child's box, so a regression names the culprit instead of just the total.
      children: [...row.children].map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().slice(0, 24),
        height: el.getBoundingClientRect().height,
      })),
    }
  })

const browser = await chromium.launch()

/*
 * Both TABLET orientations, because those are the devices this app is for and both must satisfy
 * the full invariant. The phone case is checked separately below and asserts something different
 * on purpose — see there.
 */
for (const viewport of [
  { width: 1024, height: 768, name: 'tablet landscape' },
  { width: 768, height: 1024, name: 'tablet portrait' },
]) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-colophon]')
  // Urbanist and Geist Mono are self-hosted; a rect measured before they land is the fallback's.
  await page.evaluate(() => document.fonts.ready)

  const m = await measure(page)
  if (!m) {
    check(false, `${viewport.name}: the colophon renders`)
    await page.close()
    continue
  }

  // --- the logo's measured gap survives the new row ---------------------------
  check(
    Math.abs(m.row.height - ROW_HEIGHT) < 0.5,
    `${viewport.name}: the colophon row is exactly ${ROW_HEIGHT}px tall`,
    m.children.map((c) => `${c.tag}${c.text ? `(${c.text})` : ''} ${c.height.toFixed(1)}`).join(', '),
  )

  const gap = m.row.top + CAP_TOP - m.mark.bottom
  check(
    Math.abs(gap - FIGMA_GAP) < 0.5,
    `${viewport.name}: the mark-to-cap gap is Figma's ${FIGMA_GAP}px`,
    `measured ${gap.toFixed(2)}px (row top ${m.row.top.toFixed(1)}, mark bottom ${m.mark.bottom.toFixed(1)}, offset -${OFFSET})`,
  )

  // --- the links go where they claim, and do not overlap ----------------------
  check(m.links.length === 2, `${viewport.name}: both account links render`, `${m.links.length} found`)
  for (const link of m.links) {
    check(
      /^https:\/\//.test(link.href) && link.target === '_blank' && /noopener/.test(link.rel ?? ''),
      `${viewport.name}: ${link.label} opens safely in a new tab`,
      `${link.href} target=${link.target} rel=${link.rel}`,
    )
  }
  if (m.links.length === 2) {
    const [a, b] = m.links
    // The tap targets are grown with `-m-1.5 p-1.5`, which overhangs the 14px mark by 6px each
    // way. At `gap-2` the boxes would overlap by 4px and a tap in that strip would open whichever
    // link won — a tap that opens the WRONG account, which is worse than one that misses.
    check(
      a.right <= b.left + 0.5,
      `${viewport.name}: the two tap targets abut rather than overlap`,
      `${a.label} ends ${a.right.toFixed(1)}, ${b.label} starts ${b.left.toFixed(1)}`,
    )
    check(
      a.height >= 24 && b.height >= 24,
      `${viewport.name}: each tap target clears 24px`,
      `${a.height.toFixed(1)} / ${b.height.toFixed(1)}`,
    )
  }

  // --- the version reveals its build, and re-collapses -------------------------
  const resting = m.versionText
  await page.click('[data-colophon] button')
  const revealed = (await measure(page)).versionText
  check(
    revealed.length > resting.length && revealed.startsWith(resting),
    `${viewport.name}: a tap reveals the build behind the version`,
    `"${resting}" → "${revealed}"`,
  )
  await page.click('[data-colophon] button')
  const collapsed = await measure(page)
  check(
    collapsed.versionText === resting,
    `${viewport.name}: a second tap puts it away`,
    `"${collapsed.versionText}"`,
  )
  check(
    Math.abs(collapsed.row.height - ROW_HEIGHT) < 0.5,
    `${viewport.name}: revealing and collapsing leaves the row height untouched`,
    `${collapsed.row.height.toFixed(1)}px`,
  )
  check(
    /mono/i.test(m.versionFont) || /Geist Mono/.test(m.versionFont),
    `${viewport.name}: the version is set in the numeral face`,
    m.versionFont,
  )

  await page.close()
}

/*
 * Below `sm` the extras must be ABSENT, and this deliberately does NOT assert the 20px row.
 *
 * Measured: the colophon wants 290px and EditorToolbar 215px, against the 342px a 390px header
 * has to give. Nothing fits three of those on one line, and the byline already wrapped at that
 * width before this row existed — the mark alone is 168px against the same toolbar. So the claim
 * worth pinning here is not a height this screen never had, but that the extras cannot make the
 * squeeze worse. Asserting 20px here would be asserting a bug fix nobody made.
 *
 * Nor is raw header overflow the measure: at 390px it is 57px, and it is 57px on `main` too
 * (checked by stashing this work and re-measuring) because `w-[168px]` of mark plus a 215px
 * toolbar already exceed 342px on their own. A check that fires on a condition this branch did not
 * create would be read as this branch's fault. What IS this row's responsibility is never being
 * the widest thing in the left column — at or under the mark's own width it cannot contribute to
 * the overflow at all, whatever the toolbar does.
 */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-colophon]')
  await page.evaluate(() => document.fonts.ready)

  const phone = await page.evaluate(() => {
    const row = document.querySelector('[data-colophon]')
    const visible = (el) => !!el && el.getBoundingClientRect().width > 0
    return {
      byline: visible(row.querySelector('span')),
      links: [...row.querySelectorAll('a')].filter(visible).length,
      version: visible(row.querySelector('button')),
      rowWidth: +row.getBoundingClientRect().width.toFixed(1),
      markWidth: +document.querySelector('svg[role="img"]').getBoundingClientRect().width.toFixed(1),
    }
  })

  check(phone.byline, 'phone: the byline itself still renders')
  check(
    phone.links === 0 && !phone.version,
    'phone: the colophon extras stand down below `sm`',
    `${phone.links} link(s), version ${phone.version ? 'shown' : 'hidden'}`,
  )
  check(
    phone.rowWidth <= phone.markWidth + 0.5,
    'phone: the colophon is never wider than the mark, so it cannot widen the header',
    `row ${phone.rowWidth}px vs mark ${phone.markWidth}px`,
  )

  await page.close()
}

await browser.close()

console.log(
  failures === 0
    ? "\n✓ the colophon sits on the byline without moving the logo, and its links do not overlap"
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
