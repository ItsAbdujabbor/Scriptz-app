/**
 * ABTestPanel — drop-in tab panel for VideoOptimizeModal.
 *
 * Real-data A/B testing UI:
 *   • If no test: shows "Start A/B test" with variation-A capture from the
 *     current title/thumbnail.
 *   • If running (only A live): shows variation A stats + "Switch to B" form.
 *   • If running (A + B): shows side-by-side comparison, trend chart, winner.
 *   • Honest empty states ("Not enough data", "No clear winner").
 *   • SRX tier gated — Lite = basic, Pro = +trend chart, Ultra = +insights.
 *   • Plan gated server-side via `require_plan_feature("ab_testing")`.
 */
import { useState } from 'react'

import {
  useABTestsForVideoQuery,
  useABTestResultsQuery,
  useCreateABTestMutation,
  useSwitchABTestMutation,
  useCompleteABTestMutation,
} from '../queries/abTests/abTestsQueries'
import { useModelTierStateQuery } from '../queries/modelTier/modelTierQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useCostOf } from '../queries/billing/creditsQueries'
import { celebrate } from '../lib/celebrate'
import { InlineSpinner } from './ui'
import './ABTestPanel.css'

function formatCTR(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(2)}%`
}
function formatNum(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}
function formatHours(h) {
  if (h == null) return '—'
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null
  const map = {
    high: { label: 'High confidence', cls: 'abtp-conf abtp-conf--high' },
    medium: { label: 'Medium confidence', cls: 'abtp-conf abtp-conf--med' },
    low: { label: 'Low confidence', cls: 'abtp-conf abtp-conf--low' },
    insufficient: { label: 'Not enough data', cls: 'abtp-conf abtp-conf--none' },
  }
  const c = map[confidence] || map.insufficient
  return <span className={c.cls}>{c.label}</span>
}

/** Inline SVG line chart — CTR over time for A vs B. No dependencies. */
function TrendChart({ points }) {
  const rows = (points || []).filter((r) => r && (r.A?.ctr != null || r.B?.ctr != null))
  if (rows.length < 2) {
    return <div className="abtp-chart-empty">Trend will appear after two or more snapshots.</div>
  }
  const W = 520
  const H = 140
  const P = 16
  const xs = rows.map((r) => new Date(r.captured_at).getTime())
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const ctrs = rows.flatMap((r) => [r.A?.ctr, r.B?.ctr]).filter((v) => v != null)
  const y0 = 0
  const y1 = Math.max(0.01, ...(ctrs.length ? ctrs : [0.1]))
  const xScale = (t) => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * P)
  const yScale = (v) => H - P - ((v - y0) / (y1 - y0)) * (H - 2 * P)
  const pathFor = (slug) => {
    const pts = rows
      .filter((r) => r[slug]?.ctr != null)
      .map(
        (r) =>
          `${xScale(new Date(r.captured_at).getTime()).toFixed(1)},${yScale(r[slug].ctr).toFixed(1)}`
      )
    if (!pts.length) return ''
    return `M ${pts.join(' L ')}`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="abtp-chart" aria-label="CTR trend A vs B">
      {/* Grid */}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="rgba(255,255,255,0.08)" />
      <line x1={P} y1={P} x2={P} y2={H - P} stroke="rgba(255,255,255,0.08)" />
      {/* A line (indigo) */}
      <path d={pathFor('A')} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      {/* B line (violet) */}
      <path d={pathFor('B')} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
      {/* Y max label */}
      <text x={P + 4} y={P + 10} fill="rgba(229,229,231,0.45)" fontSize="10">
        {(y1 * 100).toFixed(1)}%
      </text>
      <text x={P + 4} y={H - P - 2} fill="rgba(229,229,231,0.45)" fontSize="10">
        0%
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
export function ABTestPanel({ video, channelId, currentTitle, currentThumbnailUrl }) {
  const videoId = video?.id
  const { canUse } = usePlanEntitlements()
  const { data: tierState } = useModelTierStateQuery()
  const tier = tierState?.selected || 'SRX-1'

  const { data: listData, isLoading: listLoading } = useABTestsForVideoQuery(videoId, channelId)
  const test =
    (listData?.items || []).find((t) => t.status === 'running') || (listData?.items || [])[0]
  const {
    data: results,
    isFetching: resultsFetching,
    refetch: refetchResults,
  } = useABTestResultsQuery(test?.id, { enabled: !!test?.id })

  const createMutation = useCreateABTestMutation()
  const switchMutation = useSwitchABTestMutation()
  const completeMutation = useCompleteABTestMutation()

  const [startError, setStartError] = useState(null)
  const [switchError, setSwitchError] = useState(null)

  // New-variation form state (for "Switch to B")
  const [titleB, setTitleB] = useState('')
  const [thumbUrlB, setThumbUrlB] = useState('')

  const handleStart = async () => {
    setStartError(null)
    try {
      await createMutation.mutateAsync({
        videoId,
        channelId,
        kind: 'thumbnail',
        variationA: {
          title: currentTitle || null,
          thumbnail_url: currentThumbnailUrl || null,
        },
      })
      celebrate({
        emoji: '🧪',
        title: 'A/B test started',
        subtitle: 'Run for a few hours before switching to B.',
        variant: 'success',
        confetti: false,
      })
    } catch (e) {
      setStartError(e?.payload?.error?.extra?.message || e?.message || 'Could not start test.')
    }
  }

  const handleSwitch = async () => {
    setSwitchError(null)
    try {
      await switchMutation.mutateAsync({
        testId: test.id,
        variationB: {
          title: titleB || null,
          thumbnail_url: thumbUrlB || null,
        },
      })
      setTitleB('')
      setThumbUrlB('')
      celebrate({
        emoji: '🔁',
        title: 'Switched to variation B',
        subtitle: "Give it time — we'll compare once both have enough data.",
        variant: 'success',
        confetti: false,
      })
    } catch (e) {
      setSwitchError(
        e?.payload?.error?.extra?.message || e?.message || 'Could not switch variation.'
      )
    }
  }

  // ── Plan gate: Creator+ only ──
  if (!canUse('ab_testing')) {
    return (
      <div className="abtp-root abtp-locked">
        <h4 className="abtp-h">A/B Testing</h4>
        <p className="abtp-muted">
          Compare two thumbnail or title variations with real YouTube impressions, CTR, and views.
          Creator plan and above.
        </p>
        <button
          type="button"
          className="abtp-upgrade"
          onClick={() => {
            window.location.hash = 'pro'
          }}
        >
          Upgrade to unlock
        </button>
      </div>
    )
  }

  if (listLoading) {
    return (
      <div className="abtp-root">
        <div className="abtp-muted">Loading A/B tests…</div>
      </div>
    )
  }

  // ── No active test — show start CTA ──
  if (!test) {
    return (
      <div className="abtp-root">
        <div className="abtp-head">
          <div>
            <h4 className="abtp-h">A/B Testing</h4>
            <p className="abtp-muted">
              Locks in the current thumbnail + title as "Variation A". After a few hours of real
              data, switch to "B" and we'll compare with honest statistical confidence.
            </p>
          </div>
          <span className="abtp-tier-pill">{tier}</span>
        </div>
        {startError && <div className="abtp-error">{startError}</div>}
        <StartCostHint />
        <button
          type="button"
          className="abtp-start"
          onClick={handleStart}
          disabled={createMutation.isPending || !videoId}
        >
          {createMutation.isPending ? (
            <span className="sk-btn-pending">
              <InlineSpinner size={12} />
              Starting…
            </span>
          ) : (
            'Start A/B test'
          )}
        </button>
      </div>
    )
  }

  const scopeMissing = !!results?.scope_missing
  const connectionMissing = !!results?.connection_missing
  const comparison = results?.comparison
  const variations = results?.variations || {}
  const varA = variations.A
  const varB = variations.B
  const hasB = !!varB
  const winner = comparison?.winner

  return (
    <div className="abtp-root">
      <div className="abtp-head">
        <div>
          <h4 className="abtp-h">
            A/B Test · <span className="abtp-pill">{test.status}</span>
          </h4>
          <p className="abtp-muted">
            Started {new Date(test.started_at).toLocaleDateString()} · Active: Variation{' '}
            {test.active_variation}
          </p>
        </div>
        <div className="abtp-head-actions">
          <span
            className="abtp-tier-pill"
            title={`${results?.srx_tier || tier} — analysis depth scales with tier`}
          >
            {results?.srx_tier || tier}
          </span>
          <button
            type="button"
            className="abtp-refresh"
            onClick={() => refetchResults()}
            disabled={resultsFetching}
            title="Pull a fresh snapshot from YouTube Analytics"
          >
            {resultsFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {connectionMissing && (
        <div className="abtp-warn">
          <strong>YouTube channel not connected.</strong> This test was started against a channel
          that isn't currently connected. Reconnect it in Settings to resume live snapshots — cached
          numbers are shown below.
        </div>
      )}
      {scopeMissing && !connectionMissing && (
        <div className="abtp-warn">
          <strong>Channel reconnect needed.</strong> This channel was authorized before the YouTube
          Analytics permission was added. Disconnect and reconnect your channel to read real
          impressions &amp; CTR.
        </div>
      )}

      {/* Variation cards */}
      <div className="abtp-vars">
        <VariationCard
          slug="A"
          v={varA}
          isWinner={winner === 'A'}
          isActive={test.active_variation === 'A'}
        />
        {hasB ? (
          <VariationCard
            slug="B"
            v={varB}
            isWinner={winner === 'B'}
            isActive={test.active_variation === 'B'}
          />
        ) : (
          <SwitchBPanel
            titleB={titleB}
            setTitleB={setTitleB}
            thumbUrlB={thumbUrlB}
            setThumbUrlB={setThumbUrlB}
            onSwitch={handleSwitch}
            pending={switchMutation.isPending}
            error={switchError}
          />
        )}
      </div>

      {/* Comparison summary */}
      {hasB && comparison && (
        <div className="abtp-summary">
          <div className="abtp-summary-row">
            <div className="abtp-summary-cell">
              <span className="abtp-label">CTR delta</span>
              <strong>
                {comparison.ctr_delta_pp != null
                  ? `${(comparison.ctr_delta_pp * 100).toFixed(2)} pp`
                  : '—'}
              </strong>
            </div>
            <div className="abtp-summary-cell">
              <span className="abtp-label">Views / hour — A vs B</span>
              <strong>
                {comparison.views_per_hour_a ?? '—'} vs {comparison.views_per_hour_b ?? '—'}
              </strong>
            </div>
            <div className="abtp-summary-cell">
              <span className="abtp-label">Confidence</span>
              <ConfidenceBadge confidence={comparison.confidence} />
            </div>
          </div>
          <div className="abtp-verdict">
            {comparison.enough_data ? (
              comparison.winner ? (
                <span className="abtp-verdict-win">
                  🏆 Variation <strong>{comparison.winner}</strong> wins
                </span>
              ) : (
                <span className="abtp-verdict-tie">No clear winner yet</span>
              )
            ) : (
              <span className="abtp-verdict-tie">Not enough data</span>
            )}
            {comparison.reason && <p className="abtp-reason">{comparison.reason}</p>}
          </div>
        </div>
      )}

      {/* Trend chart — Pro / Ultra only */}
      {results?.trend && results.trend.length > 0 && (
        <div className="abtp-trend">
          <div className="abtp-trend-head">
            <span className="abtp-label">CTR trend</span>
            <div className="abtp-legend">
              <span>
                <i className="abtp-swatch abtp-swatch--a" /> Variation A
              </span>
              <span>
                <i className="abtp-swatch abtp-swatch--b" /> Variation B
              </span>
            </div>
          </div>
          <TrendChart points={results.trend} />
        </div>
      )}

      {/* Ultra insights */}
      {results?.insights && results.insights.length > 0 && (
        <div className="abtp-insights">
          <span className="abtp-label">Why this result</span>
          <ul>
            {results.insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer actions */}
      {test.status === 'running' && hasB && (
        <div className="abtp-foot">
          <button
            type="button"
            className="abtp-complete"
            onClick={() => completeMutation.mutate(test.id)}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? (
              <span className="sk-btn-pending">
                <InlineSpinner size={12} />
                Completing…
              </span>
            ) : (
              'Mark test complete'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function VariationCard({ slug, v, isWinner, isActive }) {
  if (!v) return <div className="abtp-var abtp-var--empty">Variation {slug} not started</div>
  return (
    <div
      className={`abtp-var ${isWinner ? 'abtp-var--win' : ''} ${isActive ? 'abtp-var--active' : ''}`}
    >
      <div className="abtp-var-head">
        <span className="abtp-var-slug">{slug}</span>
        {isActive && <span className="abtp-var-live">LIVE</span>}
        {isWinner && <span className="abtp-var-winner">WINNER</span>}
      </div>
      {v.thumbnail_url && (
        <img src={v.thumbnail_url} alt={`Variation ${slug} thumbnail`} className="abtp-var-thumb" />
      )}
      {v.title && (
        <div className="abtp-var-title" title={v.title}>
          {v.title}
        </div>
      )}
      <div className="abtp-var-metrics">
        <div>
          <span className="abtp-label">CTR</span>
          <strong>{formatCTR(v.impression_ctr)}</strong>
        </div>
        <div>
          <span className="abtp-label">Views</span>
          <strong>{formatNum(v.views)}</strong>
        </div>
        <div>
          <span className="abtp-label">Impressions</span>
          <strong>{formatNum(v.impressions)}</strong>
        </div>
        <div>
          <span className="abtp-label">Views/hr</span>
          <strong>{v.views_per_hour ?? '—'}</strong>
        </div>
        <div>
          <span className="abtp-label">Running</span>
          <strong>{formatHours(v.hours_running)}</strong>
        </div>
      </div>
    </div>
  )
}

function SwitchBPanel({ titleB, setTitleB, thumbUrlB, setThumbUrlB, onSwitch, pending, error }) {
  return (
    <div className="abtp-var abtp-var--switch">
      <div className="abtp-var-head">
        <span className="abtp-var-slug">B</span>
        <span className="abtp-var-live abtp-var-live--ghost">Ready to test</span>
      </div>
      <label className="abtp-field">
        <span className="abtp-label">New title</span>
        <input
          type="text"
          value={titleB}
          onChange={(e) => setTitleB(e.target.value)}
          placeholder="Paste the B-variant title (applied on YouTube first)"
          maxLength={120}
        />
      </label>
      <label className="abtp-field">
        <span className="abtp-label">New thumbnail URL</span>
        <input
          type="url"
          value={thumbUrlB}
          onChange={(e) => setThumbUrlB(e.target.value)}
          placeholder="https://…"
        />
      </label>
      {error && <div className="abtp-error">{error}</div>}
      <button
        type="button"
        className="abtp-switch-btn"
        onClick={onSwitch}
        disabled={pending || (!titleB && !thumbUrlB)}
      >
        {pending ? 'Switching…' : 'Switch to variation B'}
      </button>
      <p className="abtp-muted abtp-muted--tiny">
        Apply the new title/thumbnail on YouTube first, then click Switch — we'll start a fresh
        metrics window for variation B.
      </p>
    </div>
  )
}

function StartCostHint() {
  const { unit, tier } = useCostOf('ab_test_create', 1)
  if (!unit) return null
  return (
    <p className="abtp-muted abtp-muted--tiny">
      ⚡ This test costs <strong>{unit} credits</strong> to start on {tier}. Rotations,
      promote-winner, and auto-apply are free.
    </p>
  )
}
