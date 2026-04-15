/**
 * ModelTierSelector — three pills (SRX-1 Lite / SRX-2 Pro / SRX-3 Ultra) with:
 *   • locked tiers visible (lock icon + upgrade hint)
 *   • current selection highlighted
 *   • clicking an unlocked tier persists immediately + optimistic UI
 *
 * Backend re-validates against the user's plan entitlement (PLAN_TIER_GRANT),
 * so this UI is just a convenience layer.
 */
import { useState } from 'react'

import {
  useModelTierStateQuery,
  useSetModelTierMutation,
} from '../queries/modelTier/modelTierQueries'
import './ModelTierSelector.css'

function IconLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

export function ModelTierSelector() {
  const { data, isLoading, isError } = useModelTierStateQuery()
  const setTierMutation = useSetModelTierMutation()
  const [errorMsg, setErrorMsg] = useState(null)

  if (isLoading) {
    return <div className="mts-loading">Loading model tiers…</div>
  }
  if (isError || !data) {
    return <div className="mts-error">Could not load model tiers.</div>
  }

  const { selected, tiers } = data

  const choose = (t) => {
    if (t.locked || t.code === selected) return
    setErrorMsg(null)
    setTierMutation.mutate(t.code, {
      onError: (e) => {
        setErrorMsg(e?.payload?.error?.extra?.message || e?.message || 'Could not update tier.')
      },
    })
  }

  return (
    <div className="mts">
      <div className="mts-head">
        <h4 className="mts-title">SRX Model Tier</h4>
        <p className="mts-sub">
          One choice drives every AI feature in the app — chat, thumbnails, SEO, titles. Higher
          tiers run deeper pipelines for more polished output.
        </p>
      </div>

      <div className="mts-grid" role="radiogroup" aria-label="Model tier">
        {tiers.map((t) => {
          const isActive = t.code === selected
          const isLocked = t.locked
          return (
            <button
              key={t.code}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${t.code} ${t.label}${isLocked ? ' (locked)' : ''}`}
              className={[
                'mts-card',
                isActive ? 'mts-card--active' : '',
                isLocked ? 'mts-card--locked' : '',
                setTierMutation.isPending && setTierMutation.variables === t.code
                  ? 'mts-card--saving'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => (isLocked ? (window.location.hash = 'pro') : choose(t))}
            >
              <div className="mts-card-head">
                <span className="mts-code">{t.code}</span>
                <span className={`mts-tag mts-tag--${t.label.toLowerCase()}`}>{t.label}</span>
              </div>
              <div className="mts-blurb">{t.blurb}</div>
              <div className="mts-foot">
                {isActive ? (
                  <span className="mts-active-pill">
                    <IconCheck /> Active
                  </span>
                ) : isLocked ? (
                  <span className="mts-locked-pill">
                    <IconLock /> {t.required_plan_label}
                  </span>
                ) : (
                  <span className="mts-switch-pill">Use this tier</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {errorMsg && (
        <div className="mts-error" role="alert">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
