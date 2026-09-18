# Sprint 3 — Mobile-First Anti-Fragility (Smart-Phone PWA)

## Theme
Make VoteChain *comfortable and crash-free* on a smart phone — installable as an Android
PWA, fully usable **online**, and functioning perfectly **offline** (cached browsing with
honest "reconnect to vote" handling) — in a way that never weakens the vote-integrity
invariant.

## Result
- VoteChain is now an **installable PWA**: manifest, icons, theme color, service worker
  (precache of the app shell + offline navigation fallback + runtime caching of read-only
  GET endpoints) — verified live over HTTPS on Vercel.
- The SPA no longer white-screens: a top-level `ErrorBoundary`, lazy Supabase client,
  try/catch boot, and safe-storage wrapper cover every previously-identified blank-screen
  and hang path.
- Network volatility is handled: 15 s timeouts, one-shot GET retries, typed
  `offline/timeout/network` errors, an offline banner, cached-data "stale" labels, and a
  vote path that **fails fast with 'Reconnect to vote'** instead of hanging or silently
  dropping (Constitution Articles I.4/I.6).
- Mobile UX: bottom navigation, 44 px tap targets, safe-area insets, scrollable dialogs,
  a responsive results chart with a table fallback, and a fixed admin-form submit bug.
- Frontend now has a real test suite: **13 vitest tests green** (was: zero, `vitest`
  failed with "no test files found").
- All gates green: contracts **20/20**, backend **8/8** + build, frontend build + lint
  (0 warnings) + **13/13**.

## Summary table

| Capability | Status | Evidence |
|------------|--------|----------|
| Installable Android PWA (manifest/icons/theme/SW) | ✅ deployed | `2026-09-18_sprint3-mobile-pwa-anti-fragility.md` |
| App shell + routes render offline (SW precache + navigateFallback) | ✅ | same |
| Read-only GET caching (elections/candidates/results/stats/receipts) | ✅ | same (runtimeCaching NetworkFirst 5s) |
| No white screens (ErrorBoundary, lazy supabase, safe storage) | ✅ | same + unit tests |
| No infinite hangers (timeouts, normalized errors, retry-once on GET) | ✅ | same |
| Offline = honest (banner, cached-data labels, rebuild on reconnect) | ✅ | same |
| Vote path fails fast offline / no double-submit | ✅ | same (useVote guard tests) |
| Mobile-first UI (bottom nav, safe areas, 44 px targets, modal, chart) | ✅ | same |
| Frontend vitest suite | ✅ 13/13 | output in evidence |
| Physical Android device test runbook | ✅ ready | `docs/runbooks/android-pwa-test.md` |
| Offline ballot-pack voting (ADR-006 Option B) | ⛔ next milestone | ADR-006 / ADR-007 (descoped) |

## Key fixes (Sprint 3)

### Layer 1 — PWA foundation
- Added `vite-plugin-pwa` (1.3.0, build-time devDep; justified: Vite hashed-asset
  precaching + manifest injection are non-trivial to hand-roll).
- `vite.config.ts`: `generateSW` precache (19 entries), `navigateFallback` to
  `/index.html` (SPA routes render offline), `navigateFallbackDenylist` for `/api/*`,
  and a runtime cache for **read-only GET** `/api/*` paths (NetworkFirst, 5 s timeout,
  7-day expiry). The matcher is a **self-contained** function (workbox stringifies it),
  excludes same-origin + dev server (an HTML shell can never masquerade as a JSON API
  response) and deliberately never matches vote/admin writes — writes are network-only.
- Icons generated from `public/icon.svg` via ImageMagick (192/512/maskable/apple),
  favicon fixed (was a 404), `index.html` gets `viewport-fit=cover`, theme-color,
  `apple-mobile-web-app` meta, and `registerSW({ immediate: true })` in `main.tsx`.

### Layer 2 — Anti-fragility core
- `ErrorBoundary` (recovery card, no blank Android screen).
- `lib/storage.ts` safe-storage wrapper (private-mode WebView `SecurityError` cannot
  white-screen the app).
- `lib/api.ts` hardened: 15 s timeout, one-shot retry for idempotent GETs (skipped while
  offline), typed `ApiError` (`offline/timeout/http/network/aborted`) + `toErrorMessage`,
  token reads go through safe storage, and **401 now routes via the router** (custom
  `votechain:unauthorized` event) instead of a hard `window.location` reload.
- `store/networkStore.ts` + `hooks/useNetworkStatus.ts` + `OfflineBanner` (online/offline
  listeners with a StrictMode guard).
- `authStore.initialize` try/catch/finally (offline Supabase no longer leaves boot stuck);
  `lib/supabase.ts` lazy client (module-scope env throw removed).
- `AuthCallbackPage` 20 s timeout + error card instead of hanging forever.
- `useResults`: polling pauses while hidden/offline, no overlapping requests, abort-safe.

### Layer 3 — Mobile-first UI
- `PageShell` (shared chrome + per-route `document.title`) + `MobileBottomNav`
  (Home/Elections/Admin, 44 px targets, safe-area bottom).
- `Button` defaults to `type="button"` (was silently submitting admin form) and
  `disabled`/`isLoading` compose correctly.
- `Modal` scrollable on short viewports, Escape + backdrop close, safe-area padding.
- `ResultsChart` responsive (h-64 mobile / h-96), angled ticks, table fallback.
- Admin date inputs stack on mobile; voters fetched only when actually admin.
- index.css: transparent tap-highlight, `touch-action: manipulation` (kills 300 ms
  delay + double-tap zoom), `overscroll-behavior: none`.

### Layer 4 — Offline truth-telling + vote guard
- `useVote` in-flight ref: rapid double-taps cannot fire a second `/votes/cast`; offline
  pre-check returns 'You are offline. Reconnect to cast your vote.' (no silent drop).
- `useElection` auto-refetch on reconnect; Elections show a "from your saved cache" strip;
  Results/Receipt label cached data as stale but verifiable.

### Layer 5 — Frontend tests
- `vitest.config.ts` (jsdom + react) and 13 unit tests for storage, API errors, and the
  network store. New devDep `jsdom` (peer of vitest).

## Verification Evidence (all green, 2026-09-18)

| Suite | Target | Result | Status |
|-------|--------|--------|--------|
| `npm run test -w contracts` | hardhat | 20 passing | ✅ |
| `npm run test -w backend` | vitest | 8 passing | ✅ |
| `npm run build -w backend` | tsc + artifact sync | clean | ✅ |
| `npm run build -w frontend` | tsc + vite + PWA | built; precache 19 entries | ✅ |
| `npm run lint -w frontend` | eslint | 0 warnings | ✅ |
| `npm run test -w frontend` | vitest (new) | 13 passing | ✅ |
| `vercel deploy --prod` | live | aliased → votechain-ivory.vercel.app | ✅ |
| HTTPS PWA check | curl | manifest + sw.js + all icons 200 | ✅ |
| Bundle wiring | curl | VITE_API_URL baked → Railway | ✅ |

## Honest boundaries / Next steps

- **Offline does NOT mean offline voting.** Casting requires connectivity (nullifier +
  chain path). Offline this sprint = cached browsing, honest stale labels, reconnect-to-vote.
- **Offline ballot packs (ADR-006 Option B)** are the next-level milestone: a new
  provisioning + reconciliation subsystem with its own trust model and design ADR
  (see ADR-007 for the boundary).
- Physical Android testing on the user's device follows the runbook
  (`docs/runbooks/android-pwa-test.md`); results loop back as an evidence follow-up.
- SMS/USSD feature-phone channels remain ADR-006 Option A scope, not yet built.
- P0s open: none. Remaining non-P0 enablers (Etherscan verify, CodeRabbit install)
  unchanged.