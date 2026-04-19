import { useState } from 'react'
import '../landing/sections/pricing/pricing.css'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    popular: false,
    monthly: '$19.99',
    annual: '$13.99',
    oldPrice: '$19.99',
    billedAnnual: '$167.88 / yr',
    desc: 'For creators starting to optimize their videos.',
    limits: [
      { icon: 'thumb', label: '40 thumbnails' },
      { icon: 'script', label: '150 scripts' },
      { icon: 'opt', label: '20 optimizations' },
      { icon: 'star', label: '50 ratings' },
      { icon: 'mic', label: '10 min speech' },
    ],
    features: [
      { on: true, text: 'Works in Any Language' },
      { on: true, text: 'Prompt-to-Thumbnail' },
      { on: true, text: 'Recreate & Edit' },
      { on: true, text: 'Scriptz Score' },
      { on: true, text: 'One-Click Fix' },
      { on: true, text: 'AI Script Generator' },
      { on: true, text: 'AI Title Generator' },
      { on: true, text: 'YouTube Analytics' },
      { on: false, text: 'Personas & Styles' },
      { on: false, text: 'FaceSwap' },
      { on: false, text: 'Better AI Models' },
      { on: false, text: 'Priority Processing' },
      { on: false, text: 'Private Generations' },
      { on: false, text: 'Early Access Features' },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    popular: true,
    monthly: '$39.99',
    annual: '$27.99',
    oldPrice: '$39.99',
    billedAnnual: '$335.88 / yr',
    desc: 'For serious creators who upload consistently.',
    limits: [
      { icon: 'thumb', label: '120 thumbnails' },
      { icon: 'script', label: '400 scripts' },
      { icon: 'opt', label: '60 optimizations' },
      { icon: 'star', label: '150 ratings' },
      { icon: 'mic', label: '30 min speech' },
    ],
    features: [
      { on: true, text: 'Works in Any Language' },
      { on: true, text: 'Prompt-to-Thumbnail' },
      { on: true, text: 'Recreate & Edit' },
      { on: true, text: 'Scriptz Score' },
      { on: true, text: 'One-Click Fix' },
      { on: true, text: 'AI Script Generator' },
      { on: true, text: 'AI Title Generator' },
      { on: true, text: 'YouTube Analytics' },
      { on: true, text: 'Personas & Styles' },
      { on: true, text: 'FaceSwap' },
      { on: true, text: 'Better AI Models' },
      { on: true, text: 'Priority Processing' },
      { on: false, text: 'Private Generations' },
      { on: false, text: 'Early Access Features' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    popular: false,
    monthly: '$79.99',
    annual: '$55.99',
    oldPrice: '$79.99',
    billedAnnual: '$671.88 / yr',
    desc: 'For creators and teams scaling their channels.',
    limits: [
      { icon: 'thumb', label: '300 thumbnails' },
      { icon: 'script', label: '900 scripts' },
      { icon: 'opt', label: '150 optimizations' },
      { icon: 'star', label: '400 ratings' },
      { icon: 'mic', label: '90 min speech' },
    ],
    features: [
      { on: true, text: 'Works in Any Language' },
      { on: true, text: 'Prompt-to-Thumbnail' },
      { on: true, text: 'Recreate & Edit' },
      { on: true, text: 'Scriptz Score' },
      { on: true, text: 'One-Click Fix' },
      { on: true, text: 'AI Script Generator' },
      { on: true, text: 'AI Title Generator' },
      { on: true, text: 'YouTube Analytics' },
      { on: true, text: 'Personas & Styles' },
      { on: true, text: 'FaceSwap' },
      { on: true, text: 'Highest Quality AI Models' },
      { on: true, text: 'Priority Queue' },
      { on: true, text: 'Private Generations' },
      { on: true, text: 'Early Access Features' },
    ],
  },
]

function IconThumb() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="2" width="14" height="10" rx="2" />
      <path d="M5 14h6" />
    </svg>
  )
}

function IconScript() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 4h12M2 7h12M2 10h8" />
    </svg>
  )
}

function IconOpt() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 2" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 1.5l1.8 3.7 4.1.6-3 2.9.7 4.1L8 10.9l-3.6 1.9.7-4.1-3-2.9 4.1-.6z" />
    </svg>
  )
}

function IconMic() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 1a3 3 0 00-3 3v5a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M13 8v.667a5 5 0 01-10 0V8M8 14v2M5.333 16h5.334" />
    </svg>
  )
}

const LIMIT_ICONS = { thumb: IconThumb, script: IconScript, opt: IconOpt, star: IconStar, mic: IconMic }

function LimitIcon({ type }) {
  const Icon = LIMIT_ICONS[type] || IconThumb
  return <Icon />
}

export function ProPricingContent({ onStartTrial }) {
  const [period, setPeriod] = useState('monthly')
  const annual = period === 'annual'

  const handleCta = (e) => {
    e.preventDefault()
    onStartTrial?.()
  }

  return (
    <section className="pri-section" id="pricing" aria-labelledby="pri-heading">
      <div className="pri-inner">
        <div className="pri-header pri-reveal pri-visible">
          <div className="pri-badge">
            <span className="pri-badge-dot" />
            Pricing
          </div>
          <h2 className="pri-h2" id="pri-heading">
            Start Creating with
            <br />
            <span className="pri-h2-accent">Scriptz AI Today</span>
          </h2>
          <p className="pri-lead">No hidden fees. Cancel anytime.</p>

          <div className="pri-toggle-wrap">
            <div className="pri-toggle" role="group" aria-label="Billing period">
              <button
                type="button"
                className={`pri-toggle-btn ${period === 'monthly' ? 'pri-toggle-active' : ''}`}
                onClick={() => setPeriod('monthly')}
                data-period="monthly"
              >
                Monthly
              </button>
              <button
                type="button"
                className={`pri-toggle-btn ${period === 'annual' ? 'pri-toggle-active' : ''}`}
                onClick={() => setPeriod('annual')}
                data-period="annual"
              >
                Annually
                <span className="pri-toggle-save">Save 30%</span>
              </button>
            </div>
            <p className={`pri-annual-msg ${annual ? 'pri-show' : ''}`} aria-live="polite">
              Save 30% with our annual plans
            </p>
          </div>
        </div>

        <div className="pri-cards">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`pri-card pri-reveal pri-visible ${plan.popular ? 'pri-card--pop' : ''}`}
            >
              <div className={`pri-card-glow ${plan.popular ? 'pri-glow--pop' : ''}`} />

              <div className="pri-top">
                <div className="pri-name-row">
                  <span className="pri-plan-name">{plan.name}</span>
                  {plan.popular && <span className="pri-pop-badge">Most Popular</span>}
                </div>

                <div className="pri-price">
                  <div className="pri-price-nums">
                    <span className={`pri-old ${annual ? '' : 'pri-hidden'}`}>{plan.oldPrice}</span>
                    <span className="pri-cur">{annual ? plan.annual : plan.monthly}</span>
                    <span className="pri-mo">/mo</span>
                  </div>
                  <p className={`pri-billed ${annual ? '' : 'pri-hidden'}`}>
                    Billed annually — <strong>{plan.billedAnnual}</strong>
                  </p>
                  <p className={`pri-billed-mo ${annual ? 'pri-hidden' : ''}`}>Billed monthly</p>
                </div>

                <p className="pri-desc">{plan.desc}</p>
              </div>

              <div className="pri-btn-wrap">
                <button
                  type="button"
                  className={`pri-btn ${plan.popular ? 'pri-btn--pop' : ''}`}
                  onClick={handleCta}
                >
                  Start Free Trial
                </button>
              </div>

              <div className="pri-sep" />

              <div className="pri-limits">
                <p className="pri-limits-label">Monthly usage</p>
                <div className="pri-limits-grid">
                  {plan.limits.map((lim, i) => (
                    <div key={i} className="pri-lim">
                      <LimitIcon type={lim.icon} />
                      <span>{lim.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pri-sep" />

              <ul className="pri-feats">
                {plan.features.map((f, i) => (
                  <li key={i} className={`pri-feat ${f.on ? 'on' : 'off'}`}>
                    <span className={f.on ? 'chk' : 'crs'} />
                    {f.text}
                  </li>
                ))}
              </ul>

              <button type="button" className={`pri-trial ${plan.popular ? 'pri-trial--pop' : ''}`} onClick={handleCta}>
                or Start Free Trial →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
