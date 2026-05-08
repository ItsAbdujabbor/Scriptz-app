/**
 * ModelTierSelector — two pills (SRX-2 Pro / SRX-3 Max).
 *
 * Both tiers are available to every user — paywall + credit debit gate
 * actual generation, not the selector. Clicking either tier persists
 * immediately with optimistic UI.
 *
 * Tier mapping:
 *   SRX-2 Pro → gpt-image-1 · medium quality · 20 credits / thumbnail
 *   SRX-3 Max → gpt-image-1 · high   quality · 45 credits / thumbnail
 */
import { useState } from 'react'

import {
  useModelTierStateQuery,
  useSetModelTierMutation,
} from '../queries/modelTier/modelTierQueries'
import { SkeletonCard, SkeletonGroup } from './ui'
import './ModelTierSelector.css'

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
    return (
      <SkeletonGroup className="mts mts-loading" label="Loading model tiers">
        <div className="mts-grid">
          <SkeletonCard ratio="7 / 3" lines={2} />
          <SkeletonCard ratio="7 / 3" lines={2} />
        </div>
      </SkeletonGroup>
    )
  }
  if (isError || !data) {
    return <div className="mts-error">Could not load model tiers.</div>
  }

  const { selected, tiers } = data

  const choose = (t) => {
    if (t.code === selected) return
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
          return (
            <button
              key={t.code}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${t.code} ${t.label}`}
              className={[
                'mts-card',
                isActive ? 'mts-card--active' : '',
                setTierMutation.isPending && setTierMutation.variables === t.code
                  ? 'mts-card--saving'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => choose(t)}
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
