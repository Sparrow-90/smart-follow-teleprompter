import { normalizeWord, type ScriptToken } from './tokenizeScript'

export interface MatchResult {
  /** Token index the presenter is currently at (last matched word). */
  index: number
  /** Line of that token (maps to the Nth [data-prompter-line]). */
  lineIndex: number
  /** 0..1 — how sure we are of the position. */
  confidence: number
  /** Whether the position changed from `currentIndex`. */
  moved: boolean
}

export interface MatchOptions {
  /** Trailing recognized words to align (the presenter's "now"). */
  recentWords?: number
  /** Local search window around the current position (words). */
  back?: number
  forward?: number
  /** Below this score we keep the current position (anti false-jump). */
  minConfidence?: number
  /**
   * What a match from OUTSIDE the local window has to score. Deliberately far above
   * `minConfidence`: a local match is corroborated by where the presenter already was, and a
   * distant one has nothing behind it but the words themselves.
   */
  farMinConfidence?: number
  /**
   * ...and how much rarity-weighted evidence those matched words have to carry (see
   * {@link rarityIn}). A ratio alone cannot judge a short window — one word that occurs anywhere
   * scores a perfect 1.0 — so the two gates answer different halves of the same question:
   * *how much of what was said lined up*, and *was any of it worth anything*.
   */
  farMinEvidence?: number
  /**
   * Restrict the search to the local window and never widen to the whole script. Set for a
   * short spell after a manual re-anchor so speech the presenter is still finishing ("sorry,
   * let me take that again") cannot jump them to a false match elsewhere in the document.
   */
  localOnly?: boolean
}

/**
 * What a match from outside the local window must score, and how much rarity-weighted evidence it
 * must carry. Measured by `scripts/verify-false-jump.mjs` on the 3,574-word PRD, replaying the
 * rolling window Vosk really emits (the rates below come from that harness sampled densely — see
 * its header):
 *
 *   eight-word off-script aside          47.8% ran away  ->  0.4%   (worst jump 3,055 words)
 *   the same aside heard as near-misses  42.9%           ->  1.2%
 *   a single recognized word             48.8%           ->  0
 *   a deliberate skip elsewhere          99.0% caught up  ->  99.0%, 0.4 of a word slower
 *
 * The two gates do different jobs, and the table is how you can tell: the RATIO is what turns the
 * asides away, and the EVIDENCE floor is what stops one or two words crossing the document (it is
 * why a one-word window cannot even reach the scan — one word cannot carry 1.6). Neither
 * substitutes for the other, and a stricter ratio is not free: 0.7 removes the last 0.4% and drops
 * catch-up to 93.8%.
 */
const FAR_MIN_CONFIDENCE = 0.6
const FAR_MIN_EVIDENCE = 1.6

/**
 * Locate the presenter in the script from a recent recognized phrase.
 *
 * Prefers the local context around `currentIndex` (§32), tolerates paraphrasing/insertions
 * (§31), allows small backtracking (§33) and forward skips (§34), and resists false jumps
 * (§30): a weak or garbled phrase keeps the current position rather than leaping.
 *
 * Stub — implemented test-first (see matcher.test.ts).
 */
export function matchPosition(
  tokens: ScriptToken[],
  currentIndex: number,
  recognized: string[],
  options: MatchOptions = {},
): MatchResult {
  const R = options.recentWords ?? 6
  const back = options.back ?? 8
  const forward = options.forward ?? 40
  const minConfidence = options.minConfidence ?? 0.4
  const farMinConfidence = options.farMinConfidence ?? FAR_MIN_CONFIDENCE
  const farMinEvidence = options.farMinEvidence ?? FAR_MIN_EVIDENCE

  const cur = tokens.length === 0 ? 0 : Math.max(0, Math.min(tokens.length - 1, currentIndex))
  const lineOf = (i: number) => tokens[i]?.lineIndex ?? 0

  const words = recognized.map(normalizeWord).filter((w) => w.length > 0)
  if (words.length === 0 || tokens.length === 0) {
    return { index: cur, lineIndex: lineOf(cur), confidence: 0, moved: false }
  }
  const recent = words.slice(-R)

  const scoreAt = (p: number): number => {
    const start = Math.max(0, p - recent.length + 1)
    const slice = tokens.slice(start, p + 1).map((t) => t.text)
    return fuzzyLcs(recent, slice) / recent.length
  }

  // Prefer the local context first (§32); a tie resolves to the position nearest `cur`.
  const consider = (from: number, to: number, best: { p: number; score: number }) => {
    for (let p = from; p <= to; p++) {
      const s = scoreAt(p)
      if (s > best.score || (s === best.score && Math.abs(p - cur) < Math.abs(best.p - cur))) {
        best.p = p
        best.score = s
      }
    }
    return best
  }

  let best = consider(Math.max(0, cur - back), Math.min(tokens.length - 1, cur + forward), {
    p: cur,
    score: -1,
  })

  // Only widen the search to the whole script when the local window is unconvincing (§32) —
  // and never right after a manual re-anchor, where the user has already told us where they are.
  //
  // What comes back from a widened search is accepted on a far higher bar than a local one, and
  // that is the whole of the runaway fix. On a long script the local bar is a chance event: six
  // ordinary words carrying no real evidence line up three-of-six *somewhere* in three thousand,
  // score exactly 0.5, and win — and the follow engine then chases a target hundreds of screens
  // away at its speed cap, which is the script scrolling off on its own with nobody reading it.
  // Holding still is a safe failure and jumping is not: a refused far jump leaves the text where
  // the presenter is looking, and drag, tap-to-jump and "klik akapit" are all still there.
  if (!options.localOnly && best.score < minConfidence) {
    const rarity = rarityIn(tokens)
    // A window too short to clear the floor even matching the rarest words in the script is not
    // worth scanning three thousand positions for. This bites for a ONE- or two-word window and
    // nothing else — six words of anything clear it — which is exactly the case it is for: a
    // window that short arrives after `resetWindow`, and it used to be enough to cross the whole
    // document. The saved scan is a bonus, not the point (~2ms per call over 3.4k words, on every
    // Vosk partial, on a tablet).
    if (recent.length * rarity.max >= farMinEvidence) {
      const wide = consider(0, tokens.length - 1, { ...best })
      const start = Math.max(0, wide.p - recent.length + 1)
      const slice = tokens.slice(start, wide.p + 1).map((t) => t.text)
      if (wide.score >= farMinConfidence && fuzzyLcs(recent, slice, rarity.of) >= farMinEvidence) {
        best = wide
      }
    }
  }

  if (best.score < minConfidence) {
    return { index: cur, lineIndex: lineOf(cur), confidence: Math.max(0, best.score), moved: false }
  }
  return { index: best.p, lineIndex: lineOf(best.p), confidence: best.score, moved: best.p !== cur }
}

// --- helpers ---------------------------------------------------------------

/**
 * Longest common subsequence using fuzzy word equality — length by default, or the summed
 * `weight` of the matched words when one is given, which then maximises weight rather than count.
 *
 * The weight is read from `script` (the second list), never from `heard`. `wordsMatch` is fuzzy on
 * purpose — Polish inflects and Vosk returns near-misses — so a heard word routinely matches a
 * script token without being that token, and weighing what was heard means weighing a string the
 * script has never contained. Measured, that inverted the gate this weight exists for: the same
 * aside in the script's own words was refused, and heard as near-misses it jumped 59 words.
 *
 * Taking the match unconditionally is correct only for unit weights, where
 * `dp[i-1][j-1] + 1 ≥ max(dp[i-1][j], dp[i][j-1])` always holds. With uneven weights a later
 * low-weight match can shadow an earlier high-weight one on the same script token, so the maximum
 * is taken explicitly — under-counting evidence would refuse a far jump the presenter meant.
 */
function fuzzyLcs(
  heard: string[],
  script: string[],
  weight: (word: string) => number = () => 1,
): number {
  const m = heard.length
  const n = script.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matched = wordsMatch(heard[i - 1], script[j - 1])
        ? dp[i - 1][j - 1] + weight(script[j - 1])
        : 0
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], matched)
    }
  }
  return dp[m][n]
}

/** Word counts per script, built once — `matchPosition` runs on every Vosk partial. */
const scriptCounts = new WeakMap<ScriptToken[], Map<string, number>>()

/**
 * How much a script word is worth as *evidence of position in this script*: at 3.4k words, ~0.92
 * for one used once and ~0.46 for one used on every other line. A function word says nothing about
 * where you are; a word that appears once says almost everything. This is what lets a three-word distinctive phrase cross the whole
 * document while six of the script's commonest words cannot — a plain "at least N words matched"
 * rule cannot tell those two apart, and refusing the first is a behaviour this repo already pins.
 *
 * Note the `log(N)` denominator makes the scale script-length-dependent, so `FAR_MIN_EVIDENCE` is
 * an absolute floor on a relative quantity. It is checked at both ends — 3,390 words and 78 — and
 * the failure direction is asymmetric: on a SHORT script a genuinely distinctive phrase scores
 * lower and could be refused a jump the presenter wanted. The "reaches a distant phrase by
 * default" test is the canary for that. If it ever fails, scale the floor by what a typical
 * window carries in that script; do not lower the constant.
 */
function rarityIn(tokens: ScriptToken[]): { of: (word: string) => number; max: number } {
  let counts = scriptCounts.get(tokens)
  if (!counts) {
    counts = new Map<string, number>()
    for (const t of tokens) counts.set(t.text, (counts.get(t.text) ?? 0) + 1)
    scriptCounts.set(tokens, counts)
  }
  const seen = counts
  const n = Math.max(2, tokens.length) // log(1) = 0 would divide by zero on a one-word script
  const logN = Math.log(n)
  const weigh = (count: number) => Math.log(n / (1 + count)) / logN
  return {
    // A word the script does not contain is worth nothing, not everything. It cannot be reached
    // through `fuzzyLcs` any more, and a gate's default belongs on the refusing side.
    of: (word) => {
      const count = seen.get(word)
      return count ? weigh(count) : 0
    },
    // What the rarest possible word is worth here — a word used once. The ceiling a window of
    // this length could reach if every word of it landed on one.
    max: weigh(1),
  }
}

/** Exact match, or a close near-miss for longer words (tolerates STT/inflection noise). */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length)
  return sim >= 0.8
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}
