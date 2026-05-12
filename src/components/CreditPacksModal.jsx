/**
 * CreditPacksModal — dumb presentational dialog controlled by `open` prop.
 *
 * Pattern mirrors the working milestones dialog in Dashboard.jsx:
 *   • Parent owns `open` state
 *   • When `open` is true, this component renders via `createPortal` to
 *     document.body (backdrop covers everything)
 *   • Backdrop click closes, card click stops propagation
 *   • Esc closes
 *
 * Structure:
 *   <Dialog>
 *     <header />          ← sticky top
 *     <div scroll />      ← grows + scrolls (this is the mobile fix)
 *     <footer />          ← sticky bottom
 *   </Dialog>
 *
 * Splitting into three siblings lets the Dialog panel's `overflow: hidden`
 * clip the inner scroll body without hiding the chrome.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Dialog } from './ui'
import { useAuthStore } from '../stores/authStore'
import { useCreditsQuery, refreshBillingState } from '../queries/billing/creditsQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { getPlans, startCheckout } from '../api/billing'
import { openPaddleCheckout } from '../lib/paddle'
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import './CreditPacksModal.css'

const fmtCredits = (n) => {
  if (n == null) return '—'
  if (n >= 1000) {
    const k = n / 1000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }
  return Number(n).toLocaleString('en-US')
}
const fmtPrice = (usd) => {
  const n = Number(usd)
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—'
}
const costPerCredit = (credits, price) => {
  if (!credits || !price) return null
  const cents = (Number(price) * 100) / Number(credits)
  return cents < 1 ? `${cents.toFixed(2)}¢ / credit` : `${cents.toFixed(1)}¢ / credit`
}

/** Decorate each pack with `isBestValue` (lowest per-credit rate) and
 *  `savingsPct` (how much cheaper than the worst rate, i.e. the
 *  smallest pack). Savings are only meaningful relative to a baseline,
 *  so the smallest pack always reports `savingsPct: 0`. */
const decoratePacks = (packs) => {
  if (!packs?.length) return []
  const rate = (p) => Number(p.price_usd) / Number(p.credits)
  let best = null
  let bestRate = Infinity
  let worstRate = 0
  for (const p of packs) {
    const r = rate(p)
    if (r < bestRate) {
      bestRate = r
      best = p.slug
    }
    if (r > worstRate) worstRate = r
  }
  return packs.map((p) => {
    const r = rate(p)
    const savingsPct = worstRate > 0 ? Math.round((1 - r / worstRate) * 100) : 0
    return { ...p, isBestValue: p.slug === best, savingsPct }
  })
}

export function CreditPacksModal({ open, onClose }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const getValidAccessToken = useAuthStore((s) => s.getValidAccessToken)
  const [catalog, setCatalog] = useState(null)
  const [loadingPack, setLoadingPack] = useState(null)
  const [error, setError] = useState(null)
  const { data: credits } = useCreditsQuery({ refetchInterval: open ? 5000 : false })

  // Fetch catalog when opened.
  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    getPlans()
      .then((d) => {
        if (alive) setCatalog(d)
      })
      .catch(() => {
        if (alive) setCatalog(null)
      })
    return () => {
      alive = false
    }
  }, [open])

  const packs = useMemo(() => decoratePacks(catalog?.packs || []), [catalog])

  if (!open) return null

  const total = credits
    ? Number(credits.subscription_credits || 0) + Number(credits.permanent_credits || 0)
    : null

  const buy = async (pack) => {
    if (!user) {
      window.location.hash = 'register'
      return
    }
    if (!pack.paddle_price_id || pack.paddle_price_id.startsWith('pri_placeholder_')) {
      setError('Credit pack checkout is not fully configured yet. Please contact support.')
      return
    }
    setError(null)
    setLoadingPack(pack.slug)
    // Snapshot the user's current permanent_credits BEFORE opening
    // checkout — the splash will compare against this baseline to
    // detect "the webhook landed and balance increased".
    const baselinePermanent = Number(
      queryClient.getQueryData(queryKeys.billing.credits)?.permanent_credits || 0
    )
    const expectedCredits = Number(pack?.credits || 0)

    // Local flag so the listener only fires once even if Paddle
    // dispatches `checkout.completed` multiple times (it can fire
    // again on retries / page transitions).
    let alreadyHandled = false
    let disposeHandle = null

    const onPaddleEvent = (ev) => {
      const name = ev?.name || ev?.event_name
      if (!name) return
      // eslint-disable-next-line no-console
      console.info('[CreditPacksModal:paddle-event]', name)
      if (alreadyHandled) return
      if (name === 'checkout.completed') {
        alreadyHandled = true
        useSubscriptionActivationStore.getState().start({
          kind: 'pack',
          pack: { name: pack.name, credits: expectedCredits },
          packBaseline: baselinePermanent,
        })
        // Optimistic bump — gives the badge an instant tick. The
        // splash's success detection compares the SERVER credits
        // against `packBaseline`, which we captured BEFORE mutating
        // the cache, so the comparison still sees a true server-side
        // increase once the webhook lands.
        if (expectedCredits > 0) {
          queryClient.setQueryData(queryKeys.billing.credits, (current) => {
            if (!current || typeof current !== 'object') return current
            const permanent = Number(current.permanent_credits || 0) + expectedCredits
            const total = Number(current.subscription_credits || 0) + permanent
            return { ...current, permanent_credits: permanent, total }
          })
        }
        refreshBillingState(queryClient)
        onClose?.()
        // Listener can be cleaned up — we got what we needed.
        disposeHandle?.dispose?.()
      } else if (name === 'checkout.closed') {
        // User dismissed the overlay without paying. Clean up the
        // listener so a future purchase doesn't double-fire.
        disposeHandle?.dispose?.()
      }
    }

    try {
      const token = await getValidAccessToken()
      const resp = await startCheckout(token, {
        priceId: pack.paddle_price_id,
        successUrl: window.location.origin + '/#credits?checkout=success',
        cancelUrl: window.location.origin + '/#credits?checkout=canceled',
      })
      // Pass onEvent through openPaddleCheckout so the listener gets
      // registered inside paddle.js's own module instance (avoids
      // cross-chunk subscriber-set drift — see paddle.js comment).
      disposeHandle = await openPaddleCheckout({
        transactionId: resp?.transaction_id,
        checkoutUrl: resp?.checkout_url,
        clientToken: resp?.client_token,
        onEvent: onPaddleEvent,
      })
    } catch (e) {
      disposeHandle?.dispose?.()
      setError(e?.message || 'Checkout could not start. Try again.')
    } finally {
      setLoadingPack(null)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      ariaLabelledBy="credits-modal-title"
      className="credits-modal-card"
    >
      <header className="credits-modal-head">
        <div className="credits-modal-head-text">
          <h2 id="credits-modal-title" className="credits-modal-title">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="credits-modal-title-icon"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Credits marketplace
          </h2>
          <p className="credits-modal-sub">
            One-time top-up — permanent credits never expire.
            {total != null && (
              <>
                {' '}
                · Current balance: <strong>{fmtCredits(total)}</strong>
              </>
            )}
          </p>
        </div>
        <button type="button" className="credits-modal-close" onClick={onClose} aria-label="Close">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="credits-modal-scroll">
        {error && (
          <div className="credits-modal-error" role="alert">
            {error}
          </div>
        )}

        {!catalog ? (
          <div className="credits-modal-loading">
            <span className="credits-modal-spinner" aria-hidden />
            <span>Loading packs…</span>
          </div>
        ) : packs.length === 0 ? (
          <div className="credits-modal-empty">No credit packs are available right now.</div>
        ) : (
          <ul className="credits-modal-grid">
            {packs.map((p) => (
              <li
                key={p.slug}
                className={`credits-pack-card ${p.isBestValue ? 'credits-pack-card--best' : ''}`}
              >
                {p.isBestValue && <span className="credits-pack-badge">Best value</span>}

                <div className="credits-pack-credits">
                  <span className="credits-pack-credits-num">{fmtCredits(p.credits)}</span>
                  <span className="credits-pack-credits-label">credits</span>
                </div>

                <div className="credits-pack-price">{fmtPrice(p.price_usd)}</div>

                <div className="credits-pack-rate">
                  {costPerCredit(p.credits, p.price_usd)}
                  {p.savingsPct >= 15 && (
                    <span className="credits-pack-savings" aria-label={`Save ${p.savingsPct}%`}>
                      Save {p.savingsPct}%
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={`credits-pack-cta ${p.isBestValue ? 'credits-pack-cta--primary' : ''}`}
                  onClick={() => buy(p)}
                  disabled={loadingPack === p.slug}
                >
                  {loadingPack === p.slug ? 'Opening…' : `Buy ${fmtCredits(p.credits)}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="credits-modal-foot">
        <span className="credits-modal-foot-note">
          Payments processed by Paddle. Credits are added instantly once the payment is confirmed.
        </span>
        <button
          type="button"
          className="credits-modal-link"
          onClick={() => {
            onClose?.()
            window.location.hash = 'pro'
          }}
        >
          Or upgrade your plan →
        </button>
      </footer>
    </Dialog>
  )
}
