import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/*
 * BUILD IDENTITY — what the colophon in the Editor header reads from.
 *
 * This app auto-updates (`registerType: 'autoUpdate'` below) with no refresh prompt anywhere in
 * `src/`, and it is verified on an iPad and a budget Android tablet where devtools cannot be
 * attached. "Is this tablet running the build I just shipped?" is otherwise unanswerable except by
 * hunting for a visual change you happen to remember making.
 *
 * The version is read from package.json and bumped BY HAND in the feature PR. Nothing can detect
 * "a new feature was added": a commit count or SHA increments on typo fixes too, and auto-semver
 * would mean adopting Conventional Commits, which this repo deliberately does not use. One feature
 * per PR is what makes the manual bump honest — the bump IS the feature signal.
 *
 * Read through `define` rather than `import`ed: importing package.json would put the whole file in
 * the bundle. The SHA prefers Vercel's env var because `vercel-build` runs from a CLEAN, SHALLOW
 * clone where git commands are not guaranteed to answer.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const commitSha = () => {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Also picked up by vitest (this file is the test config too), so the globals resolve under
  // jsdom and AppVersion cannot crash there.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitSha()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PROMPTLY',
        short_name: 'PROMPTLY',
        description: 'A minimalist teleprompter that follows the presenter.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The speech engine is 5.8MB — far past workbox's 2MB precache limit, and pointless to
        // force on someone who may never turn Smart Follow on. Kept out of the precache so the
        // app shell installs small and fast, and cached on first use instead (below), so Smart
        // Follow still works offline once it has run.
        globIgnores: ['**/vosk-engine-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/vosk-engine-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vosk-engine',
              // Content-hashed filenames, so keep the current build's and one predecessor.
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Pin the lazy speech-engine chunk to a predictable name. The workbox rules above match
        // it by filename, so letting Rollup derive the name from the module would make the PWA
        // caching config silently wrong the day that derivation changes.
        manualChunks: (id) => (id.includes('vosk-browser') ? 'vosk-engine' : undefined),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
