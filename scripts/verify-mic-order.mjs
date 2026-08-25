/**
 * Smart Follow must take the microphone BEFORE it downloads the model.
 *
 * The model is a 40-50MB download on a hosted build. Loading it first puts tens of seconds
 * between the presenter's tap and `getUserMedia`, and Safari ties both the mic prompt and an
 * AudioContext's resume to the user gesture that asked for them — so the mic prompt never comes,
 * or it comes and the context stays suspended and nothing is ever heard.
 *
 * useVosk.test.ts pins the ordering against a mocked engine; this drives the real one in a real
 * browser, with Chromium's fake capture device standing in for a microphone.
 *
 * Needs `npm run dev` (override the port with PORT=…).
 */
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const b = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await b.newContext({ permissions: ['microphone'] })
const p = await ctx.newPage()

let modelRequestAt = null
p.on('request', (r) => {
  if (r.url().includes('/models/') && modelRequestAt === null) modelRequestAt = Date.now()
})
p.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)))

await p.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })

let r
try {
  r = await p.evaluate(async () => {
    const m = await import('/src/smartfollow/stt/voskEngine.ts')
    const eng = m.createVoskEngine()
    const marks = {}
    eng.onPartial(() => {})

    const s = performance.now()
    await eng.startMic()
    marks.micMs = performance.now() - s
    marks.micAt = Date.now()

    await eng.load(m.VOSK_MODELS['en-US'])
    marks.loadedMs = performance.now() - s

    try {
      eng.startRecognition()
      marks.threw = null
    } catch (e) {
      marks.threw = e.message
    }
    // Let the fake device push audio through the graph; a broken node wiring throws here.
    await new Promise((res) => setTimeout(res, 1500))
    eng.stop()
    return marks
  })
} catch (e) {
  // The pre-fix engine built its recognizer inside startMic and threw 'Vosk model not loaded'
  // here — i.e. the mic could not be taken until the download had finished. That is the bug.
  await b.close()
  console.log(`✗ could not open the mic before the model: ${String(e.message).split('\n')[0]}`)
  process.exit(1)
}

const micFirst = modelRequestAt !== null && r.micAt <= modelRequestAt
console.log(`mic acquired after     : ${Math.round(r.micMs)}ms`)
console.log(`model loaded after     : ${Math.round(r.loadedMs)}ms`)
console.log(`startRecognition threw : ${r.threw ?? 'no'}`)
console.log(`mic BEFORE model fetch : ${micFirst}`)
await b.close()

if (!micFirst || r.threw) {
  console.log('\n✗ Smart Follow would fail on a hosted build (Safari: no prompt, or a dead mic)')
  process.exit(1)
}
console.log('\n✓ mic is taken inside the gesture, model downloads after')
