# Evidence — 2026-09-18 Sprint 3: Mobile-First Anti-Fragility (Smart-Phone PWA)

Date: 2026-09-18
Sprint: `docs/sprints/sprint-3-mobile-anti-fragility.md`
Commits (all SSH-signed): `66e2b3e` (PWA foundation), `ae2a506` (anti-fragility core),
`a5713cf` (mobile UI shell), `923d01a` (offline truth-telling + vote guard),
`d5918e7` (vitest suite).

## 1. Gates — full matrix (all green)

### Frontend tests (new vitest suite, was "no test files found")

```
$ npx vitest run        # packages/frontend
 Test Files  3 passed (3)
      Tests  13 passed (13)
```

- `src/lib/storage.test.ts` — 5 tests (safeStorage null/read/write/remove + the
  private-mode WebView simulation that asserts *no throw* when `localStorage` get/set/
  remove throw, via `Storage.prototype` spies).
- `src/lib/api.test.ts` — 6 tests (ApiError classification offline/timeout/http/network,
  server-message precedence, fallback for unknown throws, isApiError guard).
- `src/store/networkStore.test.ts` — 2 tests (starts online; `init()` registers
  window `online`/`offline` listeners exactly once — StrictMode double-effect guard).

### Contract suite

```
$ npm run test -w contracts
  20 passing (4s)
```

### Backend suite + build

```
$ npm run test -w backend
      Tests  8 passed (8)

$ npm run build -w backend
  # tsc emitted dist/ (no type errors); [sync-artifact] copied VoteChain.json
```

### Frontend build + lint

```
$ npm run build -w frontend
✓ built in 2.63s        # tsc && vite build; workbox precache 19 entries

$ npm run lint -w frontend
# eslint . --ext ts,tsx --max-warnings 0  → 0 warnings
```

## 2. Production deploy (Vercel)

```
$ vercel deploy --prod         # from repo root (verified CLI auth hellodmuhoro-1770)
✓ Production  https://votechain-16k6m2xde-dmuhor01.vercel.app
✓ Aliased     https://votechain-ivory.vercel.app   (Ready in 32s)
```

Added env var `VITE_SEPOLIA_EXPLORER=https://sepolia.etherscan.io` (production). The
other three `VITE_*` vars (API_URL, SUPABASE_URL, SUPABASE_ANON_KEY) were already set.

## 3. HTTPS PWA verification (live origin)

```
$ curl -s https://votechain-ivory.vercel.app/ | grep -oE "manifest|theme-color|apple-mobile-web-app|viewport"
apple-mobile-web-app   icon   manifest   theme-color   viewport

$ curl -s https://votechain-ivory.vercel.app/manifest.webmanifest | head -c 300
{"name":"VoteChain — Transparent. Tamper-proof. Trustless.","short_name":"VoteChain",
 "start_url":"/","display":"standalone","background_color":"#111827","theme_color":"#3B…

$ curl -s https://votechain-ivory.vercel.app/sw.js | head -c 200     # workbox precache preamble ✓
```

Icons (all previously-fixed set, all 200):

```
icon-192.png: 200 image/png          icon-512.png: 200 image/png
maskable-512.png: 200 image/png      apple-touch-icon.png: 200 image/png
icon.svg: 200 image/svg+xml          favicon.ico: 200 image/vnd.microsoft.icon
```

Bundle wiring (VITE_API_URL baked into the hashed asset):

```
$ curl -s https://votechain-ivory.vercel.app/assets/index-CgK-CLl2.js | grep -oE 'https://backend[^"'"'"' ]*' | head -1
https://backend-production-64d05.up.railway.app
```

Backend still live (read model reachable from PWA code path):

```
$ curl -s https://backend-production-64d05.up.railway.app/api/stats
{"activeElections":1,"totalVotes":1,"registeredVoters":1}
```

## 4. What this evidence proves / does not prove

Proves: the built PWA assets (manifest, SW with 19-entry precache, navigateFallback,
runtime caching config) are served on the live HTTPS origin; the bundle is wired to the
live backend; every gate is green; install assets are present.

Does not prove on a real device: install prompt behavior, offline browse + SW fetch from
the *installed* app, offline-to-online recovery UX. Those require the physical Android
test in `docs/runbooks/android-pwa-test.md`; results will be appended as a follow-up
evidence file.