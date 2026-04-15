import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getPlans, startCheckout, changePlan } from '../api/billing'
import { openPaddleCheckout } from '../lib/paddle'
import { useSubscriptionQuery, invalidateCredits } from '../queries/billing/creditsQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { celebrate } from '../lib/celebrate'
import '../landing/sections/pricing/pricing.css'

// Canonical credits per plan. Display numbers are per-month and show the "up to"
// headline capacity on each tier's default SRX model:
//   • Starter / Creator — default SRX-2 Pro: 20 cr/thumb, 8 cr/SEO
//   • Ultimate          — default SRX-3 Ultra: 35 cr/thumb, 15 cr/SEO
// Users can spend credits any way they want — the split is for display only.
// Yearly credits = monthly × 12 × 1.15 (~15% bonus).
const CREATOR_TIERS = [
  {
    credits: 7000,
    thumbs: 350,
    seos: 875,
    price: '$39.99',
    annual: '$27.99',
    yearlyCredits: 71400,
  },
]

const ULTIMATE_TIERS = [
  {
    credits: 15000,
    thumbs: 750,
    seos: 1875,
    price: '$79.99',
    annual: '$55.99',
    yearlyCredits: 153000,
  },
]

function formatCredits(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K'
  return String(n)
}
function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US')
}

const STARTER_CREDITS = 3000
const STARTER_YEARLY_CREDITS = 30600
const STARTER_THUMBS = 150
const STARTER_SEOS = 375

function starterFeatures(annual) {
  const creditText = annual
    ? `${formatCredits(STARTER_YEARLY_CREDITS)} credits per year (~15% bonus)`
    : `${formatCredits(STARTER_CREDITS)} credits per month`
  return [
    { on: true, text: creditText },
    { on: true, text: 'SRX-2 Pro model' },
    { on: true, text: '2 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'Edit & FaceSwap' },
    { on: true, text: 'Styles library' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard Analytics' },
    { on: false, text: 'A/B Testing' },
    { on: false, text: 'Custom Personas' },
    { on: false, text: 'Priority Support' },
  ]
}

function creatorFeatures(tier, annual) {
  const creditText = annual
    ? `${formatCredits(tier.yearlyCredits)} credits per year (~15% bonus)`
    : `${formatCredits(tier.credits)} credits per month`
  return [
    { on: true, text: creditText },
    { on: true, text: 'SRX-2 Pro model' },
    { on: true, text: '4 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'Edit & FaceSwap' },
    { on: true, text: 'Custom Personas & Styles' },
    { on: true, text: 'A/B Testing (up to 5 variants)' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard Analytics' },
    { on: false, text: 'SRX-3 Ultra model' },
    { on: false, text: 'Predictive A/B insights' },
    { on: false, text: 'Priority Support' },
  ]
}

function ultimateFeatures(tier, annual) {
  const creditText = annual
    ? `${formatCredits(tier.yearlyCredits)} credits per year (~15% bonus)`
    : `${formatCredits(tier.credits)} credits per month`
  return [
    { on: true, text: creditText },
    { on: true, text: 'SRX-3 Ultra model' },
    { on: true, text: '10 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'Edit & FaceSwap' },
    { on: true, text: 'Unlimited Personas & Styles' },
    { on: true, text: 'A/B Testing + Predictive Insights' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard + Advanced Insights' },
    { on: true, text: 'Priority Support' },
  ]
}

export function ProPricingContent({ onStartTrial }) {
  const [annual, setAnnual] = useState(false)
  const [plans, setPlans] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(null) // slug or null
  const [checkoutError, setCheckoutError] = useState(null)

  const queryClient = useQueryClient()
  const { user, getValidAccessToken } = useAuthStore()
  const { data: subscription } = useSubscriptionQuery()
  const activeTier = subscription?.tier
  const isAnnualActive = subscription?.billing_period === 'year'

  useEffect(() => {
    let alive = true
    getPlans()
      .then((data) => {
        if (alive) setPlans(data)
      })
      .catch(() => {
        if (alive) setPlans(null)
      })
    return () => {
      alive = false
    }
  }, [])

  // Post-Paddle-checkout return → trigger celebration once, then clean URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    if (!hash.includes('checkout=success')) return
    // Refresh sub + credits and celebrate.
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription })
    invalidateCredits(queryClient)
    celebrate({
      emoji: '🎉',
      title: 'Thanks — you’re in!',
      subtitle: 'Your subscription is active. Credits are landing in your account right now.',
      variant: 'thanks',
    })
    // Strip the ?checkout=success query from the hash so it doesn't re-fire on reload.
    const cleanHash = hash.replace(/[?&]checkout=success/g, '')
    const newHash = cleanHash.endsWith('?') ? cleanHash.slice(0, -1) : cleanHash
    if (newHash !== hash) {
      window.history.replaceState(null, '', newHash || '#pro')
    }
  }, [queryClient])

  const creator = CREATOR_TIERS[0]
  const ultimate = ULTIMATE_TIERS[0]

  const starterPrice = annual ? '$13.99' : '$19.99'
  const creatorPrice = annual ? creator.annual : creator.price
  const ultimatePrice = annual ? ultimate.annual : ultimate.price

  const ctaLabelFor = (tier, defaultLabel) => {
    if (checkoutLoading === tier) return 'Opening checkout…'
    const isCurrent =
      activeTier === tier &&
      // match billing period when user is subscribed
      ((annual && isAnnualActive) || (!annual && !isAnnualActive))
    if (isCurrent) return '✓ Current plan'
    // Different billing period of same tier — offer switch
    if (activeTier === tier) return annual ? 'Switch to yearly' : 'Switch to monthly'
    // User has a DIFFERENT plan — offer up/downgrade
    if (activeTier) {
      const rank = { starter: 0, creator: 1, ultimate: 2 }
      const dir = (rank[tier] ?? 0) > (rank[activeTier] ?? 0) ? 'Upgrade to' : 'Switch to'
      return `${dir} ${defaultLabel.replace('Get ', '')}`
    }
    return defaultLabel
  }

  const isCurrentTier = (tier) =>
    activeTier === tier && ((annual && isAnnualActive) || (!annual && !isAnnualActive))

  const findPriceId = (slug) => {
    if (!plans?.plans) return null
    const row = plans.plans.find((p) => p.slug === slug && p.is_active)
    return row?.paddle_price_id || null
  }

  const hasActiveSub =
    !!subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)

  const handleCta = async (tier, { skipTrial = false } = {}) => {
    setCheckoutError(null)
    // Unauthenticated users → existing trial / register flow
    if (!user) {
      onStartTrial?.()
      return
    }
    // Map tier + billing cycle → plan slug from the backend catalog
    const slug = (() => {
      if (tier === 'starter') return annual ? 'starter_annual' : 'starter_monthly'
      if (tier === 'creator') return annual ? 'creator_annual' : 'creator_monthly'
      if (tier === 'ultimate') return annual ? 'ultimate_annual' : 'ultimate_monthly'
      return null
    })()
    if (!slug) return
    const priceId = findPriceId(slug)
    if (!priceId || priceId.startsWith('pri_placeholder_')) {
      setCheckoutError('Billing is not yet enabled. Please contact support.')
      return
    }
    setCheckoutLoading(tier)
    try {
      const token = await getValidAccessToken()

      if (hasActiveSub) {
        // ── User already subscribed → upgrade/downgrade via /change-plan
        // Decide timing: upgrades apply immediately, downgrades wait until
        // next period so we don't refund active credits.
        const rank = { starter: 0, creator: 1, ultimate: 2 }
        const isUpgrade = (rank[tier] ?? 0) > (rank[activeTier] ?? 0)
        const timing = isUpgrade ? 'immediate' : 'next_period'
        await changePlan(token, { planSlug: slug, timing })
        queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription })
        invalidateCredits(queryClient)
        setCheckoutError(null)
        // 🎉 celebrate the transition
        const planDisplay =
          { starter: 'Starter', creator: 'Creator', ultimate: 'Ultimate' }[tier] || tier
        celebrate(
          isUpgrade
            ? {
                emoji: tier === 'ultimate' ? '👑' : '🚀',
                title: `Welcome to ${planDisplay}!`,
                subtitle: 'Your new plan is active and credits have been refreshed.',
                variant: 'celebrate',
              }
            : {
                emoji: '✅',
                title: `Scheduled: ${planDisplay}`,
                subtitle: 'Your plan will switch at the end of the current billing period.',
                variant: 'success',
                confetti: false,
              }
        )
        return
      }

      // No active sub → classic first-time checkout through Paddle.js.
      // `skipTrial: true` tells the backend to zero out the trial period so
      // the user is charged immediately.
      const resp = await startCheckout(token, {
        priceId,
        skipTrial,
        successUrl: window.location.origin + '/#pro?checkout=success',
        cancelUrl: window.location.origin + '/#pro?checkout=canceled',
      })
      await openPaddleCheckout({
        transactionId: resp?.transaction_id,
        checkoutUrl: resp?.checkout_url,
        clientToken: resp?.client_token,
      })
    } catch (e) {
      const msg =
        e?.payload?.error?.extra?.message ||
        e?.payload?.error?.message ||
        e?.message ||
        'Could not complete the request. Please try again.'
      setCheckoutError(msg)
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <section className="pri-section pro-plan-section" id="pricing" aria-labelledby="pri-heading">
      <div className="pri-inner">
        <div className="pri-header pri-reveal pri-visible">
          <h2 className="pri-h2" id="pri-heading">
            Choose your
            <br />
            <span className="pri-h2-accent">plan</span>
          </h2>
          <p className="pri-lead">
            Credit-based pricing — use credits for any feature. Cancel anytime.
          </p>

          {checkoutError ? (
            <p role="alert" className="pro-checkout-error">
              {checkoutError}
            </p>
          ) : null}

          <div className="pro-billing-toggle">
            <button
              type="button"
              className={`pro-billing-btn ${!annual ? 'pro-billing-btn--active' : ''}`}
              onClick={() => setAnnual(false)}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`pro-billing-btn ${annual ? 'pro-billing-btn--active' : ''}`}
              onClick={() => setAnnual(true)}
            >
              Annually
              <span className="pro-billing-save">Save 30%</span>
            </button>
          </div>
        </div>

        <div className="pri-cards">
          {/* ── STARTER ── */}
          <div className="pri-card pri-card--starter pri-reveal pri-visible">
            <div className="pri-top">
              <div className="pri-name-row">
                <span className="pri-plan-name">Starter</span>
              </div>
              <div className="pri-price">
                <div className="pri-price-nums">
                  <span className="pri-cur">{starterPrice}</span>
                  <span className="pri-mo">/mo</span>
                </div>
                <p className="pri-billed-mo">{annual ? 'Billed annually' : 'Billed monthly'}</p>
              </div>
              <p className="pri-desc">
                Up to{' '}
                <strong>
                  {formatNumber(annual ? STARTER_THUMBS * 12 : STARTER_THUMBS)} thumbnails
                </strong>{' '}
                {annual ? 'per year' : 'per month'}.
                <br />
                Or{' '}
                <strong>
                  {formatNumber(annual ? STARTER_SEOS * 12 : STARTER_SEOS)} SEO optimizations
                </strong>
                .
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button
                type="button"
                className={`pro-cta ${isCurrentTier('starter') ? 'pro-cta--current' : ''}`}
                onClick={() => handleCta('starter')}
                disabled={checkoutLoading === 'starter' || isCurrentTier('starter')}
              >
                {ctaLabelFor('starter', 'Start free trial')}
              </button>
              {!hasActiveSub && (
                <button
                  type="button"
                  className="pro-cta-skip"
                  onClick={() => handleCta('starter', { skipTrial: true })}
                  disabled={checkoutLoading === 'starter'}
                >
                  Skip trial & pay now
                </button>
              )}
            </div>

            <ul className="pri-feats pro-feats">
              {starterFeatures(annual).map((f, i) => (
                <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                  <span className={f.on ? 'chk' : 'crs'} />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ── CREATOR ── */}
          <div className="pri-card pri-card--pop pri-card--creator pri-reveal pri-visible">
            <div className="pri-top">
              <div className="pri-name-row">
                <span className="pri-plan-name">Creator</span>
                <span className="pri-pop-badge">Most Popular</span>
              </div>
              <div className="pri-price">
                <div className="pri-price-nums">
                  <span className="pri-cur">{creatorPrice}</span>
                  <span className="pri-mo">/mo</span>
                </div>
                <p className="pri-billed-mo">{annual ? 'Billed annually' : 'Billed monthly'}</p>
              </div>
              <p className="pri-desc">
                Up to{' '}
                <strong>
                  {formatNumber(annual ? creator.thumbs * 12 : creator.thumbs)} thumbnails
                </strong>{' '}
                {annual ? 'per year' : 'per month'}.
                <br />
                Or{' '}
                <strong>
                  {formatNumber(annual ? creator.seos * 12 : creator.seos)} SEO optimizations
                </strong>
                .
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button
                type="button"
                className={`pro-cta pro-cta--primary ${isCurrentTier('creator') ? 'pro-cta--current' : ''}`}
                onClick={() => handleCta('creator')}
                disabled={checkoutLoading === 'creator' || isCurrentTier('creator')}
              >
                {ctaLabelFor('creator', 'Start free trial')}
              </button>
              {!hasActiveSub && (
                <button
                  type="button"
                  className="pro-cta-skip"
                  onClick={() => handleCta('creator', { skipTrial: true })}
                  disabled={checkoutLoading === 'creator'}
                >
                  Skip trial & pay now
                </button>
              )}
            </div>

            <ul className="pri-feats pro-feats">
              {creatorFeatures(creator, annual).map((f, i) => (
                <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                  <span className={f.on ? 'chk' : 'crs'} />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ── ULTIMATE ── */}
          <div className="pri-card pri-card--ultimate pri-reveal pri-visible">
            <div className="pri-top">
              <div className="pri-name-row">
                <span className="pri-plan-name">Ultimate</span>
              </div>
              <div className="pri-price">
                <div className="pri-price-nums">
                  <span className="pri-cur">{ultimatePrice}</span>
                  <span className="pri-mo">/mo</span>
                </div>
                <p className="pri-billed-mo">{annual ? 'Billed annually' : 'Billed monthly'}</p>
              </div>
              <p className="pri-desc">
                Up to{' '}
                <strong>
                  {formatNumber(annual ? ultimate.thumbs * 12 : ultimate.thumbs)} thumbnails
                </strong>{' '}
                {annual ? 'per year' : 'per month'}.
                <br />
                Or{' '}
                <strong>
                  {formatNumber(annual ? ultimate.seos * 12 : ultimate.seos)} SEO optimizations
                </strong>
                .
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button
                type="button"
                className={`pro-cta ${isCurrentTier('ultimate') ? 'pro-cta--current' : ''}`}
                onClick={() => handleCta('ultimate')}
                disabled={checkoutLoading === 'ultimate' || isCurrentTier('ultimate')}
              >
                {ctaLabelFor('ultimate', 'Start free trial')}
              </button>
              {!hasActiveSub && (
                <button
                  type="button"
                  className="pro-cta-skip"
                  onClick={() => handleCta('ultimate', { skipTrial: true })}
                  disabled={checkoutLoading === 'ultimate'}
                >
                  Skip trial & pay now
                </button>
              )}
            </div>

            <ul className="pri-feats pro-feats">
              {ultimateFeatures(ultimate, annual).map((f, i) => (
                <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                  <span className={f.on ? 'chk' : 'crs'} />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
