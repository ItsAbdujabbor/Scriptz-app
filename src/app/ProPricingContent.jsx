import { useState } from 'react'
import '../landing/sections/pricing/pricing.css'

const CREATOR_TIERS = [
  { credits: 3600, thumbs: 180, price: '$39.99', annual: '$27.99' },
  { credits: 5000, thumbs: 250, price: '$49.99', annual: '$34.99' },
  { credits: 6000, thumbs: 300, price: '$59.99', annual: '$41.99' },
]

const ULTIMATE_TIERS = [
  { credits: 9000, thumbs: 450, price: '$79.99', annual: '$55.99' },
  { credits: 12000, thumbs: 600, price: '$99.99', annual: '$69.99' },
  { credits: 15000, thumbs: 750, price: '$119.99', annual: '$83.99' },
  { credits: 18000, thumbs: 900, price: '$139.99', annual: '$97.99' },
]

function formatCredits(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K'
  return String(n)
}

const STARTER_CREDITS = 1700
const STARTER_THUMBS = 85

function starterFeatures() {
  return [
    { on: true, text: `${formatCredits(STARTER_CREDITS)} credits per month` },
    { on: true, text: '2 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard Analytics' },
    { on: false, text: 'A/B Testing' },
    { on: false, text: 'Personas & Styles' },
    { on: false, text: 'Edit & FaceSwap' },
    { on: false, text: 'Priority Support' },
  ]
}

function creatorFeatures(tier) {
  return [
    { on: true, text: `${formatCredits(tier.credits)} credits per month` },
    { on: true, text: '4 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard Analytics' },
    { on: true, text: 'A/B Testing' },
    { on: true, text: 'Personas & Styles' },
    { on: true, text: 'Edit & FaceSwap' },
    { on: false, text: 'Priority Support' },
  ]
}

function ultimateFeatures(tier) {
  return [
    { on: true, text: `${formatCredits(tier.credits)} credits per month` },
    { on: true, text: '10 YouTube channels' },
    { on: true, text: 'AI Thumbnail Generator' },
    { on: true, text: 'AI Coach Chat' },
    { on: true, text: 'Video SEO Optimizer' },
    { on: true, text: 'Title Scoring & Ideas' },
    { on: true, text: 'Thumbnail Analyzer' },
    { on: true, text: 'Dashboard + Advanced Insights' },
    { on: true, text: 'A/B Testing + Analytics' },
    { on: true, text: 'Unlimited Personas & Styles' },
    { on: true, text: 'Edit & FaceSwap' },
    { on: true, text: 'Priority Support' },
  ]
}

export function ProPricingContent({ onStartTrial }) {
  const [creatorTier, setCreatorTier] = useState(0)
  const [ultimateTier, setUltimateTier] = useState(0)
  const [annual, setAnnual] = useState(false)

  const creator = CREATOR_TIERS[creatorTier]
  const ultimate = ULTIMATE_TIERS[ultimateTier]

  const starterPrice = annual ? '$13.99' : '$19.99'
  const creatorPrice = annual ? creator.annual : creator.price
  const ultimatePrice = annual ? ultimate.annual : ultimate.price

  const handleCta = (e) => {
    e.preventDefault()
    onStartTrial?.()
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
          <div className="pri-card pri-reveal pri-visible">
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
                Up to <strong>{STARTER_THUMBS} thumbnails</strong> per month.
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button type="button" className="pro-cta" onClick={handleCta}>
                Get Starter
              </button>
            </div>

            <ul className="pri-feats pro-feats">
              {starterFeatures().map((f, i) => (
                <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                  <span className={f.on ? 'chk' : 'crs'} />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ── CREATOR ── */}
          <div className="pri-card pri-card--pop pri-reveal pri-visible">
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
                Up to <strong>{creator.thumbs} thumbnails</strong> per month.
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button type="button" className="pro-cta pro-cta--primary" onClick={handleCta}>
                Get Creator
              </button>
            </div>

            <div className="pro-slider-wrap">
              <div className="pro-slider-label-head">Adjust credits</div>
              <input
                type="range"
                className="pro-slider"
                min={0}
                max={CREATOR_TIERS.length - 1}
                step={1}
                value={creatorTier}
                onChange={(e) => setCreatorTier(Number(e.target.value))}
                aria-label="Credit tier"
              />
              <div className="pro-slider-labels">
                {CREATOR_TIERS.map((t, i) => (
                  <span
                    key={i}
                    className={`pro-slider-label ${i === creatorTier ? 'pro-slider-label--active' : ''}`}
                  >
                    {formatCredits(t.credits)}
                  </span>
                ))}
              </div>
            </div>

            <ul className="pri-feats pro-feats">
              {creatorFeatures(creator).map((f, i) => (
                <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                  <span className={f.on ? 'chk' : 'crs'} />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ── ULTIMATE ── */}
          <div className="pri-card pri-reveal pri-visible">
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
                Up to <strong>{ultimate.thumbs} thumbnails</strong> per month.
              </p>
            </div>

            <div className="pri-btn-wrap">
              <button type="button" className="pro-cta" onClick={handleCta}>
                Get Ultimate
              </button>
            </div>

            <div className="pro-slider-wrap">
              <div className="pro-slider-label-head">Adjust credits</div>
              <input
                type="range"
                className="pro-slider"
                min={0}
                max={ULTIMATE_TIERS.length - 1}
                step={1}
                value={ultimateTier}
                onChange={(e) => setUltimateTier(Number(e.target.value))}
                aria-label="Credit tier"
              />
              <div className="pro-slider-labels">
                {ULTIMATE_TIERS.map((t, i) => (
                  <span
                    key={i}
                    className={`pro-slider-label ${i === ultimateTier ? 'pro-slider-label--active' : ''}`}
                  >
                    {formatCredits(t.credits)}
                  </span>
                ))}
              </div>
            </div>

            <ul className="pri-feats pro-feats">
              {ultimateFeatures(ultimate).map((f, i) => (
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
