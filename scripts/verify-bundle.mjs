/**
 * Guards the shape of the production bundle.
 *
 * Smart Follow's speech engine (`vosk-browser`) ships a 5.8MB `dist/vosk.js`. Imported
 * statically it lands in the entry chunk, which pushes the app shell over workbox's 2MB
 * precache limit — the PWA build then fails outright and nothing can be installed or tested
 * offline. That is exactly how the build broke, and it stayed broken for two commits because
 * no check ran between `npm test` and a human trying to deploy.
 *
 * Run after a build: node scripts/verify-bundle.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Workbox's default maximumFileSizeToCacheInBytes. Anything at or above it is not precached,
// and vite-plugin-pwa treats that as a build error.
const PRECACHE_LIMIT = 2 * 1024 * 1024

const checks = []
const check = (ok, label) => {
  checks.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

console.log('Building…')
let built = true
try {
  execSync('npm run build', { stdio: 'pipe' })
} catch (e) {
  built = false
  console.log(String(e.stdout ?? '').split('\n').slice(-12).join('\n'))
}
check(built, 'the production build succeeds')
if (!built) {
  console.log('\n0/1 checks passed')
  process.exit(1)
}

const html = readFileSync('dist/index.html', 'utf8')
const entryName = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1]
check(entryName != null, `index.html references an entry chunk — ${entryName ?? 'none found'}`)

const sizeOf = (rel) => readFileSync(join('dist', rel)).length
const entrySize = entryName ? sizeOf(entryName) : Infinity
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`

check(
  entrySize < PRECACHE_LIMIT,
  `the entry chunk is under the ${mb(PRECACHE_LIMIT)} precache limit — ${mb(entrySize)}`,
)

// Vosk must live in its own lazily-loaded chunk, so the shell can be precached without it.
const chunks = readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
const voskChunk = chunks.find((f) => f !== entryName && sizeOf(join('assets', f)) > 2 * 1024 * 1024)
check(
  voskChunk != null,
  `the speech engine sits in its own chunk — ${voskChunk ? `${voskChunk} (${mb(sizeOf(join('assets', voskChunk)))})` : 'not found; still bundled into the entry chunk?'}`,
)
check(
  voskChunk != null && voskChunk.startsWith('vosk-engine-'),
  `that chunk has the stable name the caching rules target — ${voskChunk ?? 'n/a'}`,
)

// The whole point: the app shell is actually precached, so it opens offline.
const sw = readFileSync('dist/sw.js', 'utf8')
check(
  entryName != null && sw.includes(entryName.replace('assets/', '')),
  'the service worker precaches the entry chunk',
)

// The engine must NOT be precached (it would force 5.8MB on someone who never starts Smart
// Follow, and exceeds the limit anyway) but must still be cached once fetched, so Smart Follow
// keeps working offline after its first run.
check(
  voskChunk != null && !sw.includes(voskChunk),
  'the service worker does not precache the speech engine',
)
check(sw.includes('vosk-engine'), 'the service worker runtime-caches the speech engine on first use')

// The invariant that keeps the build passing: nothing *else* may grow past the precache limit.
// Deliberately not a fixed chunk count — future lazy-loaded screens are welcome, oversized ones
// are not, since one is all it takes to fail the PWA build again.
const oversized = chunks.filter((f) => f !== voskChunk && sizeOf(join('assets', f)) >= PRECACHE_LIMIT)
check(
  oversized.length === 0,
  `no other chunk exceeds the precache limit — ${oversized.length ? oversized.join(', ') : `${chunks.length} chunk(s) checked`}`,
)

const passed = checks.filter(Boolean).length
console.log(`\n${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
