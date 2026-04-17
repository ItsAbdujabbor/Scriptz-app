import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getPlans, startCheckout, changePlan } from '../api/billing'
import { openPaddleCheckout } from '../lib/paddle'
import { useSubscriptionQuery, invalidateCredits } from '../queries/billing/creditsQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { celebrate } from '../lib/celebrate'
import '../landing/sections/pricing/pricing.css'

// Canonical credits per plan. Thumbnails shown are marketing figures:
//   • Starter:  1,500 cr → 50 thumbnails/month
//   • Creator:  4,000 cr → 150 thumbnails/month
//   • Ultimate: 10,000 cr → 450 thumbnails/month
// Yearly credits = monthly × 12 × 1.15 (~15% bonus).
const CREATOR_TIERS = [
  {
    credits: 4000,
    thumbs: 150,
    seos: 1000,
    price: '$39.99',
    annual: '$27.99',
    yearlyCredits: 55200,
  },
]

const ULTIMATE_TIERS = [
  {
    credits: 10000,
    thumbs: 450,
    seos: 2500,
    price: '$79.99',
    annual: '$55.99',
    yearlyCredits: 138000,
  },
]

function formatCredits(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K'
  return String(n)
}
function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US')
}

const STARTER_CREDITS = 1500
const STARTER_YEARLY_CREDITS = 20700
const STARTER_THUMBS = 50
const STARTER_SEOS = 375

const PLAN_SPECS = {
  starter: {
    channels: 2,
    personas: false,
    ab: false,
    abPredict: false,
    ultra: false,
    priority: false,
  },
  creator: {
    channels: 4,
    personas: true,
    ab: true,
    abPredict: false,
    ultra: false,
    priority: false,
  },
  ultimate: {
    channels: 10,
    personas: true,
    ab: true,
    abPredict: true,
    ultra: true,
    priority: true,
  },
}

const FEATURE_INFO = {
  credits: 'Monthly credit allowance you spend on thumbnails, SEO, ideas and every AI feature.',
  channels: 'Connect multiple YouTube channels and switch between them inside one account.',
  pro: 'Balanced general-purpose AI model powering thumbnails, titles and optimization.',
  thumb: 'Generate on-brand YouTube thumbnails from a short prompt or a reference image.',
  edit: 'Edit any generated thumbnail and swap your face in with a single click.',
  styles: 'Save, reuse and share visual styles so thumbnails stay consistent across videos.',
  seo: 'Improve titles, descriptions and tags to rank higher in YouTube search.',
  titleScore: 'Score existing titles and brainstorm new high-click ideas in seconds.',
  thumbAnalyze: 'Score existing thumbnails for clarity, emotion and click-through potential.',
  dashboard: 'Channel health snapshot with growth, best posting times and performance insights.',
  personas: 'Create AI personas tuned to your voice, audience and content niche.',
  ab: 'Run head-to-head thumbnail or title experiments to pick the winning variant.',
  ultra: 'Our top-tier model with richer imagery and deeper strategic insights.',
  abPredict: 'Forecast which A/B variant will win before you publish, using past data.',
  priority: 'Jump the support queue with faster responses from our team.',
}

function buildFeatures({ tier, credits, yearlyCredits, annual }) {
  const spec = PLAN_SPECS[tier]
  const creditText = annual
    ? `${formatCredits(yearlyCredits)} credits per year (~15% bonus)`
    : `${formatCredits(credits)} credits per month`
  // Ordering rule: always-on features first, tier-exclusive ones last, so X
  // rows naturally cluster at the bottom AND the order stays identical across
  // all plans.
  return [
    { key: 'credits', on: true, text: creditText, info: FEATURE_INFO.credits },
    {
      key: 'channels',
      on: true,
      text: `${spec.channels} YouTube channels`,
      info: FEATURE_INFO.channels,
    },
    { key: 'pro', on: true, text: 'SRX-2 Pro model', info: FEATURE_INFO.pro },
    { key: 'thumb', on: true, text: 'AI Thumbnail Generator', info: FEATURE_INFO.thumb },
    { key: 'edit', on: true, text: 'Edit & FaceSwap', info: FEATURE_INFO.edit },
    { key: 'styles', on: true, text: 'Styles library', info: FEATURE_INFO.styles },
    { key: 'seo', on: true, text: 'Video SEO Optimizer', info: FEATURE_INFO.seo },
    { key: 'titleScore', on: true, text: 'Title Scoring & Ideas', info: FEATURE_INFO.titleScore },
    { key: 'thumbAnalyze', on: true, text: 'Thumbnail Analyzer', info: FEATURE_INFO.thumbAnalyze },
    { key: 'dashboard', on: true, text: 'Dashboard Analytics', info: FEATURE_INFO.dashboard },
    { key: 'personas', on: spec.personas, text: 'Custom Personas', info: FEATURE_INFO.personas },
    { key: 'ab', on: spec.ab, text: 'A/B Testing', info: FEATURE_INFO.ab },
    { key: 'ultra', on: spec.ultra, text: 'SRX-3 Ultra model', info: FEATURE_INFO.ultra },
    {
      key: 'abPredict',
      on: spec.abPredict,
      text: 'Predictive A/B Insights',
      info: FEATURE_INFO.abPredict,
    },
    { key: 'priority', on: spec.priority, text: 'Priority Support', info: FEATURE_INFO.priority },
  ]
}

function InfoIcon() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function FeatureRow({ feat, openInfoId, setOpenInfoId, rowId }) {
  const open = openInfoId === rowId
  return (
    <li className={`pri-feat ${feat.on ? 'on' : 'off'}`}>
      <span className={feat.on ? 'chk' : 'crs'} />
      <span className="pri-feat-text">{feat.text}</span>
      <button
        type="button"
        className="pri-feat-info"
        aria-label={`About ${feat.text}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpenInfoId(open ? null : rowId)
        }}
      >
        <InfoIcon />
      </button>
      {open ? (
        <div className="pri-feat-tip" role="tooltip">
          {feat.info}
        </div>
      ) : null}
    </li>
  )
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

  // Only one info popover open at a time across all plan cards.
  const [openInfoId, setOpenInfoId] = useState(null)
  useEffect(() => {
    if (!openInfoId) return
    const onDown = (e) => {
      if (e.target.closest('.pri-feat')) return
      setOpenInfoId(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenInfoId(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openInfoId])

  const starterPrice = annual ? '$13.99' : '$19.99'
  const creatorPrice = annual ? creator.annual : creator.price
  const ultimatePrice = annual ? ultimate.annual : ultimate.price

  const PLAN_NAMES = { starter: 'Starter', creator: 'Creator', ultimate: 'Ultimate' }

  const ctaLabelFor = (tier) => {
    if (checkoutLoading === tier) return 'Opening checkout…'
    const isCurrent =
      activeTier === tier && ((annual && isAnnualActive) || (!annual && !isAnnualActive))
    if (isCurrent) return 'Current plan'
    if (activeTier === tier) return annual ? 'Switch to yearly' : 'Switch to monthly'
    if (activeTier) {
      const rank = { starter: 0, creator: 1, ultimate: 2 }
      const dir = (rank[tier] ?? 0) > (rank[activeTier] ?? 0) ? 'Upgrade to' : 'Switch to'
      return `${dir} ${PLAN_NAMES[tier]}`
    }
    return 'Start free trial'
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
                {ctaLabelFor('starter')}
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

            <div className="pro-feats-card">
              <ul className="pri-feats pro-feats">
                {buildFeatures({
                  tier: 'starter',
                  credits: STARTER_CREDITS,
                  yearlyCredits: STARTER_YEARLY_CREDITS,
                  annual,
                }).map((f) => (
                  <FeatureRow
                    key={f.key}
                    feat={f}
                    rowId={`starter:${f.key}`}
                    openInfoId={openInfoId}
                    setOpenInfoId={setOpenInfoId}
                  />
                ))}
              </ul>
            </div>
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
                {ctaLabelFor('creator')}
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

            <div className="pro-feats-card">
              <ul className="pri-feats pro-feats">
                {buildFeatures({
                  tier: 'creator',
                  credits: creator.credits,
                  yearlyCredits: creator.yearlyCredits,
                  annual,
                }).map((f) => (
                  <FeatureRow
                    key={f.key}
                    feat={f}
                    rowId={`creator:${f.key}`}
                    openInfoId={openInfoId}
                    setOpenInfoId={setOpenInfoId}
                  />
                ))}
              </ul>
            </div>
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
                {ctaLabelFor('ultimate')}
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

            <div className="pro-feats-card">
              <ul className="pri-feats pro-feats">
                {buildFeatures({
                  tier: 'ultimate',
                  credits: ultimate.credits,
                  yearlyCredits: ultimate.yearlyCredits,
                  annual,
                }).map((f) => (
                  <FeatureRow
                    key={f.key}
                    feat={f}
                    rowId={`ultimate:${f.key}`}
                    openInfoId={openInfoId}
                    setOpenInfoId={setOpenInfoId}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
