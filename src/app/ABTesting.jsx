/**
 * ABTesting — top-level page for multi-variant YouTube A/B tests.
 *
 * Internal routing via the URL hash:
 *   #ab-testing             → list view
 *   #ab-testing/new         → create wizard
 *   #ab-testing/{id}        → detail view
 *
 * Real data only — every metric comes from /api/ab-tests/{id} which refreshes
 * a YouTube Analytics snapshot server-side. No mocks, no simulated numbers.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars

import { useYoutubeVideosList } from '../queries/youtube/videosQueries'
import { useOnboardingStore } from '../stores/onboardingStore'
import { useModelTierStateQuery } from '../queries/modelTier/modelTierQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import {
  useAllABTestsQuery,
  useABTestResultsQuery,
  useCreateABTestMutation,
  useAddVariationMutation,
  useActivateVariantMutation,
  usePromoteWinnerMutation,
  usePauseABTestMutation,
  useResumeABTestMutation,
  useCompleteABTestMutation,
  useDeleteABTestMutation,
  useRestoreOriginalMutation,
  useLoadInsightsMutation,
} from '../queries/abTests/abTestsQueries'
import { celebrate } from '../lib/celebrate'
import { useCostOf, useCreditsQuery } from '../queries/billing/creditsQueries'

import './Optimize.css'
import './ABTesting.css'
import {
  SegmentedTabs,
  SelectPill,
  InlineSpinner,
  SkeletonCard,
  SkeletonGroup,
  SkeletonText,
  SkeletonVideoRow,
} from '../components/ui'

const TIER_CAP = { 'SRX-1': 2, 'SRX-2': 5, 'SRX-3': 5 }

// ─────────────────────────────────────────────────────────────────────────────
// Hash parser
// ─────────────────────────────────────────────────────────────────────────────
function parseSubRoute() {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '')
  const rest = h
    .replace(/^ab-testing\/?/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
  if (!rest) return { view: 'list' }
  if (rest === 'new') return { view: 'new' }
  const id = parseInt(rest, 10)
  if (!Number.isNaN(id)) return { view: 'detail', testId: id }
  return { view: 'list' }
}

function useSubRoute() {
  const [route, setRoute] = useState(parseSubRoute)
  useEffect(() => {
    const onHash = () => setRoute(parseSubRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

function goTo(path) {
  window.location.hash = `ab-testing${path ? `/${path}` : ''}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function pct(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(2)}%`
}
function fmtNum(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}
function hoursLabel(h) {
  if (h == null) return '—'
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Root page
// ─────────────────────────────────────────────────────────────────────────────
export function ABTesting() {
  const route = useSubRoute()
  const { canUse } = usePlanEntitlements()
  const locked = !canUse('ab_testing')

  // Creating / viewing a test is gated — bounce back to list when locked so
  // the user can't deep-link past the paywall. The CTA in the list
  // navigates to #pro on click when locked.
  useEffect(() => {
    if (locked && (route.view === 'new' || route.view === 'detail')) {
      if (typeof window !== 'undefined') window.location.hash = 'ab-testing'
    }
  }, [locked, route.view])
  if (locked && (route.view === 'new' || route.view === 'detail')) {
    return <ExperimentList locked />
  }

  if (route.view === 'new') return <CreateExperiment />
  if (route.view === 'detail') return <ExperimentDetail testId={route.testId} />
  return <ExperimentList locked={locked} />
}

function ProCrownBadge() {
  return (
    <span
      className="abt-pro-crown"
      aria-label="Creator plan feature"
      title="Creator plan and above"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 19h18v2H3v-2Zm0-2 2-9 5 4 2-7 2 7 5-4 2 9H3Z" />
      </svg>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// List view
// ─────────────────────────────────────────────────────────────────────────────
function ExperimentList({ locked = false }) {
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('abt.viewMode') || 'grid'
    } catch {
      return 'grid'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('abt.viewMode', viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  // Don't fire the listing query when the user can't use the feature — keep
  // the header/tabs/filters visible but show the upsell empty state below.
  const { data, isLoading, isError, error } = useAllABTestsQuery({
    statusFilter,
    enabled: !locked,
  })
  const items = locked ? [] : data?.items || []

  const handleNewClick = () => {
    if (locked) {
      window.location.hash = 'pro'
      return
    }
    goTo('new')
  }

  return (
    <div className="abt-page optimize-page">
      <div className="optimize-top-bar">
        <div className="optimize-heading-wrap">
          <h1 className="optimize-heading">A/B Testing</h1>
        </div>
      </div>

      <div className="optimize-divider" aria-hidden />

      <div className="optimize-filters-bar">
        <div className="abt-filters-left">
          <SegmentedTabs
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="View mode"
            layoutId="abt-view-toggle"
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
            ]}
          />
          <SelectPill
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            options={[
              { value: '', label: 'All tests' },
              { value: 'running', label: 'Running' },
              { value: 'paused', label: 'Paused' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        </div>
        <div className="optimize-filters-right">
          <button
            type="button"
            className={`abt-pro-cta ${locked ? 'abt-pro-cta--locked' : ''}`}
            onClick={handleNewClick}
            title={locked ? 'Creator plan — upgrade to unlock' : undefined}
          >
            + Create
            {locked && <ProCrownBadge />}
          </button>
        </div>
      </div>

      <div className="optimize-divider optimize-divider--below-filters" aria-hidden />

      {isError && !locked && (
        <div className="abt-error">{String(error?.message || 'Could not load experiments.')}</div>
      )}
      {isLoading && !locked && (
        <SkeletonGroup
          className={viewMode === 'grid' ? 'abt-grid' : 'abt-list'}
          label="Loading A/B experiments"
        >
          {Array.from({ length: viewMode === 'grid' ? 6 : 3 }).map((_, i) =>
            viewMode === 'grid' ? (
              <SkeletonCard key={i} ratio="16 / 9" lines={2} />
            ) : (
              <SkeletonVideoRow key={i} />
            )
          )}
        </SkeletonGroup>
      )}

      {!isLoading && items.length === 0 && (
        <div className="optimize-empty-card abt-empty-card">
          <span className="optimize-empty-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 3v6l-4 8a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 17l-4-8V3" />
              <path d="M9 3h6" />
              <path d="M9 13h6" />
            </svg>
          </span>
          <h3 className="optimize-empty-title">No experiments yet</h3>
          <p className="optimize-empty-desc">
            Run up to five thumbnail or title variants on a real YouTube video and see real CTR +
            views per variant.
          </p>
        </div>
      )}

      {!locked && !isLoading && items.length > 0 && viewMode === 'grid' && (
        <div className="abt-grid" role="list">
          {items.map((t) => (
            <ExperimentGridCard key={t.id} test={t} />
          ))}
        </div>
      )}

      {!locked && !isLoading && items.length > 0 && viewMode === 'list' && (
        <ul className="abt-list" role="list">
          {items.map((t) => (
            <ExperimentRow key={t.id} test={t} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ExperimentRow({ test }) {
  const activeVar = test.variations?.find((v) => v.slug === test.active_variation)
  const totalVars = (test.variations || []).length
  const statusCls = `abt-pill abt-pill--${test.status}`
  return (
    <li className="abt-row" onClick={() => goTo(String(test.id))}>
      <div className="abt-row-thumb">
        {activeVar?.thumbnail_url ? (
          <img src={activeVar.thumbnail_url} alt="" />
        ) : (
          <div className="abt-row-thumb-fallback">🎬</div>
        )}
      </div>
      <div className="abt-row-main">
        <div className="abt-row-top">
          <span className={statusCls}>{test.status}</span>
          <span className="abt-pill abt-pill--kind">{test.kind}</span>
          <span className="abt-pill abt-pill--kind">{test.mode}</span>
          <span className="abt-pill abt-pill--mono">{totalVars} variants</span>
          {test.winner_slug && (
            <span className="abt-pill abt-pill--win">Winner: {test.winner_slug}</span>
          )}
        </div>
        <div className="abt-row-title">
          {activeVar?.title || `Test #${test.id} · video ${test.video_id}`}
        </div>
        <div className="abt-row-meta">
          Started {new Date(test.started_at).toLocaleDateString()} · Active variant{' '}
          {test.active_variation}
        </div>
      </div>
      <button
        type="button"
        className="abt-row-open"
        onClick={(e) => {
          e.stopPropagation()
          goTo(String(test.id))
        }}
      >
        Open →
      </button>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create wizard
// ─────────────────────────────────────────────────────────────────────────────
function CreateExperiment() {
  const { youtube } = useOnboardingStore()
  const channelId = youtube?.channelId || youtube?.channel_id || null
  const { data: tierState } = useModelTierStateQuery()
  const tier = tierState?.selected || 'SRX-1'
  const cap = TIER_CAP[tier] || 2

  const [kind, setKind] = useState('thumbnail')
  const [mode, setMode] = useState('manual')
  const [rotationHours, setRotationHours] = useState(24)
  const [autoApply, setAutoApply] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState(null)
  // Selected video object kept on a ref-like setter for downstream callers;
  // value itself isn't read in render so prefix suppresses unused-vars.
  const [, setSelectedVideo] = useState(null)
  const [variants, setVariants] = useState([{ title: '', thumbnail_url: '' }])
  const [err, setErr] = useState(null)

  const createMut = useCreateABTestMutation()

  // Videos (for picker)
  const videosQ = useYoutubeVideosList({
    channelId,
    page: 1,
    perPage: 30,
    sort: 'published_at',
    videoType: 'videos',
    enabled: !!channelId,
  })
  const videos = videosQ.data?.items || []

  const addVariant = () => {
    if (variants.length >= cap) return
    setVariants((v) => [...v, { title: '', thumbnail_url: '' }])
  }
  const removeVariant = (i) => setVariants((v) => v.filter((_, idx) => idx !== i))
  const updateVariant = (i, patch) =>
    setVariants((v) => v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const onPickFile = async (i, file) => {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      updateVariant(i, { thumbnail_url: dataUrl })
    } catch {
      setErr('Could not read that image file.')
    }
  }

  const onSelectVideo = (v) => {
    setSelectedVideoId(v.id)
    setSelectedVideo(v)
    // Prefill variant A with current title + thumbnail.
    setVariants((vs) => {
      const copy = [...vs]
      copy[0] = {
        title: v.title || '',
        thumbnail_url: v.thumbnail_url || v.thumbnail || '',
      }
      return copy
    })
  }

  const canSubmit =
    selectedVideoId &&
    channelId &&
    variants.length >= 1 &&
    variants.every((v) => (kind === 'title' ? !!v.title : true))

  const handleSubmit = async () => {
    setErr(null)
    if (!canSubmit) {
      setErr('Pick a video and fill in every variant.')
      return
    }
    try {
      const created = await createMut.mutateAsync({
        video_id: selectedVideoId,
        channel_id: channelId,
        kind,
        mode,
        rotation_interval_hours: mode === 'automatic' ? rotationHours : null,
        auto_apply_winner: autoApply,
        variations: variants.map((v) => ({
          title: v.title || null,
          thumbnail_url: v.thumbnail_url || null,
        })),
      })
      celebrate({
        emoji: '🧪',
        title: 'Experiment started',
        subtitle: `${variants.length} variants tracking real YouTube data.`,
        variant: 'success',
        confetti: true,
      })
      goTo(String(created.id))
    } catch (e) {
      setErr(e?.payload?.detail || e?.message || 'Could not create experiment.')
    }
  }

  return (
    <div className="abt-page">
      <header className="abt-header">
        <div>
          <button type="button" className="abt-back" onClick={() => goTo('')}>
            ← Back
          </button>
          <h1 className="abt-h1">New experiment</h1>
          <p className="abt-sub">
            Your plan ({tier}) allows up to {cap} variants per test.
          </p>
        </div>
      </header>

      {/* Step 1: video */}
      <section className="abt-step">
        <h3 className="abt-step-h">1. Pick a video</h3>
        {!channelId && <div className="abt-warn">Connect a YouTube channel first in Settings.</div>}
        {videosQ.isLoading && (
          <SkeletonGroup className="abt-video-grid" label="Loading videos">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} ratio="16 / 9" lines={1} />
            ))}
          </SkeletonGroup>
        )}
        {videos.length > 0 && (
          <div className="abt-video-grid">
            {videos.slice(0, 12).map((v) => (
              <button
                key={v.id}
                type="button"
                className={`abt-video-card ${selectedVideoId === v.id ? 'is-selected' : ''}`}
                onClick={() => onSelectVideo(v)}
              >
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" />
                ) : (
                  <div className="abt-video-fallback">🎬</div>
                )}
                <span className="abt-video-title" title={v.title}>
                  {v.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Step 2: experiment type */}
      <section className="abt-step">
        <h3 className="abt-step-h">2. Experiment type</h3>
        <div className="abt-radio-row">
          {['thumbnail', 'title', 'both'].map((k) => (
            <label key={k} className={`abt-radio ${kind === k ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <span>
                {k === 'both' ? 'Thumbnail + title' : k[0].toUpperCase() + k.slice(1) + ' only'}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Step 3: variants */}
      <section className="abt-step">
        <div className="abt-step-head">
          <h3 className="abt-step-h">
            3. Variants ({variants.length}/{cap})
          </h3>
          {variants.length < cap && (
            <button type="button" className="abt-btn abt-btn--ghost" onClick={addVariant}>
              + Add variant
            </button>
          )}
        </div>
        <div className="abt-variants-grid">
          {variants.map((v, i) => (
            <div key={i} className="abt-variant-card">
              <div className="abt-variant-head">
                <span className="abt-variant-slug">{String.fromCharCode(65 + i)}</span>
                {i === 0 && (
                  <span
                    className="abt-pill abt-pill--orig"
                    title="Captured as your original. Always preserved."
                  >
                    🛡️ ORIGINAL
                  </span>
                )}
                {i > 0 && (
                  <button
                    type="button"
                    className="abt-variant-remove"
                    onClick={() => removeVariant(i)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
              {(kind === 'thumbnail' || kind === 'both') && (
                <>
                  {v.thumbnail_url ? (
                    <img className="abt-variant-thumb" src={v.thumbnail_url} alt="" />
                  ) : (
                    <div className="abt-variant-thumb abt-variant-thumb--empty">No thumbnail</div>
                  )}
                  <label className="abt-file-btn">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onPickFile(i, e.target.files?.[0])}
                      hidden
                    />
                    Upload thumbnail
                  </label>
                  <input
                    type="url"
                    placeholder="Or paste an image URL"
                    className="abt-input"
                    value={v.thumbnail_url?.startsWith('data:') ? '' : v.thumbnail_url || ''}
                    onChange={(e) => updateVariant(i, { thumbnail_url: e.target.value })}
                  />
                </>
              )}
              {(kind === 'title' || kind === 'both') && (
                <input
                  type="text"
                  placeholder="Variant title"
                  className="abt-input"
                  maxLength={120}
                  value={v.title || ''}
                  onChange={(e) => updateVariant(i, { title: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Step 4: mode */}
      <section className="abt-step">
        <h3 className="abt-step-h">4. Mode</h3>
        <div className="abt-radio-row">
          <label className={`abt-radio ${mode === 'manual' ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="manual"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            <span>Manual — you rotate variants</span>
          </label>
          <label className={`abt-radio ${mode === 'automatic' ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="automatic"
              checked={mode === 'automatic'}
              onChange={() => setMode('automatic')}
            />
            <span>Automatic — rotate on a schedule</span>
          </label>
        </div>
        {mode === 'automatic' && (
          <div className="abt-field-row">
            <label className="abt-field">
              <span className="abt-label">Rotate every (hours)</span>
              <input
                type="number"
                min={1}
                max={720}
                className="abt-input"
                value={rotationHours}
                onChange={(e) => setRotationHours(Math.max(1, parseInt(e.target.value || '1', 10)))}
              />
            </label>
            <label className="abt-toggle">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
              />
              <span>Auto-apply the winner on YouTube when confidence is high</span>
            </label>
          </div>
        )}
      </section>

      {err && <div className="abt-error">{err}</div>}
      <CreateCostSummary variantCount={variants.length} />
      <div className="abt-step-footer">
        <button type="button" className="abt-btn abt-btn--ghost" onClick={() => goTo('')}>
          Cancel
        </button>
        <button
          type="button"
          className="abt-btn abt-btn--primary"
          disabled={!canSubmit || createMut.isPending}
          onClick={handleSubmit}
        >
          {createMut.isPending ? (
            <span className="sk-btn-pending">
              <InlineSpinner size={12} />
              Starting…
            </span>
          ) : (
            'Start experiment'
          )}
        </button>
      </div>
    </div>
  )
}

function CreateCostSummary({ variantCount }) {
  const { unit: createCost, tier } = useCostOf('ab_test_create', 1)
  const { unit: variantCost } = useCostOf('ab_test_variant', 1)
  const extras = Math.max(0, (variantCount || 0) - 2)
  const total = createCost + extras * variantCost
  const { data: bal } = useCreditsQuery()
  const remaining = bal
    ? Number(bal.subscription_credits || 0) + Number(bal.permanent_credits || 0)
    : null
  const insufficient = remaining != null && remaining < total

  return (
    <div className={`abt-cost-summary ${insufficient ? 'abt-cost-summary--warn' : ''}`}>
      <div className="abt-cost-summary-main">
        <span className="abt-cost-summary-icon" aria-hidden>
          ⚡
        </span>
        <div>
          <strong>{total} credits</strong> to start
          <span className="abt-cost-summary-detail">
            {createCost} base
            {extras > 0 ? ` + ${extras} × ${variantCost} for extra variants` : ''}
            {` · ${tier}`}
          </span>
        </div>
      </div>
      {remaining != null && (
        <span className="abt-cost-summary-balance">
          You have <strong>{remaining.toLocaleString('en-US')}</strong> credits
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────────────────────────────────────────
function ExperimentDetail({ testId }) {
  const {
    data: results,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useABTestResultsQuery(testId, { enabled: !!testId })
  const pauseMut = usePauseABTestMutation()
  const resumeMut = useResumeABTestMutation()
  const completeMut = useCompleteABTestMutation()
  const deleteMut = useDeleteABTestMutation()
  const addVariantMut = useAddVariationMutation()
  const activateMut = useActivateVariantMutation()
  const promoteMut = usePromoteWinnerMutation()
  const restoreMut = useRestoreOriginalMutation()
  const insightsMut = useLoadInsightsMutation()
  const { unit: insightsCost } = useCostOf('ab_test_insights', 1)

  const [showAdd, setShowAdd] = useState(false)
  const [newVariant, setNewVariant] = useState({ title: '', thumbnail_url: '' })
  const [confirmKind, setConfirmKind] = useState(null) // 'restore' | 'delete' | null
  const [toastErr, setToastErr] = useState('')

  const variations = results?.variations || {}
  const ranking = results?.comparison?.ranking || []
  const winnerSlug = results?.comparison?.winner || results?.winner_slug || null

  const handleActivate = useCallback(
    async (slug) => {
      try {
        await activateMut.mutateAsync({ testId, slug })
        celebrate({
          emoji: '🔁',
          title: `Switched to ${slug}`,
          subtitle: 'YouTube updated; a new window just opened.',
          variant: 'success',
        })
      } catch (e) {
        setToastErr(e?.payload?.detail || e?.message || 'Could not switch variant')
      }
    },
    [testId, activateMut]
  )

  const handlePromote = useCallback(
    async (slug = null) => {
      try {
        await promoteMut.mutateAsync({ testId, slug })
        celebrate({
          emoji: '🏆',
          title: 'Winner applied',
          subtitle: 'YouTube now shows the best variant.',
          variant: 'success',
          confetti: true,
        })
      } catch (e) {
        setToastErr(e?.payload?.detail || e?.message || 'Could not apply winner')
      }
    },
    [testId, promoteMut]
  )

  const handleRestoreOriginal = useCallback(async () => {
    try {
      await restoreMut.mutateAsync(testId)
      celebrate({
        emoji: '🛡️',
        title: 'Original restored',
        subtitle: 'Your video is back to its original packaging.',
        variant: 'success',
      })
      setConfirmKind(null)
    } catch (e) {
      setToastErr(e?.payload?.detail || e?.message || 'Could not restore original')
      setConfirmKind(null)
    }
  }, [testId, restoreMut])

  const handleDelete = useCallback(async () => {
    try {
      await deleteMut.mutateAsync(testId)
      goTo('')
    } catch (e) {
      setToastErr(e?.payload?.detail || e?.message || 'Could not delete experiment')
      setConfirmKind(null)
    }
  }, [testId, deleteMut])

  const handleAddVariant = useCallback(async () => {
    try {
      await addVariantMut.mutateAsync({
        testId,
        variation: {
          title: newVariant.title || null,
          thumbnail_url: newVariant.thumbnail_url || null,
        },
      })
      setNewVariant({ title: '', thumbnail_url: '' })
      setShowAdd(false)
    } catch (e) {
      setToastErr(e?.payload?.detail || e?.message || 'Could not add variant')
    }
  }, [testId, addVariantMut, newVariant])

  const onPickFile = async (file) => {
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setNewVariant((v) => ({ ...v, thumbnail_url: dataUrl }))
  }

  const variantCount = Object.keys(variations).length
  const tier = results?.srx_tier || 'SRX-1'
  const cap = TIER_CAP[tier] || 2
  const canAddMore = variantCount < cap && results?.status === 'running'

  if (isLoading) {
    return (
      <div className="abt-page">
        <SkeletonGroup label="Loading experiment">
          <SkeletonCard ratio="5 / 2" lines={2} />
          <SkeletonText lines={2} lineHeight={14} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            <SkeletonCard ratio="16 / 9" lines={2} />
            <SkeletonCard ratio="16 / 9" lines={2} />
          </div>
        </SkeletonGroup>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="abt-page">
        <div className="abt-error">{String(error?.message || 'Failed to load experiment')}</div>
        <button type="button" className="abt-btn abt-btn--ghost" onClick={() => goTo('')}>
          ← Back to list
        </button>
      </div>
    )
  }
  if (!results) return null

  return (
    <div className="abt-page">
      <header className="abt-header">
        <div>
          <button type="button" className="abt-back" onClick={() => goTo('')}>
            ← Back to all experiments
          </button>
          <h1 className="abt-h1">Experiment #{results.test_id}</h1>
          <p className="abt-sub">
            <span className={`abt-pill abt-pill--${results.status}`}>{results.status}</span>
            <span className="abt-pill abt-pill--kind">{results.mode}</span>
            <span className="abt-pill abt-pill--mono">{tier}</span>
            <span className="abt-pill abt-pill--mono">Active: {results.active_variation}</span>
            {results.rotation_interval_hours && (
              <span className="abt-pill abt-pill--mono">
                Rotates every {results.rotation_interval_hours}h
              </span>
            )}
          </p>
        </div>
        <div className="abt-header-actions">
          <button
            type="button"
            className="abt-btn abt-btn--ghost"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <span className="sk-btn-pending">
                <InlineSpinner size={12} />
                Refreshing…
              </span>
            ) : (
              'Refresh'
            )}
          </button>
          {tier === 'SRX-3' && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => insightsMut.mutate(testId)}
              disabled={insightsMut.isPending}
              title={`Charges ${insightsCost} credits on Ultra`}
            >
              {insightsMut.isPending ? (
                <span className="sk-btn-pending">
                  <InlineSpinner size={12} />
                  Analyzing…
                </span>
              ) : (
                `💡 AI Insights (${insightsCost} cr)`
              )}
            </button>
          )}
          {results.status !== 'completed' && results.active_variation !== 'A' && (
            <button
              type="button"
              className="abt-btn abt-btn--restore"
              onClick={() => setConfirmKind('restore')}
              disabled={restoreMut.isPending}
              title="Re-apply the original title + thumbnail to YouTube"
            >
              {restoreMut.isPending ? (
                <span className="sk-btn-pending">
                  <InlineSpinner size={12} />
                  Restoring…
                </span>
              ) : (
                '🛡️ Restore original'
              )}
            </button>
          )}
          {results.status === 'running' && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => pauseMut.mutate(testId)}
              disabled={pauseMut.isPending}
            >
              Pause
            </button>
          )}
          {results.status === 'paused' && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => resumeMut.mutate(testId)}
              disabled={resumeMut.isPending}
            >
              Resume
            </button>
          )}
          {results.status !== 'completed' && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => completeMut.mutate(testId)}
              disabled={completeMut.isPending}
            >
              Complete
            </button>
          )}
          <button
            type="button"
            className="abt-btn abt-btn--danger"
            onClick={() => setConfirmKind('delete')}
            disabled={deleteMut.isPending}
          >
            Delete
          </button>
        </div>
      </header>

      <ToastInline tone="error" onDismiss={() => setToastErr('')}>
        {toastErr}
      </ToastInline>

      <ConfirmDialog
        open={confirmKind === 'restore'}
        title="Restore original?"
        message="This re-applies the ORIGINAL title and thumbnail on YouTube. The active variant rotates back to A."
        confirmLabel="Restore original"
        onClose={() => setConfirmKind(null)}
        onConfirm={handleRestoreOriginal}
        loading={restoreMut.isPending}
      />

      <ConfirmDialog
        open={confirmKind === 'delete'}
        title="Delete this experiment?"
        message="The experiment and its entire history will be removed. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setConfirmKind(null)}
        onConfirm={handleDelete}
        loading={deleteMut.isPending}
      />

      {results.connection_missing && (
        <div className="abt-warn">
          <strong>YouTube channel not connected.</strong> Reconnect it in Settings to resume live
          snapshots — cached numbers are shown below.
        </div>
      )}
      {results.scope_missing && !results.connection_missing && (
        <div className="abt-warn">
          <strong>Channel reconnect needed.</strong> This channel was authorized before YouTube
          Analytics permission was added.
        </div>
      )}

      {/* Comparison summary */}
      <section className="abt-section">
        <h3 className="abt-step-h">Summary</h3>
        <div className="abt-summary-grid">
          <SummaryCell label="Ranking" value={ranking.length ? ranking.join(' > ') : '—'} />
          <SummaryCell
            label="CTR delta"
            value={
              results.comparison?.ctr_delta_pp != null
                ? `${(results.comparison.ctr_delta_pp * 100).toFixed(2)} pp`
                : '—'
            }
          />
          <SummaryCell
            label="Confidence"
            value={<ConfidenceBadge c={results.comparison?.confidence} />}
          />
          <SummaryCell
            label="p-value"
            value={
              results.comparison?.p_value != null ? results.comparison.p_value.toFixed(4) : '—'
            }
          />
        </div>
        <p className="abt-muted abt-verdict">{results.comparison?.reason || 'Gathering data…'}</p>
        {winnerSlug && results.status !== 'completed' && (
          <button
            type="button"
            className="abt-btn abt-btn--primary"
            onClick={() => handlePromote(winnerSlug)}
            disabled={promoteMut.isPending}
          >
            {promoteMut.isPending ? (
              <span className="sk-btn-pending">
                <InlineSpinner size={12} />
                Applying…
              </span>
            ) : (
              `Apply winner (${winnerSlug}) to YouTube`
            )}
          </button>
        )}
      </section>

      {/* Variants grid */}
      <section className="abt-section">
        <div className="abt-step-head">
          <h3 className="abt-step-h">
            Variants ({variantCount}/{cap})
          </h3>
          {canAddMore && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => setShowAdd(true)}
            >
              + Add variant
            </button>
          )}
        </div>
        <div className="abt-variants-grid">
          {Object.values(variations).map((v) => (
            <VariantCardFull
              key={v.slug}
              v={v}
              isOriginal={v.slug === 'A'}
              isWinner={v.slug === winnerSlug}
              isActive={v.is_active}
              canActivate={results.status === 'running' && !v.is_active}
              onActivate={() => handleActivate(v.slug)}
              onPromote={() => handlePromote(v.slug)}
              activating={activateMut.isPending}
              promoting={promoteMut.isPending}
            />
          ))}
          {showAdd && (
            <div className="abt-variant-card abt-variant-card--form">
              <div className="abt-variant-head">
                <span className="abt-variant-slug">New</span>
                <button
                  type="button"
                  className="abt-variant-remove"
                  onClick={() => setShowAdd(false)}
                >
                  ×
                </button>
              </div>
              {newVariant.thumbnail_url ? (
                <img className="abt-variant-thumb" src={newVariant.thumbnail_url} alt="" />
              ) : (
                <div className="abt-variant-thumb abt-variant-thumb--empty">No thumbnail</div>
              )}
              <label className="abt-file-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                  hidden
                />
                Upload thumbnail
              </label>
              <input
                type="text"
                placeholder="Variant title (optional)"
                className="abt-input"
                maxLength={120}
                value={newVariant.title}
                onChange={(e) => setNewVariant((v) => ({ ...v, title: e.target.value }))}
              />
              <button
                type="button"
                className="abt-btn abt-btn--primary"
                onClick={handleAddVariant}
                disabled={addVariantMut.isPending}
              >
                {addVariantMut.isPending ? (
                  <span className="sk-btn-pending">
                    <InlineSpinner size={12} />
                    Saving…
                  </span>
                ) : (
                  'Add variant'
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Predicted lift */}
      {results.lift?.available && (
        <section className="abt-section abt-lift">
          <h3 className="abt-step-h">Predicted lift (next 30 days)</h3>
          <div className="abt-summary-grid">
            <SummaryCell
              label="CTR lift"
              value={
                results.lift.ctr_lift_pct != null
                  ? `+${results.lift.ctr_lift_pct.toFixed(1)}%`
                  : '—'
              }
            />
            <SummaryCell
              label="Extra views vs baseline"
              value={
                results.lift.delta_views_30d != null
                  ? `+${fmtNum(results.lift.delta_views_30d)}`
                  : '—'
              }
            />
            <SummaryCell
              label="Projected views (winner)"
              value={
                results.lift.projected_views_30d != null
                  ? fmtNum(results.lift.projected_views_30d)
                  : '—'
              }
            />
            <SummaryCell
              label="Confidence"
              value={<ConfidenceBadge c={results.lift.confidence} />}
            />
          </div>
          <p className="abt-muted">
            Extrapolated from the leader's current views/hour and CTR vs the weakest variant. Honest
            projection — keep the test running for tighter numbers.
          </p>
        </section>
      )}

      {/* Time-window CTR */}
      {results.windowed && Object.keys(results.windowed).length > 0 && (
        <section className="abt-section">
          <h3 className="abt-step-h">CTR by time window</h3>
          <WindowedTable windowed={results.windowed} slugs={Object.keys(variations)} />
        </section>
      )}

      {/* Trend chart */}
      {results.trend && results.trend.length > 1 && (
        <section className="abt-section">
          <h3 className="abt-step-h">CTR over time</h3>
          <TrendChartN trend={results.trend} slugs={Object.keys(variations)} />
        </section>
      )}

      {/* Insights */}
      {results.insights && results.insights.length > 0 && (
        <section className="abt-section abt-insights">
          <h3 className="abt-step-h">Why this result</h3>
          <ul>
            {results.insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SummaryCell({ label, value }) {
  return (
    <div className="abt-summary-cell">
      <span className="abt-label">{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  )
}

function ConfidenceBadge({ c }) {
  if (!c) return '—'
  const map = {
    high: 'abt-conf abt-conf--high',
    medium: 'abt-conf abt-conf--med',
    low: 'abt-conf abt-conf--low',
    insufficient: 'abt-conf abt-conf--none',
  }
  const label = { high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Not enough' }
  return <span className={map[c] || map.insufficient}>{label[c] || c}</span>
}

function VariantCardFull({
  v,
  isOriginal,
  isWinner,
  isActive,
  canActivate,
  onActivate,
  onPromote,
  activating,
  promoting,
}) {
  return (
    <div
      className={`abt-variant-card ${isOriginal ? 'is-original' : ''} ${isWinner ? 'is-winner' : ''} ${isActive ? 'is-active' : ''}`}
    >
      <div className="abt-variant-head">
        <span className="abt-variant-slug">{v.slug}</span>
        {isOriginal && (
          <span
            className="abt-pill abt-pill--orig"
            title="Your video's original title and thumbnail. Always preserved — never deleted."
          >
            🛡️ ORIGINAL
          </span>
        )}
        {isActive && <span className="abt-pill abt-pill--live">LIVE</span>}
        {isWinner && <span className="abt-pill abt-pill--win">WINNER</span>}
      </div>
      {v.thumbnail_url ? (
        <img className="abt-variant-thumb" src={v.thumbnail_url} alt="" />
      ) : (
        <div className="abt-variant-thumb abt-variant-thumb--empty">No thumbnail</div>
      )}
      {v.title && (
        <div className="abt-variant-title" title={v.title}>
          {v.title}
        </div>
      )}
      <div className="abt-variant-metrics">
        <Metric label="CTR" value={pct(v.impression_ctr)} />
        <Metric label="Views" value={fmtNum(v.views)} />
        <Metric label="Impressions" value={fmtNum(v.impressions)} />
        <Metric label="Views/hr" value={v.views_per_hour ?? '—'} />
        <Metric label="Window" value={hoursLabel(v.hours_running)} />
      </div>
      <div className="abt-variant-actions">
        {canActivate && (
          <button
            type="button"
            className="abt-btn abt-btn--ghost"
            onClick={onActivate}
            disabled={activating}
          >
            {activating ? 'Switching…' : 'Activate'}
          </button>
        )}
        <button
          type="button"
          className="abt-btn abt-btn--primary"
          onClick={onPromote}
          disabled={promoting}
        >
          {promoting ? (
            <span className="sk-btn-pending">
              <InlineSpinner size={12} />
              Applying…
            </span>
          ) : (
            'Apply to YouTube'
          )}
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <span className="abt-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function WindowedTable({ windowed, slugs }) {
  const buckets = ['0-6h', '6-24h', '24-48h', '48h+']
  return (
    <div className="abt-window-table-wrap">
      <table className="abt-window-table">
        <thead>
          <tr>
            <th>Variant</th>
            {buckets.map((b) => (
              <th key={b}>{b}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slugs.map((slug) => {
            const row = windowed[slug] || {}
            return (
              <tr key={slug}>
                <td>
                  <strong>{slug}</strong>
                </td>
                {buckets.map((b) => {
                  const cell = row[b] || {}
                  return (
                    <td key={b}>
                      <div className="abt-window-cell">
                        <span className="abt-window-ctr">
                          {cell.ctr != null ? pct(cell.ctr) : '—'}
                        </span>
                        <span className="abt-window-meta">
                          {cell.impressions != null ? `${fmtNum(cell.impressions)} imp` : 'no data'}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend chart — N slugs, shared SVG
// ─────────────────────────────────────────────────────────────────────────────
const SLUG_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185']

function TrendChartN({ trend, slugs }) {
  const rows = (trend || []).filter((r) => slugs.some((s) => r[s]?.ctr != null))
  if (rows.length < 2)
    return <div className="abt-muted">Trend appears after two or more snapshots.</div>
  const W = 640,
    H = 160,
    P = 20
  const xs = rows.map((r) => new Date(r.captured_at).getTime())
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs)
  const ctrs = rows.flatMap((r) => slugs.map((s) => r[s]?.ctr)).filter((v) => v != null)
  const y1 = Math.max(0.01, ...(ctrs.length ? ctrs : [0.1]))
  const xScale = (t) => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - 2 * P)
  const yScale = (v) => H - P - (v / y1) * (H - 2 * P)
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
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="abt-chart">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="rgba(255,255,255,0.08)" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="rgba(255,255,255,0.08)" />
        {slugs.map((s, i) => (
          <path
            key={s}
            d={pathFor(s)}
            fill="none"
            stroke={SLUG_COLORS[i % SLUG_COLORS.length]}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        <text x={P + 4} y={P + 10} fill="rgba(229,229,231,0.45)" fontSize="10">
          {(y1 * 100).toFixed(1)}%
        </text>
        <text x={P + 4} y={H - P - 2} fill="rgba(229,229,231,0.45)" fontSize="10">
          0%
        </text>
      </svg>
      <div className="abt-legend">
        {slugs.map((s, i) => (
          <span key={s} className="abt-legend-item">
            <i className="abt-swatch" style={{ background: SLUG_COLORS[i % SLUG_COLORS.length] }} />
            Variant {s}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom components — Select, ConfirmDialog, Toast, ViewToggle
// ─────────────────────────────────────────────────────────────────────────────

// Sort/filter dropdown — identical structure/animation to Optimize's sort dropdown.
// (FilterDropdown replaced by <SelectPill> from components/ui; ViewToggle
// replaced by <SegmentedTabs>. Both live in components/ui and are reused
// across Coach, Optimize, and A/B Testing.)

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="abt-modal-overlay" onClick={onClose}>
      <div
        className="abt-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="abt-modal-body">
          <h3 className="abt-modal-title">{title}</h3>
          {message && <p className="abt-modal-message">{message}</p>}
        </div>
        <div className="abt-modal-actions">
          <button
            type="button"
            className="abt-btn abt-btn--ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`abt-btn ${tone === 'danger' ? 'abt-btn--danger' : 'abt-btn--primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ToastInline({ tone = 'error', children, onDismiss }) {
  if (!children) return null
  return (
    <div className={`abt-toast abt-toast--${tone}`}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" className="abt-toast-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}

function ExperimentGridCard({ test }) {
  const activeVar = test.variations?.find((v) => v.slug === test.active_variation)
  const totalVars = (test.variations || []).length
  return (
    <button type="button" className="abt-card" onClick={() => goTo(String(test.id))}>
      <div className="abt-card-thumb-wrap">
        {activeVar?.thumbnail_url ? (
          <img className="abt-card-thumb" src={activeVar.thumbnail_url} alt="" />
        ) : (
          <div className="abt-card-thumb abt-card-thumb--fallback">🎬</div>
        )}
        <div className="abt-card-badge-row">
          <StatusDot status={test.status} />
          {test.winner_slug && (
            <span className="abt-card-badge abt-card-badge--win">🏆 {test.winner_slug}</span>
          )}
        </div>
        <div className="abt-card-thumb-overlay" aria-hidden>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
          <span>Open</span>
        </div>
      </div>
      <div className="abt-card-body">
        <h3 className="abt-card-title" title={activeVar?.title || ''}>
          {activeVar?.title || `Test #${test.id} · video ${test.video_id}`}
        </h3>
        <div className="abt-card-meta-row">
          <span className="abt-card-meta-pill">{test.kind}</span>
          <span className="abt-card-meta-pill">{test.mode}</span>
          <span className="abt-card-meta-pill abt-card-meta-pill--count">{totalVars} variants</span>
        </div>
        <div className="abt-card-footer">
          <span className="abt-card-started">
            {new Date(test.started_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <span className="abt-card-cta">
            Open
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M2 5h5 M5.5 2.5 8 5 5.5 7.5"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </button>
  )
}

function StatusDot({ status }) {
  const label =
    status === 'running'
      ? 'Running'
      : status === 'paused'
        ? 'Paused'
        : status === 'completed'
          ? 'Completed'
          : status
  return (
    <span className={`abt-card-status abt-card-status--${status}`}>
      <span className="abt-card-status-dot" aria-hidden />
      {label}
    </span>
  )
}

export default ABTesting
