import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'VoteChain — Transparent. Tamper-proof. Trustless.',
        short_name: 'VoteChain',
        description:
          'Blockchain-backed voting built for the phone in your pocket. No wallet, no gas — OTP access, on-chain proof.',
        theme_color: '#3B82F6',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['government', 'productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // urlPattern must be a self-contained function: workbox-build stringifies it
            // into the generated service worker, so it cannot close over module state.
            urlPattern: isApiReadOnlyRequest,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'votechain-api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})

/**
 * True only for read-only API endpoints. Vote write actions (POST /api/votes/cast,
 * admin routes) are intentionally never cached so no voter action can be served stale.
 * The SPA's own origin and the Vite dev origin are excluded so an HTML shell can never
 * be cached as an API response.
 */
function isApiReadOnlyRequest({ url }: { url: URL }): boolean {
  const { origin, pathname } = url
  const isDevServer = origin === 'http://localhost:5173'
  const isSelf = typeof self !== 'undefined' && origin === self.location.origin
  if (isDevServer || isSelf) return false
  if (!pathname.startsWith('/api/')) return false
  return (
    pathname === '/api/stats' ||
    pathname === '/api/elections' ||
    /^\/api\/elections\/[^/]+$/.test(pathname) ||
    /^\/api\/elections\/[^/]+\/candidates$/.test(pathname) ||
    /^\/api\/elections\/[^/]+\/results$/.test(pathname) ||
    /^\/api\/votes\/receipt\/[^/]+$/.test(pathname)
  )
}