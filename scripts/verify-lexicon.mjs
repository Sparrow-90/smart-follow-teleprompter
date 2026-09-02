/**
 * Every word in the command grammar exists in the model that has to recognize it.
 *
 * This is the check the repo learned the hard way. Four wake words were tried and abandoned before
 * klik/click, each failing for the same invisible reason: the small Vosk models have a CLOSED
 * lexicon, so a word they do not hold can never be returned however clearly it is spoken. Until
 * now the only way to find that out was `?debug=stt` on a real device with a real voice.
 *
 * It turns out it can be checked offline. Vosk's `graph/Gr.fst` embeds its word symbol table as
 * OpenFst writes it — an int32 little-endian length followed by the raw UTF-8 bytes — so a word is
 * in the lexicon exactly when `int32(len) + word` appears in the file. Matching the length prefix
 * is what makes this exact rather than a substring search: without it "paragraph" matches inside
 * "subparagraph" and reports a word the model cannot actually emit on its own.
 *
 * What this does NOT prove: that a given voice will land on the word. That stays a device check.
 * What it does prove is the failure that used to cost a day — shipping a command word that no
 * amount of clear speech could ever trigger.
 *
 * Needs the models fetched (scripts/fetch-models.sh); skips cleanly when they are absent, since
 * they are gitignored.  Run: node scripts/verify-lexicon.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const MODELS = {
  'pl-PL': 'public/models/vosk-model-small-pl-0.22.tar.gz',
  'en-US': 'public/models/vosk-model-small-en-us-0.15.tar.gz',
}

// Mirrors commandGrammarFor() in src/smartfollow/voiceCommands.ts. Kept as literals rather than
// imported: this script must be able to run against a build, and the point is to catch a grammar
// edit that nobody re-checked against the model.
const GRAMMAR = {
  'pl-PL': ['klik góra', 'klik dół', 'klik start', 'klik akapit'],
  'en-US': ['click up', 'click down', 'click go', 'click paragraph'],
}

/** Loaded once per language, reused by the wake-word pass below. */
const fsts = {}
let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const missing = Object.values(MODELS).filter((f) => !existsSync(f))
if (missing.length > 0) {
  console.log('SKIP  Vosk models are not present (they are gitignored).')
  console.log('      Run: bash scripts/fetch-models.sh')
  process.exit(0)
}

/**
 * True when `word` is a whole entry in the FST's embedded symbol table.
 *
 * An entry is `int32 length + bytes + int64 key`, and BOTH ends are checked. The length prefix
 * stops "paragraph" matching inside "subparagraph". The trailing key stops a short word matching
 * by chance in the arc data, which is millions of small little-endian integers and would otherwise
 * throw false positives for two-letter words like "up" and "go" — a real key is a small integer,
 * so its top five bytes are zero.
 */
function inLexicon(fst, word) {
  const bytes = Buffer.from(word, 'utf8')
  const prefix = Buffer.alloc(4)
  prefix.writeInt32LE(bytes.length)
  const pattern = Buffer.concat([prefix, bytes])
  for (let i = fst.indexOf(pattern); i !== -1; i = fst.indexOf(pattern, i + 1)) {
    const key = fst.subarray(i + pattern.length, i + pattern.length + 8)
    if (key.length === 8 && key.subarray(3).every((b) => b === 0)) return true
  }
  return false
}

for (const [lang, archive] of Object.entries(MODELS)) {
  // The models ship as tarballs; stream the one file we need straight out rather than unpacking
  // 40MB to disk. The member is looked up by listing first, because the two tars disagree about
  // globbing: BSD tar (macOS) globs by default and rejects --wildcards, GNU tar (CI) needs it.
  // An exact member name works on both.
  const member = execFileSync('tar', ['-tzf', archive], { maxBuffer: 1 << 28, encoding: 'utf8' })
    .split('\n')
    .find((f) => f.endsWith('/graph/Gr.fst'))
  if (!member) {
    check(false, `${archive} contains a graph/Gr.fst`)
    continue
  }
  const fst = execFileSync('tar', ['-xOzf', archive, member], {
    maxBuffer: 1 << 30,
    encoding: 'buffer',
  })

  fsts[lang] = fst

  const words = [...new Set(GRAMMAR[lang].flatMap((phrase) => phrase.split(/\s+/)))]
  console.log(`\n${lang}  (${words.length} distinct grammar words)`)
  for (const w of words) {
    check(inLexicon(fst, w), `"${w}" is in the ${lang} lexicon`)
  }

  // Reported, deliberately NOT asserted. The repo used to claim the two lexicons were disjoint,
  // and that this was what kept one shared verb table safe. Measured here, that is false: the
  // Polish model holds click/up/down/go and the English one holds start. Nothing is broken by it
  // — what actually stops the script triggering commands is the WAKE WORD + VERB pair and the
  // end-of-window rule in detectCommand, never the lexicons failing to overlap. Printing it keeps
  // the true reason visible instead of letting the old one quietly come back.
  const other = lang === 'pl-PL' ? 'en-US' : 'pl-PL'
  const foreign = [...new Set(GRAMMAR[other].flatMap((p) => p.split(/\s+/)))]
  const shared = foreign.filter((w) => !words.includes(w) && inLexicon(fst, w))
  console.log(
    `INFO  ${lang} also holds ${shared.length ? shared.join(', ') : 'none'} from ${other} ` +
      `(harmless — the wake-word pair is the guard, not lexicon separation)`,
  )
}

// --- the wake-word table's language assumptions ----------------------------
// WAKE_WORDS is one shared list accepted whatever the language is set to, and the comments in
// voiceCommands.ts make specific claims about which model holds what. Those claims are the ones
// that historically cost days — four wake words were tried and abandoned before klik/click — so
// they are pinned here rather than left as prose. Expectations below are measured, not assumed.
const WAKE_EXPECTATIONS = [
  // [word,        in pl-PL, in en-US, why it is in the table]
  ['klik', true, false, 'Polish wake form, the robust choice'],
  ['klika', true, false, 'inflection a spoken "klik" may land on'],
  ['kliknij', true, false, 'inflection a spoken "klik" may land on'],
  ['click', true, true, 'the one wake word BOTH models hold outright'],
  ['promptly', false, true, 'English brand phrase — inert in Polish, as documented'],
  ['prompt', false, true, 'English brand phrase — inert in Polish, as documented'],
  ['asystent', true, false, 'the guaranteed Polish fallback'],
  // normalizeWord folds the ogonek, so the TABLE entry is "prad" while the model emits "prąd".
  // Checking the folded form would fail and wrongly look like a broken wake word.
  ['prąd', true, false, 'what the Polish model returns for a spoken "prompt"'],
]

console.log('\nwake words')
for (const [word, inPl, inEn, why] of WAKE_EXPECTATIONS) {
  const gotPl = inLexicon(fsts['pl-PL'], word)
  const gotEn = inLexicon(fsts['en-US'], word)
  check(
    gotPl === inPl && gotEn === inEn,
    `"${word}" — ${why}`,
    `pl=${gotPl} en=${gotEn}, expected pl=${inPl} en=${inEn}`,
  )
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
