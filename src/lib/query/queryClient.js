import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { aiAwareShouldRetry, aiAwareRetryDelay } from '../aiErrors'
import { openCreditsModal } from '../creditsModalBus'

// Global paywall handling. Any query or mutation that comes back as a
// 402 with one of the recognised paywall codes routes the user to the
// right surface — WITHOUT a red "failed" toast:
//
//   NO_ACTIVE_SUBSCRIPTION → tried to use a premium-only feature
//                            (Persona / Styles / Edit / Score /
//                            One-click fix / Max model) → /pro
//   PLAN_UPGRADE_REQUIRED  → subscribed but on too low a tier for the
//                            requested feature (Starter → Creator+
//                            gate) → /pro
//   INSUFFICIENT_CREDITS   → ran out of credits on a credit-deductible
//                            feature (Generate / Recreate / Analyze /
//                            Titles) → open the credit-packs modal
//
// This is the SINGLE source of paywall routing. The previous global
// fetch monkey-patch (src/lib/paywallInterceptor.js) was deleted: it
// rewrote 402 → fake-200-null before React Query ever saw the response,
// which silently swallowed the error and made these handlers dead code
// (SEC-07). With the centralized apiFetch, a 402 now throws an ApiError
// carrying `.status === 402` and `.code`, which flows here.
const PRICING_CODES = new Set(['NO_ACTIVE_SUBSCRIPTION', 'PLAN_UPGRADE_REQUIRED'])

function maybeRedirectToPaywall(error) {
  if (!error) return
  if (error.status !== 402 && error.code !== 'PLAN_UPGRADE_REQUIRED') return
  // ApiError carries `.code` directly; keep the legacy body fallbacks
  // for any error object that didn't pass through apiFetch.
  const code = error.code || error.body?.error?.code || error.body?.detail?.code
  if (!code) return
  if (typeof window === 'undefined') return

  if (code === 'INSUFFICIENT_CREDITS') {
    // Out of credits — open the credit marketplace so they can top up.
    // `creditsModalBus` has zero imports (no circular risk) and is a
    // synchronous window-event dispatch, so the modal opens immediately
    // on the 402 instead of after a chunk-resolution microtask.
    openCreditsModal()
    return
  }

  if (PRICING_CODES.has(code)) {
    // Avoid a redirect loop if we're already on the pricing page.
    if ((window.location.hash || '').replace(/^#/, '').startsWith('pro')) return
    window.location.hash = 'pro'
  }
}

export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: maybeRedirectToPaywall }),
    mutationCache: new MutationCache({ onError: maybeRedirectToPaywall }),
    defaultOptions: {
      queries: {
        // Use the shared retry-policy: skips 4xx (except idempotency
        // 409), backs off with Retry-After honoring + exponential
        // fallback. Without this, a single Gemini rate-limit could
        // amplify into a tight retry loop across the whole app.
        retry: aiAwareShouldRetry,
        retryDelay: aiAwareRetryDelay,
        staleTime: 1000 * 60 * 3,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Mutations don't auto-retry by default — a duplicate mutation
        // can have side effects (charge credits, send a message). Routes
        // that opt in to retry can override per-mutation; the
        // Idempotency-Key header on generate routes covers safety there.
        retry: 0,
        networkMode: 'offlineFirst',
      },
    },
  })
}
