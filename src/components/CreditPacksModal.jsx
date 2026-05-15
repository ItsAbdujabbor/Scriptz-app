/**
 * CreditPacksModal — redesigned credit marketplace.
 *
 * Three-zone layout (header / scroll body / footer) so the inner pack
 * grid scrolls cleanly on phones while the title and footer stay locked.
 * Best-value pack gets the LiquidMetalButton (same as hero Generate CTA).
 */
import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { Dialog } from './ui'
import { LiquidMetalButton } from './LiquidMetalButton'
import { useAuthStore } from '../stores/authStore'
import { useCreditsQuery } from '../queries/billing/creditsQueries'
import { getPlans, startCheckout } from '../api/billing'
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
  if (!Number.isFinite(n)) return '—'
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}

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

/* ── Icons ────────────────────────────────────────────────────────── */

function CreditCoin({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
      <path d="M13.2 8l-4.4 5h3.2l-1 5L16 13h-3.2L13.2 8z" fill="currentColor" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

export function CreditPacksModal({ open, onClose }) {
  const user = useAuthStore((s) => s.user)
  const getValidAccessToken = useAuthStore((s) => s.getValidAccessToken)
  const [catalog, setCatalog] = useState(null)
  const [loadingPack, setLoadingPack] = useState(null)
  const [error, setError] = useState(null)
  const { data: credits } = useCreditsQuery({ refetchInterval: open ? 5000 : false })

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
      const returnHash = window.location.hash.replace(/^#/, '') || 'thumbnails'
      sessionStorage.setItem(
        'clixa_checkout_session',
        JSON.stringify({
          type: 'pack',
          transactionId: resp?.transaction_id,
          clientToken: resp?.client_token,
          checkoutUrl: resp?.checkout_url,
          packName: pack.name,
          planName: pack.name,
          packSlug: pack.slug,
          expectedCredits: Number(pack.credits),
          priceDisplay: fmtPrice(pack.price_usd),
          totalDueDisplay: fmtPrice(pack.price_usd),
          returnHash,
        })
      )
      onClose?.()
      window.location.hash = 'checkout'
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
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="credits-modal-head">
        <div className="credits-modal-head-left">
          <div className="credits-modal-head-icon" aria-hidden>
            <CreditCoin size={18} />
          </div>
          <div className="credits-modal-head-text">
            <h2 id="credits-modal-title" className="credits-modal-title">
              Credits
            </h2>
            <p className="credits-modal-sub">
              One-time top-up · never expire
              {total != null && (
                <>
                  {' '}
                  · <strong>{fmtCredits(total)}</strong> in balance
                </>
              )}
            </p>
          </div>
        </div>
        <button type="button" className="credits-modal-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>

      {/* ── Scroll body ──────────────────────────────────────────── */}
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
          <div className="credits-modal-empty">No credit packs available right now.</div>
        ) : (
          <ul className="credits-modal-grid">
            {packs.map((p) => (
              <li
                key={p.slug}
                className={`credits-pack-card${p.isBestValue ? ' credits-pack-card--best' : ''}`}
              >
                {/* Top row: badge or savings chip */}
                <div className="credits-pack-top">
                  {p.isBestValue && <span className="credits-pack-badge">Best value</span>}
                  {p.savingsPct >= 15 && !p.isBestValue && (
                    <span className="credits-pack-savings">Save {p.savingsPct}%</span>
                  )}
                </div>

                {/* Credit coin icon */}
                <div className="credits-pack-icon-wrap" aria-hidden>
                  <CreditCoin size={24} />
                </div>

                {/* Amount */}
                <div className="credits-pack-credits">
                  <span className="credits-pack-credits-num">{fmtCredits(p.credits)}</span>
                  <span className="credits-pack-credits-label">credits</span>
                </div>

                {/* Price */}
                <div className="credits-pack-price">{fmtPrice(p.price_usd)}</div>

                {/* CTA */}
                {p.isBestValue ? (
                  <div className="credits-pack-lmb-wrap">
                    <LiquidMetalButton
                      label="Get credits"
                      icon={Sparkles}
                      dark
                      width="100%"
                      height={44}
                      onClick={() => buy(p)}
                      loading={loadingPack === p.slug}
                      disabled={!!loadingPack && loadingPack !== p.slug}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="credits-pack-cta"
                    onClick={() => buy(p)}
                    disabled={!!loadingPack}
                  >
                    {loadingPack === p.slug ? 'Opening…' : 'Get credits'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="credits-modal-foot">
        <span className="credits-modal-foot-note">
          <IconShield />
          Payments processed securely by Paddle
        </span>
        <button
          type="button"
          className="credits-modal-link"
          onClick={() => {
            onClose?.()
            window.location.hash = 'pro'
          }}
        >
          Upgrade your plan →
        </button>
      </footer>
    </Dialog>
  )
}
