import { chromium } from 'playwright'

// Renders the PROMPTER "P" monogram to PNG app icons via headless Chromium.
const icon = (size, { maskable = false, radius = 0.14 } = {}) => {
  const pad = maskable ? size * 0.14 : 0 // maskable safe area
  const inner = size - pad * 2
  const r = maskable ? 0 : size * radius
  const fontSize = inner * 0.62
  return `<!doctype html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px;overflow:hidden}
    .bg{width:${size}px;height:${size}px;background:#0a0a0a;display:flex;align-items:center;justify-content:center}
    .plate{width:${inner}px;height:${inner}px;background:#0a0a0a;border-radius:${r}px;
      display:flex;align-items:center;justify-content:center}
    .p{color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif;font-weight:700;
      font-size:${fontSize}px;line-height:1;letter-spacing:-0.02em}
  </style></head><body><div class="bg"><div class="plate"><span class="p">P</span></div></div></body></html>`
}

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-512-maskable.png', size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180 },
]

const browser = await chromium.launch()
for (const t of targets) {
  const page = await browser.newPage({
    viewport: { width: t.size, height: t.size },
    deviceScaleFactor: 1,
  })
  await page.setContent(icon(t.size, t.opts), { waitUntil: 'networkidle' })
  await page.screenshot({ path: `public/${t.file}`, clip: { x: 0, y: 0, width: t.size, height: t.size } })
  await page.close()
  console.log('wrote public/' + t.file)
}
await browser.close()
