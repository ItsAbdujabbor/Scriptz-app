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
import { celebrate } from '../lib/celebrate'
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
    try {
      const token = await getValidAccessToken()
      const resp = await startCheckout(token, {
        priceId: pack.paddle_price_id,
        successUrl: window.location.origin + '/#credits?checkout=success',
        cancelUrl: window.location.origin + '/#credits?checkout=canceled',
      })
      await openPaddleCheckout({
        transactionId: resp?.transaction_id,
        checkoutUrl: resp?.checkout_url,
        clientToken: resp?.client_token,
      })
      // Optimistic credit-balance bump — the user just paid, the
      // webhook will land within ~2-5s and the actual fetch will
      // overwrite this anyway. Bumping the cache here means the
      // sidebar credits badge updates IMMEDIATELY on close instead
      // of waiting for the webhook + 30s poll. If the webhook diverges
      // (e.g. stuck pending), the next refetch reconciles to truth.
      const expectedCredits = Number(pack?.credits || 0)
      if (expectedCredits > 0) {
        queryClient.setQueryData(queryKeys.billing.credits, (current) => {
          if (!current || typeof current !== 'object') return current
          const permanent = Number(current.permanent_credits || 0) + expectedCredits
          const total = Number(current.subscription_credits || 0) + permanent
          return { ...current, permanent_credits: permanent, total }
        })
      }
      // Then full fan-out invalidate so the actual fetch hits the
      // server within ~150ms — overwrites the optimistic bump with
      // the true post-webhook balance.
      refreshBillingState(queryClient)
      // Close + celebrate. The webhook lands within seconds; the
      // optimistic bump above means the sidebar badge already shows
      // the new total when the celebration toast appears.
      onClose?.()
      celebrate({
        emoji: '⚡',
        title: `+${fmtCredits(pack.credits)} credits!`,
        subtitle: 'Permanent credits added. These never expire.',
        variant: 'celebrate',
      })
    } catch (e) {
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
