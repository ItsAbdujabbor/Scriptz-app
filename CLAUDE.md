# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo identity

`Scriptz-app` is the **end-user React 19 + Vite SPA** for Scriptz — a credit-billed AI tool for YouTube creators (script ideas, AI coach, video optimization, thumbnail generation, A/B testing, billing). Two sibling repos make up the full product:

- `../Scriptz-Api` — FastAPI backend (`/api/**`)
- `../Scriptz-Admin` — separate admin React app (`/api/admin/**`)

This repo only consumes `/api/**` (not `/api/admin/**`). The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so the API must be running locally.

## Common commands

```bash
npm run dev              # http://localhost:5173, proxies /api → 127.0.0.1:8000
npm run build            # vite build → dist/
npm run preview          # serve built dist/
npm run lint             # eslint
npm run lint:fix         # eslint --fix
npm run format           # prettier --write
npm run test             # vitest watch
npm run test:run         # vitest run (CI)
npm run verify           # lint + test:run (run before pushing)
```

Husky + `lint-staged` runs Prettier and ESLint on staged `*.{js,jsx,css,json,md}` automatically. Don't bypass with `--no-verify`.

Single-test run (vitest): `npx vitest run path/to/file.test.js -t "test name"`.

Path alias `@/*` resolves to `src/*` (see [jsconfig.json](jsconfig.json) and [vite.config.js](vite.config.js)).

## Required environment

Copy `.env.example` to `.env`. Three things actually matter for development:

| Var                                            | Why                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                            | Leave **blank** in dev → uses Vite proxy → no CORS. Set to `https://api.scriptz.app` for prod builds.                      |
| `VITE_USE_LOCAL_API_AUTH`                      | Default `true` in dev (`import.meta.env.DEV`). Auth via FastAPI `/api/auth/*`. Set `false` to use Supabase browser client. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Only needed when `VITE_USE_LOCAL_API_AUTH=false`.                                                                          |

Paddle (`VITE_PADDLE_*`) and Brevo (`VITE_BREVO_*`) are optional unless touching billing or the landing-page waitlist.

## Architecture — the load-bearing decisions

### Auth has two modes that must keep working

[src/lib/authMode.js](src/lib/authMode.js) decides at runtime between **local API auth** (FastAPI JWT, refresh tokens in `localStorage` under `scriptz_api_auth`) and **Supabase browser auth** (PKCE flow, `@supabase/supabase-js` manages session). Both paths flow through `useAuthStore` ([src/stores/authStore.js](src/stores/authStore.js)) — every method has an `if (isLocalApiAuthMode())` branch and a Supabase branch. Don't add new auth code without handling both. The token mint/refresh logic also lives here (`getValidAccessToken`, `_startApiRefreshTimer`, `_startProactiveRefresh`).

When the user changes (different `id` from last session), [src/lib/sessionReset.js](src/lib/sessionReset.js) wipes React Query caches via `resetClientCachesForUserChange()`. That's why `setAppQueryClient(queryClient)` is called once in [src/main.jsx](src/main.jsx).

### Routing is a hash router by hand, not React Router

[src/App.jsx](src/App.jsx) reads `window.location.hash` and switches a `view` enum (`landing` / `login` / `signup` / `dashboard` / `coach` / `optimize` / `pro` / `ab-testing` / `billing` / `banned` / `terms` / `privacy`). All authenticated views render through [src/AuthenticatedRoutes.jsx](src/AuthenticatedRoutes.jsx) which mounts **a single shared shell** (Sidebar + SettingsModal + main outlet). Switching between dashboard/coach/optimize keeps the same DOM root — the comment in `AuthenticatedRoutes.jsx` explains why (avoids history refetches, sidebar scroll resets, modal state loss). Adding a new authenticated screen means: add a `view` string in `App.jsx`, add a case in `AuthenticatedRoutes.jsx`, and a sidebar entry.

Banned users see only `BannedScreen` ([src/auth/BannedScreen.jsx](src/auth/BannedScreen.jsx)) — multiple effects in `App.jsx` redirect them to `#banned` regardless of where they navigate.

### Two global fetch interceptors that change observable behavior

1. **Paywall interceptor** ([src/lib/paywallInterceptor.js](src/lib/paywallInterceptor.js)) — installed in `main.jsx` _before_ React Query is created. Wraps `window.fetch`; if any response is `402` with `error.code === "NO_ACTIVE_SUBSCRIPTION"`, it navigates to `#pro` and returns a fake 200 `null` so callers don't render an error. New AI calls don't need their own paywall handling.
2. **Query/mutation cache `onError`** ([src/lib/query/queryClient.js](src/lib/query/queryClient.js)) — the same paywall redirect, in case the interceptor misses (defense in depth). Also sets `retry` to skip `401/402/403/404`, default `staleTime: 3min`, `gcTime: 30min`, and disables `refetchOnWindowFocus`.

### React Query keys live in one file

All query keys are centralized in [src/lib/query/queryKeys.js](src/lib/query/queryKeys.js) under `queryKeys.{user,youtube,dashboard,coach,personas,styles,thumbnails,scripts,billing,modelTier,abTests,thumbnailTemplates}`. Hooks in `src/queries/<domain>/` import these. New API surfaces should add a key namespace here, never inline an array in a `useQuery`.

`invalidateCredits(queryClient)` from [src/queries/billing/creditsQueries.js](src/queries/billing/creditsQueries.js) is called in `onSuccess`/`onError` of every AI mutation so the sidebar credit badge refreshes after a debit.

### API modules are flat per-domain

[src/api/](src/api/) has one file per backend domain (`auth.js`, `coach.js`, `dashboard.js`, `thumbnails.js`, etc.). Each exports a `*Api` object of plain functions that accept `(token, ...args)` and call `getApiBaseUrl() + path` from [src/lib/env.js](src/lib/env.js). Token is fetched via `getAccessTokenOrNull()` from `src/lib/query/authToken.js` inside the React Query hooks — never call API modules directly from components.

### Multi-channel YouTube context

Users can connect multiple YouTube channels. The active channel is tracked in `src/queries/youtube/` and the active channel ID is sent to the backend via the `X-Channel-Id` header (the API resolves it through `app/core/channel_context.py`). When invalidating queries after a channel switch, broad invalidation is safer than per-channel keys.

### Onboarding milestones, celebrations, and dashboard command center

`src/stores/onboardingStore.js`, [src/lib/celebrate.js](src/lib/celebrate.js), [src/lib/channelMilestones.js](src/lib/channelMilestones.js), and [src/lib/dashboardCommandCenter.js](src/lib/dashboardCommandCenter.js) coordinate first-run UX. The Dashboard reads onboarding state to show or hide guided panels. `src/lib/shellEvents.js` is a tiny pub/sub the Sidebar uses to ask the active screen to start a "new chat" without prop drilling — search for `emitShellEvent('newChat')`.

## Big-picture: where features live

| Feature                                                      | Entry component                                                                                                                                     | Sidebar route             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Dashboard insights, channel audit, growth, best time to post | [src/app/Dashboard.jsx](src/app/Dashboard.jsx)                                                                                                      | `#dashboard`              |
| AI Coach (chat, conversations, deep think)                   | [src/app/CoachChat.jsx](src/app/CoachChat.jsx) + `src/app/coach/CoachChatVirtuosoShell.jsx`                                                         | `#coach`                  |
| Video Optimize (titles/desc/tags + per-video thumbnails)     | [src/app/Optimize.jsx](src/app/Optimize.jsx) + [src/app/VideoOptimizeModal.jsx](src/app/VideoOptimizeModal.jsx)                                     | `#optimize`               |
| Thumbnail Generator (chat, edit dialog, raters)              | [src/app/ThumbnailGenerator.jsx](src/app/ThumbnailGenerator.jsx) + [src/components/EditThumbnailDialog.jsx](src/components/EditThumbnailDialog.jsx) | inside dashboard/optimize |
| A/B Testing                                                  | [src/app/ABTesting.jsx](src/app/ABTesting.jsx) + [src/components/ABTestPanel.jsx](src/components/ABTestPanel.jsx)                                   | `#ab-testing`             |
| Pricing / paywall                                            | [src/app/Pro.jsx](src/app/Pro.jsx) + `ProPricingContent.jsx`                                                                                        | `#pro`                    |
| Billing settings (subscription, credit packs, ledger)        | [src/app/Billing.jsx](src/app/Billing.jsx) + `src/components/BillingSettingsPanel.jsx` + `CreditPacksModal.jsx`                                     | `#billing`                |
| Personas / Styles modals                                     | [src/app/PersonasModal.jsx](src/app/PersonasModal.jsx) / [src/app/StylesModal.jsx](src/app/StylesModal.jsx)                                         | sidebar buttons           |
| Settings (account, model tier, theme, delete)                | [src/app/SharedSettingsModal.jsx](src/app/SharedSettingsModal.jsx) + `SettingsModal.jsx`                                                            | sidebar                   |
| Landing page (waitlist, pricing, FAQ, demo)                  | [src/landing/LandingPage.jsx](src/landing/LandingPage.jsx) + `src/landing/sections/*`                                                               | `#`                       |

`src/next-update-ideas/` holds the old Script Generator + Templates code that was intentionally cut from Sidebar/AuthenticatedRoutes (see commits `bb53460`, `9f74ac2`). Don't re-import unless restoring that feature.

## Editor & build conventions

- **Prettier**: no semicolons, single quotes, trailing commas `es5`, `printWidth: 100`, `arrowParens: always` ([.prettierrc](.prettierrc)).
- **ESLint** ([eslint.config.js](eslint.config.js)): `eqeqeq: 'smart'`, `no-var`, `prefer-const`, `no-console` (warn — `warn`/`error` allowed). `no-unused-vars` ignores names matching `^[A-Z_]` (so `_unused` and `Constant` are fine).
- **Vendor chunking** ([vite.config.js](vite.config.js)): React, React Query, Supabase, and Zustand are split into named chunks. Don't add per-route lazy splits without checking bundle output — many routes are already lazy via `lazy()` in `App.jsx`/`AuthenticatedRoutes.jsx`.
- **CSS** is hand-written, scoped via component-prefixed class names. Theme tokens live in [src/ios-theme.css](src/ios-theme.css); base layout in [src/index.css](src/index.css). The light/dark theme is toggled by a `theme-light` class on `<body>` (key: `scriptz_theme` in localStorage).

## Working with billing-gated features

Any AI feature that consumes credits flows through:

1. The frontend hits a backend route protected by `Depends(charge_credits("feature_key"))`.
2. Backend checks active subscription and deducts credits atomically. On no-sub → 402 `NO_ACTIVE_SUBSCRIPTION` (paywall interceptor fires); on no-credits → 402 `INSUFFICIENT_CREDITS` (handle in component — open `CreditPacksModal` via [src/lib/creditsModalBus.js](src/lib/creditsModalBus.js)).
3. On success, the mutation's `onSuccess`/`onError` calls `invalidateCredits(queryClient)`.

Feature keys and per-tier costs are defined backend-side in `Scriptz-Api/app/services/billing_config_service.py`. Read the live values via `useFeatureCostsQuery()` — never hardcode credit costs in the UI.

## Reference docs in this repo

- [cost-analysis.md](cost-analysis.md) — OpenAI thumbnail unit-economics math (per plan, per quality, per utilisation).
- [docs/AB_TESTING_SYSTEM.md](docs/AB_TESTING_SYSTEM.md) — sequential-windowed A/B test design and honesty rules.
- [docs/BILLING_SYSTEM.md](docs/BILLING_SYSTEM.md) — credit ledger, Paddle webhook flow, subscription/pack model.
- [docs/AWS-REFERENCE.md](docs/AWS-REFERENCE.md) — S3/CloudFront for the deployed frontend (account `509399611678`, region `us-east-1`).

## Testing the UI

There are very few unit tests checked in. Verifying a change usually means:

1. Make sure `Scriptz-Api` is running on `:8000` (its `./run.sh` or `uvicorn main:app --reload`).
2. `npm run dev` and exercise the flow in a browser.
3. Type-check / test suites cannot prove a UI feature works — say so explicitly when you can't browser-test.
