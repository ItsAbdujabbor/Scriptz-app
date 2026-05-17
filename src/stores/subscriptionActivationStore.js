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

// Module-scoped AbortController for the in-flight `/api/billing/sync`
// fired from `start()`. The sync runs in a fire-and-forget IIFE; without
// an abort handle a `stop()`/`reset()` (logout, successful activation)
// can't cancel it, so a slow sync resolves AFTER teardown and races the
// store back into a stale shape. One controller at a time — a fresh
// `start()` aborts any previous sync before opening a new one.
let _syncAbortController = null

export const useSubscriptionActivationStore = create((set, get) => ({
  isPending: false,
  /** True once the burst has timed out without an active subscription
   * showing up. Cleared on the next `start()` (new checkout) or `stop()`
   * (eventually-successful activation). Drives the warning banner UI. */
  timeoutFired: false,
  startedAt: 0,
  _timeoutId: null,

  /** What's being activated: 'subscription' or 'pack'. Drives the
   * splash's copy ("Activating your subscription…" vs "Adding credits…")
   * and the success-detection strategy (subscription status flip vs
   * credits-balance increase past `packBaseline`). */
  kind: null,
  /** Metadata for a pack purchase: { name, credits }. Used in the
   * splash's "+200 credits added!" success ribbon. */
  pack: null,
  /** Snapshot of `credits.permanent_credits` at the moment the pack
   * burst started. The splash watches the live credits query and
   * declares success once the balance exceeds this baseline. */
  packBaseline: 0,

  start(opts = {}) {
    // Idempotency guard. `start()` has multiple call sites for a single
    // checkout: CheckoutScreen on Paddle's `checkout.completed`, and
    // ProPricingContent when it detects `?checkout=success` in the hash
    // on the post-redirect landing — both fire within the same burst
    // window. Without this guard the second call resets the 60s timeout,
    // so the burst window effectively never expires and the
    // PaymentProcessingBanner backstop is delayed indefinitely.
    //
    // Guard ONLY on `isPending` (a burst actively in flight), NOT on
    // `timeoutFired`: a previous burst that timed out is terminal, and a
    // genuine retry (user re-attempts checkout after the banner showed)
    // MUST be able to start a fresh burst. Those retry call sites don't
    // explicitly reset() first, so blocking on timeoutFired here would
    // wedge the retry. Starting a new burst below clears timeoutFired
    // anyway (see the final set()).
    if (get().isPending) return
    const state = get()

    const existing = state._timeoutId
    if (existing) clearTimeout(existing)

    // Cancel any sync still in flight from a previous burst before
    // opening a new one — at most one outstanding /sync at a time.
    _syncAbortController?.abort()
    _syncAbortController = new AbortController()
    const { signal } = _syncAbortController

    const isSubKind = (opts.kind || 'subscription') === 'subscription'

    // For subscription purchases: fire /api/billing/sync RIGHT NOW
    // (not just on timeout) — Paddle webhook delivery can take 1-5 s
    // and our background-task processing adds another ~200 ms;
    // meanwhile we're forcing the UI to wait for the next poll.
    // /sync skips the webhook entirely and pulls truth from Paddle's
    // API, so the second poll (~1 s later) sees the freshly-reconciled
    // state. If Paddle's API is also slow, the existing 60 s timeout
    // backstop still runs.
    //
    // For pack purchases /sync doesn't apply (it only reconciles
    // subscriptions, not one-time transactions). Pack activation is
    // detected by the splash watching the credits query for a
    // balance increase past `packBaseline`.
    if (isSubKind) {
      ;(async () => {
        try {
          const [{ syncSubscription }, { getAccessTokenOrNull }] = await Promise.all([
            import('../api/billing'),
            import('../lib/query/authToken'),
          ])
          if (signal.aborted) return
          const token = await getAccessTokenOrNull()
          if (token && !signal.aborted) await syncSubscription(token, { signal })
        } catch {
          /* aborted (stop/reset) or network — surfaced by the timeout
             banner if the activation never lands */
        }
      })()
    }

    const timeoutId = setTimeout(async () => {
      // Burst hit the wall without flipping active. Try a one-shot
      // `/sync` to reconcile directly from Paddle — closes the race
      // window when the webhook is delayed but the customer DID pay.
      // Set `timeoutFired=true` immediately so the warning banner
      // shows up; clear it only if sync rescues us. Dynamic imports
      // avoid a circular dep with the api/auth modules.
      set({ isPending: false, _timeoutId: null, timeoutFired: true })
      try {
        const [{ syncSubscription }, { getAccessTokenOrNull }] = await Promise.all([
          import('../api/billing'),
          import('../lib/query/authToken'),
        ])
        if (signal.aborted) return
        const token = await getAccessTokenOrNull()
        if (!token || signal.aborted) return
        const fresh = await syncSubscription(token, { signal })
        if (
          fresh &&
          (fresh.status === 'active' || fresh.status === 'trialing' || fresh.status === 'past_due')
        ) {
          // Sync rescued us — clear the banner state. The
          // ActivationListener's next poll will see the active state
          // and fire the celebration.
          set({ timeoutFired: false })
        }
      } catch {
        // Aborted (stop/reset), network error, or 502 — leave the banner
        // up so the user has recourse. They'll see the message + support
        // email link.
      }
    }, ACTIVATION_TIMEOUT_MS)
    set({
      isPending: true,
      startedAt: Date.now(),
      timeoutFired: false,
      _timeoutId: timeoutId,
      kind: opts.kind || 'subscription',
      pack: opts.pack || null,
      packBaseline: typeof opts.packBaseline === 'number' ? opts.packBaseline : 0,
    })
  },

  stop() {
    const existing = get()._timeoutId
    if (existing) clearTimeout(existing)
    // Cancel any in-flight /api/billing/sync from start()/timeout so it
    // can't resolve after teardown and race the store back into a stale
    // shape (e.g. re-setting timeoutFired after a successful activation).
    _syncAbortController?.abort()
    _syncAbortController = null
    // Note: kind/pack/packBaseline are intentionally kept so the splash
    // can still render the "+200 credits added!" / "You're on Starter!"
    // success ribbon after stop() fires. They're cleared on the next
    // start() (new purchase) or by reset() (after success display ends).
    set({
      isPending: false,
      startedAt: 0,
      timeoutFired: false,
      _timeoutId: null,
    })
  },

  reset() {
    const existing = get()._timeoutId
    if (existing) clearTimeout(existing)
    _syncAbortController?.abort()
    _syncAbortController = null
    set({
      isPending: false,
      startedAt: 0,
      timeoutFired: false,
      _timeoutId: null,
      kind: null,
      pack: null,
      packBaseline: 0,
    })
  },
}))
