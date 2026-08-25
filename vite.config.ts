import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
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
