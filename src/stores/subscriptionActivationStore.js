import { create } from 'zustand'

/**
 * Tracks "we're expecting the subscription to flip active any moment now."
 *
 * Set by `app:checkout-completed` (Paddle) or any code that knows an
 * activation just happened upstream. While `isPending` is true,
 * `useSubscriptionQuery` polls aggressively (every 2 s) instead of the
 * 15 s baseline, so the user sees Pro the moment the webhook lands.
 *
 * Three terminal states:
 *   1. Successful activation — `<ActivationListener>` calls `stop()` once
 *      it observes the inactive→active transition. Burst ends, celebration
 *      fires.
 *   2. Webhook never arrives — after `ACTIVATION_TIMEOUT_MS` (60 s) the
 *      timeout callback fires `/api/billing/sync` to reconcile state
 *      directly from Paddle. If sync flips status to active, the
 *      `<ActivationListener>` will pick it up via the next poll. If sync
 *      ALSO returns inactive (Paddle outage, customer-level error), the
 *      `timeoutFired` flag is set and `<PaymentProcessingBanner>` renders.
 *   3. Manual stop — `stop()` called explicitly (e.g. on logout).
 *
 * `timeoutFired` is exposed so the banner component can render based
 * on it without needing a separate store.
 */

const ACTIVATION_TIMEOUT_MS = 60_000

export const useSubscriptionActivationStore = create((set, get) => ({
  isPending: false,
  /** True once the burst has timed out without an active subscription
   * showing up. Cleared on the next `start()` (new checkout) or `stop()`
   * (eventually-successful activation). Drives the warning banner UI. */
  timeoutFired: false,
  startedAt: 0,
  _timeoutId: null,

  start() {
    const existing = get()._timeoutId
    if (existing) clearTimeout(existing)

    // Fire /api/billing/sync RIGHT NOW (not just on timeout) — Paddle
    // webhook delivery can take 1-5 s and our background-task processing
    // adds another ~200 ms; meanwhile we're forcing the UI to wait for
    // the next poll. /sync skips the webhook entirely and pulls truth
    // from Paddle's API, so the second poll (~1 s later) sees the
    // freshly-reconciled state. If Paddle's API is also slow, the
    // existing 60 s timeout backstop still runs.
    ;(async () => {
      try {
        const [{ syncSubscription }, { getAccessTokenOrNull }] =
          await Promise.all([
            import('../api/billing'),
            import('../lib/query/authToken'),
          ])
        const token = await getAccessTokenOrNull()
        if (token) await syncSubscription(token)
      } catch {
        /* surfaced by the timeout banner if it never lands */
      }
    })()

    const timeoutId = setTimeout(async () => {
      // Burst hit the wall without flipping active. Try a one-shot
      // `/sync` to reconcile directly from Paddle — closes the race
      // window when the webhook is delayed but the customer DID pay.
      // Set `timeoutFired=true` immediately so the warning banner
      // shows up; clear it only if sync rescues us. Dynamic imports
      // avoid a circular dep with the api/auth modules.
      set({ isPending: false, _timeoutId: null, timeoutFired: true })
      try {
        const [{ syncSubscription }, { getAccessTokenOrNull }] =
          await Promise.all([
            import('../api/billing'),
            import('../lib/query/authToken'),
          ])
        const token = await getAccessTokenOrNull()
        if (!token) return
        const fresh = await syncSubscription(token)
        if (
          fresh &&
          (fresh.status === 'active' ||
            fresh.status === 'trialing' ||
            fresh.status === 'past_due')
        ) {
          // Sync rescued us — clear the banner state. The
          // ActivationListener's next poll will see the active state
          // and fire the celebration.
          set({ timeoutFired: false })
        }
      } catch {
        // Network error / 502 — leave the banner up so the user has
        // recourse. They'll see the message + support email link.
      }
    }, ACTIVATION_TIMEOUT_MS)
    set({
      isPending: true,
      startedAt: Date.now(),
      timeoutFired: false,
      _timeoutId: timeoutId,
    })
  },

  stop() {
    const existing = get()._timeoutId
    if (existing) clearTimeout(existing)
    set({
      isPending: false,
      startedAt: 0,
      timeoutFired: false,
      _timeoutId: null,
    })
  },
}))
