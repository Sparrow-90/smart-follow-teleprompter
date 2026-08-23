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
}

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

  // Only widen the search to the whole script when the local window is unconvincing (§32).
  if (best.score < minConfidence) best = consider(0, tokens.length - 1, best)

  if (best.score < minConfidence) {
    return { index: cur, lineIndex: lineOf(cur), confidence: Math.max(0, best.score), moved: false }
  }
  return { index: best.p, lineIndex: lineOf(best.p), confidence: best.score, moved: best.p !== cur }
}

// --- helpers ---------------------------------------------------------------

/** Longest common subsequence length using fuzzy word equality. */
function fuzzyLcs(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = wordsMatch(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
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
