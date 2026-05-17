import { useCallback, useEffect, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'

import { Dialog } from './ui'
import { LiquidMetalButton } from './LiquidMetalButton'
import { useAuthStore } from '../stores/authStore'
import { useCreditsQuery } from '../queries/billing/creditsQueries'
import { getPlans, startCheckout } from '../api/billing'
import './CreditPacksModal.css'

const fmtCredits = (n) => {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}

const fmtPrice = (usd) => {
  const n = Number(usd)
  if (!Number.isFinite(n)) return '—'
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}

const perCredit = (usd, credits) => {
  const rate = Number(usd) / Number(credits)
  if (!Number.isFinite(rate) || rate <= 0) return null
  return `$${rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} / credit`
}

const decoratePacks = (packs) => {
  if (!packs?.length) return []
  const rate = (p) => Number(p.price_usd) / Number(p.credits)
  let bestSlug = null
  let bestRate = Infinity
  let worstRate = 0
  for (const p of packs) {
    const r = rate(p)
    if (r < bestRate) {
      bestRate = r
      bestSlug = p.slug
    }
    if (r > worstRate) worstRate = r
  }
  return packs.map((p) => {
    const r = rate(p)
    const savingsPct = worstRate > 0 ? Math.round((1 - r / worstRate) * 100) : 0
    return { ...p, isBestValue: p.slug === bestSlug, savingsPct }
  })
}

function IconClose() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg
      width="12"
      height="12"
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

function SkeletonRows() {
  return (
    <div className="cpm-skeleton-list">
      {[100, 85, 90, 80, 88].map((w, i) => (
        <div key={i} className="cpm-skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="cpm-skeleton-icon" />
          <div className="cpm-skeleton-body">
            <div className="cpm-skeleton-line cpm-skeleton-line--lg" style={{ width: `${w}%` }} />
            <div
              className="cpm-skeleton-line cpm-skeleton-line--sm"
              style={{ width: `${Math.round(w * 0.55)}%` }}
            />
          </div>
          <div className="cpm-skeleton-cta" />
        </div>
      ))}
    </div>
  )
}

export function CreditPacksModal({ open, onClose }) {
  const user = useAuthStore((s) => s.user)
  const getValidAccessToken = useAuthStore((s) => s.getValidAccessToken)
  const [catalog, setCatalog] = useState(null)
  const [loadingPack, setLoadingPack] = useState(null)
  const [error, setError] = useState(null)
  const [fetchError, setFetchError] = useState(false)
  const { data: credits } = useCreditsQuery({ refetchInterval: open ? 5000 : false })

  // Load the pack catalog. Tracks a distinct `fetchError` so a failed
  // load shows an actionable retry instead of an indefinite skeleton.
  const loadCatalog = useCallback(() => {
    let alive = true
    setError(null)
    setFetchError(false)
    getPlans()
      .then((d) => {
        if (alive) {
          setCatalog(d)
          setFetchError(false)
        }
      })
      .catch(() => {
        if (alive) {
          setCatalog(null)
          setFetchError(true)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    return loadCatalog()
  }, [open, loadCatalog])

  const packs = useMemo(() => decoratePacks(catalog?.packs || []), [catalog])

  if (!open) return null

  const balance = credits
    ? Number(credits.subscription_credits || 0) + Number(credits.permanent_credits || 0)
    : null

  const buy = async (pack) => {
    if (!user) {
      window.location.hash = 'register'
      return
    }
    if (!pack.paddle_price_id || pack.paddle_price_id.startsWith('pri_placeholder_')) {
      setError('This pack is not available yet. Please contact support.')
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
    <Dialog open onClose={onClose} size="md" ariaLabelledBy="cpm-title" className="cpm-card">
      {/* Header */}
      <header className="cpm-head">
        <div className="cpm-head-left">
          <div className="cpm-head-icon" aria-hidden>
            <Zap size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h2 id="cpm-title" className="cpm-title">
              Top up credits
            </h2>
            <p className="cpm-sub">
              One-time · never expire
              {balance != null && (
                <>
                  {' '}
                  · <strong>{fmtCredits(balance)}</strong> in balance
                </>
              )}
            </p>
          </div>
        </div>
        <button type="button" className="cpm-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>

      {/* Body */}
      <div className="cpm-body">
        {error && (
          <div className="cpm-error" role="alert">
            {error}
          </div>
        )}

        {fetchError ? (
          <div className="cpm-error-state" role="alert">
            <p>Couldn&apos;t load credit packs. Please try again.</p>
            <button type="button" className="cpm-retry-btn" onClick={loadCatalog}>
              Retry
            </button>
          </div>
        ) : !catalog ? (
          <SkeletonRows />
        ) : packs.length === 0 ? (
          <p className="cpm-empty">No credit packs available right now.</p>
        ) : (
          <ul className="cpm-list">
            {packs.map((p) => {
              const isLoading = loadingPack === p.slug
              const isDisabled = !!loadingPack && !isLoading
              const rate = perCredit(p.price_usd, p.credits)
              return (
                <li key={p.slug} className={`cpm-row${p.isBestValue ? ' cpm-row--best' : ''}`}>
                  {/* Left: icon + credit info */}
                  <div className="cpm-row-left">
                    <div className="cpm-row-icon" aria-hidden>
                      <Zap size={15} strokeWidth={2.2} />
                    </div>
                    <div className="cpm-row-info">
                      <div className="cpm-row-credits">
                        <span className="cpm-row-num">{fmtCredits(p.credits)}</span>
                        <span className="cpm-row-unit">credits</span>
                        {p.isBestValue && <span className="cpm-badge-best">Best value</span>}
                        {!p.isBestValue && p.savingsPct >= 15 && (
                          <span className="cpm-badge-save">Save {p.savingsPct}%</span>
                        )}
                      </div>
                      {rate && <span className="cpm-row-rate">{rate}</span>}
                    </div>
                  </div>

                  {/* Right: price + CTA */}
                  <div className="cpm-row-right">
                    <span className="cpm-row-price">{fmtPrice(p.price_usd)}</span>
                    {p.isBestValue ? (
                      isLoading ? (
                        <button
                          type="button"
                          className="cpm-btn cpm-btn--primary cpm-btn--loading"
                          disabled
                        >
                          <span className="cpm-btn-spinner cpm-btn-spinner--dark" />
                        </button>
                      ) : (
                        <LiquidMetalButton
                          label="Buy"
                          dark
                          width={72}
                          height={30}
                          disabled={isDisabled}
                          onClick={() => buy(p)}
                          aria-label={`Buy ${fmtCredits(p.credits)} credits for ${fmtPrice(p.price_usd)}`}
                        />
                      )
                    ) : (
                      <button
                        type="button"
                        className="cpm-btn"
                        onClick={() => buy(p)}
                        disabled={isDisabled || isLoading}
                      >
                        {isLoading ? <span className="cpm-btn-spinner" /> : 'Buy'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <footer className="cpm-foot">
        <span className="cpm-foot-note">
          <IconShield />
          Secure payments by Paddle
        </span>
        <button
          type="button"
          className="cpm-foot-link"
          onClick={() => {
            onClose?.()
            window.location.hash = 'pro'
          }}
        >
          View plans →
        </button>
      </footer>
    </Dialog>
  )
}
