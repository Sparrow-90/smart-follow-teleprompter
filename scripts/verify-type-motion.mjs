/**
 * The app has ONE motion vocabulary and ONE label style, on both sides of the Framer boundary.
 *
 * `components/prompt/`, `engine/` and `smartfollow/` may contain no `motion.*` at all — Framer
 * owns `transform` and so does the scroll engine — so Prompt Mode animates in CSS while the rest
 * of the app animates through `motion/tokens.ts`. Left to itself that split produced two
 * vocabularies: the `change` curve (200ms, cubic-bezier(0.32, 0.72, 0, 1)) existed in four places
 * at three different durations — `motion/tokens.ts`, the theme cross-fade in `index.css`,
 * `SegmentedControl` (`duration-200 ease-out`, a different curve), and the Prompt Mode chrome and
 * controls (`duration-300`, matching nothing). The screen the presenter actually reads from was
 * the one speaking the ad-hoc dialect.
 *
 * A CSS variable cannot import from a `.ts` file, so the two are kept honest the way this repo
 * keeps lineHeightPx honest: by reading both and asserting they agree. Every number below is READ
 * FROM SOURCE — repeating one here would just add a fourth place for it to drift from.
 *
 * No server and no browser needed: node scripts/verify-type-motion.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const css = readFileSync('src/index.css', 'utf8')
const motion = readFileSync('src/motion/tokens.ts', 'utf8')

/**
 * Every forbidden pattern below is a claim about CODE, and this repo comments heavily enough that
 * the difference matters: scanning raw text, `/motion\./` matched the words "eased motion." in
 * SmoothFollowEngine's header, and the ban on a weight class matched the comment in PromptText
 * that explains why there isn't one. A guard that fires on its own documentation is worse than no
 * guard — it gets silenced. JSX `{/* … *\/}` collapses to `{}`, which no pattern here matches.
 */
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Not preceded by `:`, so a `https://` inside a string survives.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// --- the two motion sources agree -------------------------------------------
// `change` is the one curve both sides share. `press` has no CSS spring to compare against, so
// what is asserted there is its visualDuration — the number `.pressable` has to be timed to.
{
  const cssVar = (name) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim()

  const jsChangeMs = Number(motion.match(/change: Transition = \{ duration: ([\d.]+)/)?.[1]) * 1000
  const cssChangeMs = Number(cssVar('duration-change')?.replace('ms', ''))
  check(
    Number.isFinite(jsChangeMs) && jsChangeMs === cssChangeMs,
    "the `change` DURATION agrees across the boundary",
    `tokens.ts ${jsChangeMs}ms, index.css ${cssChangeMs}ms`,
  )

  // motion/tokens.ts writes the curve as a bezier array; CSS writes it as cubic-bezier(). Compare
  // the four numbers, not the spelling.
  const jsEase = motion.match(/change: Transition = \{[^}]*ease: \[([^\]]+)\]/)?.[1]
  const jsPoints = jsEase?.split(',').map((n) => Number(n.trim()))
  const cssPoints = cssVar('ease-change')
    ?.match(/cubic-bezier\(([^)]+)\)/)?.[1]
    ?.split(',')
    .map((n) => Number(n.trim()))
  check(
    jsPoints?.length === 4 && cssPoints?.length === 4 && jsPoints.every((n, i) => n === cssPoints[i]),
    'the `change` CURVE agrees across the boundary',
    `tokens.ts [${jsPoints}], index.css [${cssPoints}]`,
  )

  const jsPressMs = Number(motion.match(/press: Transition = \{[^}]*visualDuration: ([\d.]+)/)?.[1]) * 1000
  const cssPressMs = Number(cssVar('duration-press')?.replace('ms', ''))
  check(
    Number.isFinite(jsPressMs) && jsPressMs === cssPressMs,
    'the `press` duration agrees across the boundary',
    `tokens.ts ${jsPressMs}ms, index.css ${cssPressMs}ms`,
  )

  // The theme cross-fade is deliberately SLOWER than `change` — it repaints every colour on the
  // screen at once. What matters is that it is named rather than hand-copied, and that it shares
  // the curve. A bare cubic-bezier() anywhere but the --ease-change definition is the regression.
  const beziers = css.match(/cubic-bezier\([^)]+\)/g) ?? []
  check(
    beziers.length === 1,
    'the curve is written ONCE in index.css, and every rule references it',
    `${beziers.length} literal cubic-bezier() in the file`,
  )
}

// --- Prompt Mode does not reinvent a timing ---------------------------------
// These are the exact idioms the boundary kept being re-typed as. Each was checked by putting the
// literal back and watching this fail — a guard that cannot fail is not a guard.
{
  const files = execSync('git ls-files "src/components/prompt/*.tsx" "src/engine/*.ts"', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)

  const forbidden = [
    [/duration-\d+\b/, 'a bare Tailwind duration step (duration-200, duration-300, …)'],
    [/\bease-(?:in|out|linear|in-out)\b/, 'a bare Tailwind easing keyword'],
    [/\btransition-transform\b/, 'transition-transform, which REPLACES the theme cross-fade list'],
    [/\bmotion\./, 'a Framer motion component — banned outright on this side'],
  ]
  const hits = []
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'))
    for (const [re, why] of forbidden) if (re.test(src)) hits.push(`${f}: ${why}`)
  }
  check(hits.length === 0, 'Prompt Mode times everything from the shared variables', hits.join('; '))
}

// --- the label idiom has exactly one definition -----------------------------
// `text-xs font-medium tracking-wide uppercase` was retyped in eight files. `.type-label` replaced
// it, and the compensating negative margin is the reason a copy is not good enough: without it
// every label carries a trailing 0.14em of tracking that no site remembers to remove.
{
  const label = css.match(/\.type-label\s*\{([^}]+)\}/)?.[1] ?? ''
  const tracking = label.match(/letter-spacing:\s*([\d.]+)em/)?.[1]
  const compensation = label.match(/margin-inline-end:\s*-([\d.]+)em/)?.[1]
  check(
    Boolean(tracking) && tracking === compensation,
    'the label token compensates for its own trailing tracking',
    `letter-spacing ${tracking}em, margin-inline-end -${compensation}em`,
  )
  check(/text-transform:\s*uppercase/.test(label), 'the label token carries its own case')

  // #lab is a dev harness, not the product path (see CLAUDE.md) — excluded on purpose.
  const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('SmartFollowLab') && !f.includes('.test.'))
  const hits = files.filter((f) => /tracking-wide/.test(codeOnly(readFileSync(f, 'utf8'))))
  check(hits.length === 0, 'no product screen re-types the old label idiom', hits.join(', '))
}

// --- the script's own typography stays on the preset ------------------------
// Tracking and weight are corrections to a SIZE, and every size in Prompt Mode comes from the
// resolved preset. A weight class on the rendered line would win over the preset's and pin all of
// them to one value — the same failure mode textScale has, for the same reason.
{
  const promptText = codeOnly(readFileSync('src/components/prompt/PromptText.tsx', 'utf8'))
  check(
    /letterSpacing: preset\.letterSpacing/.test(promptText) &&
      /fontWeight: preset\.fontWeight/.test(promptText),
    'PromptText takes tracking and weight from the resolved preset',
  )
  const line = promptText.match(/data-prompter-line[\s\S]{0,400}?>/)?.[0] ?? ''
  check(
    !/font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)\b/.test(line),
    'the rendered line sets no weight of its own',
  )
}

console.log(
  failures === 0
    ? '\n✓ one motion vocabulary and one label style, on both sides of the Framer boundary'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
