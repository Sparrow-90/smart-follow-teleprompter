/**
 * Guards the one thing that broke Smart Follow in production: the Vosk models are gitignored,
 * so a clean clone (which is exactly what Vercel builds from) produces a `dist/` with no
 * `models/` in it. The app then 404s on the model, `load()` throws before `startMic()` is ever
 * reached, and the browser never even asks for the microphone.
 *
 * Expected filenames are read from VOSK_MODELS rather than hardcoded, so renaming a model in
 * the engine can't silently drift away from what the build actually ships.
 */
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const engine = readFileSync(`${root}src/smartfollow/stt/voskEngine.ts`, 'utf8')

const block = engine.match(/VOSK_MODELS[^=]*=\s*\{([\s\S]*?)\}/)
if (!block) {
  console.error('✗ could not find VOSK_MODELS in src/smartfollow/stt/voskEngine.ts')
  process.exit(1)
}
const urls = [...block[1].matchAll(/'(\/[^']+)'/g)].map((m) => m[1])
if (urls.length === 0) {
  console.error('✗ VOSK_MODELS lists no model URLs')
  process.exit(1)
}

const MIN_BYTES = 1_000_000
let failed = false

for (const url of urls) {
  const path = `${root}dist${url}`
  let size
  try {
    size = statSync(path).size
  } catch {
    console.error(`✗ ${url} — missing from dist/ (this is the production 404)`)
    failed = true
    continue
  }
  if (size < MIN_BYTES) {
    console.error(`✗ ${url} — only ${size} bytes; not a real model (LFS pointer? error page?)`)
    failed = true
    continue
  }
  // gzip magic — catches an HTML error page or a Git LFS pointer saved under a .tar.gz name.
  const fd = openSync(path, 'r')
  const head = Buffer.alloc(2)
  readSync(fd, head, 0, 2, 0)
  closeSync(fd)
  if (head[0] !== 0x1f || head[1] !== 0x8b) {
    console.error(`✗ ${url} — not gzip data (starts with ${head.toString('hex')})`)
    failed = true
    continue
  }
  console.log(`✓ ${url} — ${(size / 1e6).toFixed(1)} MB, gzip`)
}

if (failed) {
  console.error('\nSmart Follow would be dead on this build. Run: bash scripts/fetch-models.sh')
  process.exit(1)
}
console.log(`\n✓ all ${urls.length} Smart Follow models present in dist/`)
