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
  SelectPill,
  InlineSpinner,
  SkeletonCard,
  SkeletonGroup,
  SkeletonText,
} from '../components/ui'

// AB testing is a paid-only feature — every paid plan gets the full 5-variant
// cap. The SRX model tiers only govern thumbnail-generation behaviour and are
// intentionally NOT consulted here.
const MAX_VARIANTS = 5

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

  const content = (() => {
    if (locked && (route.view === 'new' || route.view === 'detail')) {
      return <ExperimentList locked />
    }
    if (route.view === 'new') return <CreateExperiment />
    if (route.view === 'detail') return <ExperimentDetail testId={route.testId} />
    return <ExperimentList locked={locked} />
  })()

  // Mirror Optimize's shell wrappers so horizontal padding + vertical
  // rhythm match exactly across the two screens.
  return (
    <div className="dashboard-main dashboard-main--subpage">
      <div className="dashboard-content-shell dashboard-content-shell--page">{content}</div>
    </div>
  )
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
        <SkeletonGroup className="abt-grid" label="Loading A/B experiments">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} ratio="16 / 9" lines={2} />
          ))}
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

      {!locked && !isLoading && items.length > 0 && (
        <div className="abt-grid" role="list">
          {items.map((t) => (
            <ExperimentGridCard key={t.id} test={t} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create wizard
// ─────────────────────────────────────────────────────────────────────────────
function CreateExperiment() {
  const { youtube } = useOnboardingStore()
  const channelId = youtube?.channelId || youtube?.channel_id || null
  const cap = MAX_VARIANTS

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

  const selectedVideo = videos.find((v) => v.id === selectedVideoId) || null

  return (
    <div className="abt-page optimize-page abt-create">
      <div className="optimize-top-bar abt-create-top">
        <div className="optimize-heading-wrap">
          <button type="button" className="abt-back abt-back--inline" onClick={() => goTo('')}>
            ← All experiments
          </button>
          <h1 className="optimize-heading">New experiment</h1>
          <span className="abt-create-subtle">
            Run real titles + thumbnails against each other on YouTube.
          </span>
        </div>
      </div>

      <div className="optimize-divider" aria-hidden />

      {/* ── Step 1 — pick a video ───────────────────────────── */}
      <section className="abt-step-card">
        <StepHead
          n={1}
          title="Pick a video"
          hint="We'll capture its current title + thumbnail as variant A."
        />
        {!channelId && <div className="abt-warn">Connect a YouTube channel first in Settings.</div>}
        {videosQ.isLoading ? (
          <SkeletonGroup className="abt-video-grid" label="Loading videos">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} ratio="16 / 9" lines={1} />
            ))}
          </SkeletonGroup>
        ) : videos.length > 0 ? (
          <div className="abt-video-grid">
            {videos.slice(0, 12).map((v) => (
              <button
                key={v.id}
                type="button"
                className={`abt-video-card ${selectedVideoId === v.id ? 'is-selected' : ''}`}
                onClick={() => onSelectVideo(v)}
              >
                <span className="abt-video-thumb-wrap">
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" />
                  ) : (
                    <span className="abt-video-fallback">🎬</span>
                  )}
                  {selectedVideoId === v.id && (
                    <span className="abt-video-check" aria-hidden>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="abt-video-title" title={v.title}>
                  {v.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          channelId && (
            <div className="abt-muted">
              No recent videos to show. Publish or refresh the Optimize screen first.
            </div>
          )
        )}
      </section>

      {/* ── Step 2 — experiment type ────────────────────────── */}
      <section className="abt-step-card">
        <StepHead n={2} title="What are you testing?" hint="Pick what changes between variants." />
        <div className="abt-kind-row">
          <KindPill
            active={kind === 'thumbnail'}
            onClick={() => setKind('thumbnail')}
            icon={<IconThumbGlyph />}
            label="Thumbnail"
            hint="Swap only the thumbnail image"
          />
          <KindPill
            active={kind === 'title'}
            onClick={() => setKind('title')}
            icon={<IconTypeGlyph />}
            label="Title"
            hint="Swap only the title text"
          />
          <KindPill
            active={kind === 'both'}
            onClick={() => setKind('both')}
            icon={<IconSplitGlyph />}
            label="Both"
            hint="Change the thumbnail and title together"
          />
        </div>
      </section>

      {/* ── Step 3 — variants ───────────────────────────────── */}
      <section className="abt-step-card">
        <StepHead
          n={3}
          title="Your variants"
          hint={`Variant A is always the original. Add up to ${cap} total.`}
          right={
            <span className="abt-step-counter">
              {variants.length} / {cap}
            </span>
          }
        />
        <div className="abt-variants-grid abt-variants-grid--create">
          {variants.map((v, i) => (
            <div
              key={i}
              className={`abt-variant-card abt-variant-card--edit ${i === 0 ? 'is-original' : ''}`}
            >
              <div className="abt-variant-head">
                <span
                  className="abt-variant-slug"
                  style={{ background: SLUG_COLORS[i % SLUG_COLORS.length] }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                {i === 0 ? (
                  <span
                    className="abt-pill abt-pill--orig"
                    title="Captured as your original. Always preserved."
                  >
                    🛡️ Original
                  </span>
                ) : (
                  <button
                    type="button"
                    className="abt-variant-remove"
                    onClick={() => removeVariant(i)}
                    aria-label="Remove variant"
                  >
                    ×
                  </button>
                )}
              </div>
              {(kind === 'thumbnail' || kind === 'both') && (
                <ThumbnailDropzone
                  value={v.thumbnail_url}
                  onPick={(f) => onPickFile(i, f)}
                  onUrlChange={(u) => updateVariant(i, { thumbnail_url: u })}
                  readOnly={i === 0}
                />
              )}
              {(kind === 'title' || kind === 'both') && (
                <div className="abt-field">
                  <span className="abt-label">Title</span>
                  <input
                    type="text"
                    placeholder={i === 0 ? 'Video title' : 'Variant title'}
                    className="abt-input"
                    maxLength={120}
                    value={v.title || ''}
                    onChange={(e) => updateVariant(i, { title: e.target.value })}
                  />
                  <span className="abt-input-counter">{(v.title || '').length}/120</span>
                </div>
              )}
            </div>
          ))}
          {variants.length < cap && (
            <button
              type="button"
              className="abt-variant-add"
              onClick={addVariant}
              aria-label="Add variant"
            >
              <span className="abt-variant-add-plus">+</span>
              <span className="abt-variant-add-label">Add variant</span>
              <span className="abt-variant-add-hint">
                Variant {String.fromCharCode(65 + variants.length)}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* ── Step 4 — rotation mode ──────────────────────────── */}
      <section className="abt-step-card">
        <StepHead
          n={4}
          title="How should variants rotate?"
          hint="Choose manual or let us do it on a schedule."
        />
        <div className="abt-mode-grid">
          <ModeCard
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
            title="Manual"
            desc="You decide when to swap which variant is live. Full control."
            icon="👆"
          />
          <ModeCard
            active={mode === 'automatic'}
            onClick={() => setMode('automatic')}
            title="Automatic"
            desc="We rotate variants on a fixed schedule so the test runs itself."
            icon="🔁"
          />
        </div>
        {mode === 'automatic' && (
          <div className="abt-field-row abt-mode-extras">
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
              <span>Auto-apply the winner when confidence is high</span>
            </label>
          </div>
        )}
      </section>

      {/* ── Recap + footer ──────────────────────────────────── */}
      {selectedVideo && (
        <div className="abt-recap">
          <span className="abt-recap-label">Testing on</span>
          {selectedVideo.thumbnail_url && (
            <img src={selectedVideo.thumbnail_url} alt="" className="abt-recap-thumb" />
          )}
          <span className="abt-recap-title" title={selectedVideo.title}>
            {selectedVideo.title}
          </span>
        </div>
      )}

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
            '🧪 Start experiment'
          )}
        </button>
      </div>
    </div>
  )
}

function StepHead({ n, title, hint, right }) {
  return (
    <div className="abt-step-head-row">
      <span className="abt-step-num">{String(n).padStart(2, '0')}</span>
      <div className="abt-step-head-main">
        <h3 className="abt-step-title">{title}</h3>
        {hint && <p className="abt-step-hint">{hint}</p>}
      </div>
      {right && <div className="abt-step-head-right">{right}</div>}
    </div>
  )
}

function KindPill({ active, onClick, icon, label, hint }) {
  return (
    <button
      type="button"
      className={`abt-kind ${active ? 'is-selected' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="abt-kind-icon">{icon}</span>
      <span className="abt-kind-body">
        <span className="abt-kind-label">{label}</span>
        <span className="abt-kind-hint">{hint}</span>
      </span>
    </button>
  )
}

function ModeCard({ active, onClick, title, desc, icon }) {
  return (
    <button
      type="button"
      className={`abt-mode-card ${active ? 'is-selected' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="abt-mode-icon" aria-hidden>
        {icon}
      </span>
      <span className="abt-mode-title">{title}</span>
      <span className="abt-mode-desc">{desc}</span>
    </button>
  )
}

function ThumbnailDropzone({ value, onPick, onUrlChange, readOnly }) {
  const [isDrag, setIsDrag] = useState(false)
  const isData = typeof value === 'string' && value.startsWith('data:')
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDrag(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) onPick?.(f)
  }
  return (
    <div className="abt-dz">
      <label
        className={`abt-dz-area ${isDrag ? 'is-drag' : ''} ${value ? 'has-image' : ''} ${readOnly ? 'is-readonly' : ''}`}
        onDragOver={(e) => {
          if (readOnly) return
          e.preventDefault()
          setIsDrag(true)
        }}
        onDragLeave={() => setIsDrag(false)}
        onDrop={readOnly ? undefined : handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onPick?.(e.target.files?.[0])}
          hidden
          disabled={readOnly}
        />
        {value ? (
          <img className="abt-dz-preview" src={value} alt="" />
        ) : (
          <span className="abt-dz-empty">
            <span className="abt-dz-empty-icon" aria-hidden>
              🖼️
            </span>
            <span className="abt-dz-empty-text">Drop or click to upload</span>
          </span>
        )}
      </label>
      {!readOnly && (
        <input
          type="url"
          placeholder="Or paste an image URL"
          className="abt-input abt-input--sm"
          value={isData ? '' : value || ''}
          onChange={(e) => onUrlChange?.(e.target.value)}
        />
      )}
    </div>
  )
}

function IconThumbGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  )
}
function IconTypeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 4 5 20 5 20 7" />
      <line x1="9" y1="19" x2="15" y2="19" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </svg>
  )
}
function IconSplitGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="8" height="14" rx="2" />
      <rect x="13" y="5" width="8" height="14" rx="2" />
    </svg>
  )
}

function CreateCostSummary({ variantCount }) {
  const { unit: createCost } = useCostOf('ab_test_create', 1)
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
  const cap = MAX_VARIANTS
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
    <div className="abt-page optimize-page">
      <header className="abt-header">
        <div>
          <button type="button" className="abt-back" onClick={() => goTo('')}>
            ← Back to all experiments
          </button>
          <h1 className="abt-h1">Experiment #{results.test_id}</h1>
          <p className="abt-sub">
            <span className={`abt-pill abt-pill--${results.status}`}>{results.status}</span>
            <span className="abt-pill abt-pill--kind">{results.mode}</span>
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
          {insightsCost > 0 && (
            <button
              type="button"
              className="abt-btn abt-btn--ghost"
              onClick={() => insightsMut.mutate(testId)}
              disabled={insightsMut.isPending}
              title={`Charges ${insightsCost} credits`}
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

      {/* Comparison summary — visual hero */}
      <SummaryHero
        comparison={results.comparison}
        variations={variations}
        ranking={ranking}
        winnerSlug={winnerSlug}
        status={results.status}
        onPromote={() => winnerSlug && handlePromote(winnerSlug)}
        promoting={promoteMut.isPending}
      />

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
          {(() => {
            const variantList = Object.values(variations)
            const bestCtr = Math.max(0, ...variantList.map((v) => v.impression_ctr ?? 0))
            return variantList.map((v, i) => (
              <VariantCardVisual
                key={v.slug}
                v={v}
                colorIndex={i}
                bestCtr={bestCtr}
                isOriginal={v.slug === 'A'}
                isWinner={v.slug === winnerSlug}
                isActive={v.is_active}
                canActivate={results.status === 'running' && !v.is_active}
                onActivate={() => handleActivate(v.slug)}
                onPromote={() => handlePromote(v.slug)}
                activating={activateMut.isPending}
                promoting={promoteMut.isPending}
              />
            ))
          })()}
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

      {/* Time-window CTR — heatmap */}
      {results.windowed && Object.keys(results.windowed).length > 0 && (
        <section className="abt-section">
          <h3 className="abt-step-h">CTR by time window</h3>
          <WindowedHeatmap windowed={results.windowed} slugs={Object.keys(variations)} />
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

/* ── Summary hero ─────────────────────────────────────────────────
 * Three visual cells: winner reveal · CTR delta with bars · confidence
 * arc gauge. Verdict prose + Apply-winner CTA live below. */
function SummaryHero({
  comparison,
  variations,
  ranking,
  winnerSlug,
  status,
  onPromote,
  promoting,
}) {
  const ctrDeltaPP = comparison?.ctr_delta_pp != null ? comparison.ctr_delta_pp * 100 : null
  const confidence = comparison?.confidence
  const pValue = comparison?.p_value
  return (
    <section className="abt-section abt-hero">
      <div className="abt-hero-grid">
        <WinnerCell winnerSlug={winnerSlug} variations={variations} ranking={ranking} />
        <CtrDeltaCell
          deltaPP={ctrDeltaPP}
          ranking={ranking}
          variations={variations}
          winnerSlug={winnerSlug}
        />
        <ConfidenceCell confidence={confidence} pValue={pValue} />
      </div>
      <p className="abt-verdict">
        {comparison?.reason || 'Gathering data — this updates as YouTube reports new impressions.'}
      </p>
      {winnerSlug && status !== 'completed' && (
        <button
          type="button"
          className="abt-btn abt-btn--primary abt-apply-winner"
          onClick={onPromote}
          disabled={promoting}
        >
          {promoting ? (
            <span className="sk-btn-pending">
              <InlineSpinner size={12} />
              Applying…
            </span>
          ) : (
            <>
              <span aria-hidden>🏆</span> Apply winner ({winnerSlug}) to YouTube
            </>
          )}
        </button>
      )}
    </section>
  )
}

function WinnerCell({ winnerSlug, variations, ranking }) {
  const w = winnerSlug ? variations[winnerSlug] : null
  return (
    <div className={`abt-hero-cell abt-hero-cell--winner ${winnerSlug ? 'has-winner' : ''}`}>
      <span className="abt-hero-label">Winner</span>
      {winnerSlug ? (
        <>
          <div className="abt-hero-winner-chip">
            <span className="abt-hero-winner-slug">{winnerSlug}</span>
            <span className="abt-hero-winner-trophy" aria-hidden>
              🏆
            </span>
          </div>
          {w?.title && (
            <span className="abt-hero-winner-title" title={w.title}>
              {w.title}
            </span>
          )}
        </>
      ) : (
        <>
          <div className="abt-hero-winner-chip abt-hero-winner-chip--empty">
            <span className="abt-hero-winner-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
          <span className="abt-hero-muted">
            {ranking.length ? `Leading: ${ranking[0]}` : 'No winner yet'}
          </span>
        </>
      )}
    </div>
  )
}

function CtrDeltaCell({ deltaPP, ranking, variations, winnerSlug }) {
  // Bars comparison — show each variant's CTR as a bar normalised to the leader.
  const list = Object.values(variations || {})
  const best = Math.max(0, ...list.map((v) => v.impression_ctr ?? 0))
  const positive = (deltaPP ?? 0) >= 0
  const hasData = deltaPP != null
  return (
    <div className="abt-hero-cell abt-hero-cell--delta">
      <span className="abt-hero-label">CTR delta</span>
      <div className={`abt-hero-delta ${positive ? 'is-pos' : 'is-neg'}`}>
        <span className="abt-hero-delta-arrow" aria-hidden>
          {positive ? '▲' : '▼'}
        </span>
        <span className="abt-hero-delta-num">{hasData ? `${deltaPP.toFixed(2)}` : '—'}</span>
        {hasData && <span className="abt-hero-delta-unit">pp</span>}
      </div>
      <div className="abt-hero-bars">
        {ranking.map((slug) => {
          const v = variations[slug]
          const ctr = v?.impression_ctr ?? 0
          const widthPct = best > 0 ? Math.max(3, (ctr / best) * 100) : 3
          const isWin = slug === winnerSlug
          return (
            <div key={slug} className="abt-hero-bar-row">
              <span className="abt-hero-bar-slug">{slug}</span>
              <div className="abt-hero-bar-track">
                <span
                  className={`abt-hero-bar-fill ${isWin ? 'is-winner' : ''}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="abt-hero-bar-val">{pct(ctr)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConfidenceCell({ confidence, pValue }) {
  // 0-1 value representing how confident we are; drives the arc fill.
  const ratioMap = { high: 0.95, medium: 0.7, low: 0.4, insufficient: 0.08 }
  const ratio = ratioMap[confidence] ?? 0
  const colorMap = {
    high: '#34d399',
    medium: '#fbbf24',
    low: '#fb923c',
    insufficient: 'rgba(255,255,255,0.3)',
  }
  const color = colorMap[confidence] ?? 'rgba(255,255,255,0.3)'
  const labelMap = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    insufficient: 'Not enough',
  }
  // Arc: 180° half-circle, stroke-dasharray trick.
  const r = 54,
    cx = 62,
    cy = 62
  const circ = Math.PI * r // half circumference
  return (
    <div className="abt-hero-cell abt-hero-cell--conf">
      <span className="abt-hero-label">Confidence</span>
      <div className="abt-hero-gauge">
        <svg viewBox="0 0 124 70" className="abt-hero-gauge-svg" aria-hidden>
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${circ * ratio} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        </svg>
        <div className="abt-hero-gauge-center">
          <span className="abt-hero-gauge-num" style={{ color }}>
            {labelMap[confidence] || '—'}
          </span>
          <span className="abt-hero-gauge-p">p = {pValue != null ? pValue.toFixed(4) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

/* ── Variant card — thumbnail hero + inline bar + micro stats ─── */
function VariantCardVisual({
  v,
  colorIndex,
  bestCtr,
  isOriginal,
  isWinner,
  isActive,
  canActivate,
  onActivate,
  onPromote,
  activating,
  promoting,
}) {
  const ctr = v.impression_ctr ?? 0
  const barPct = bestCtr > 0 ? Math.max(3, (ctr / bestCtr) * 100) : 3
  const color = SLUG_COLORS[colorIndex % SLUG_COLORS.length]
  return (
    <div
      className={`abt-variant-card ${isOriginal ? 'is-original' : ''} ${isWinner ? 'is-winner' : ''} ${isActive ? 'is-active' : ''}`}
      style={{ '--slug-color': color }}
    >
      <div className="abt-variant-head">
        <span className="abt-variant-slug" style={{ background: color }}>
          {v.slug}
        </span>
        <div className="abt-variant-pills">
          {isActive && <span className="abt-pill abt-pill--live">● LIVE</span>}
          {isWinner && <span className="abt-pill abt-pill--win">🏆 WINNER</span>}
          {isOriginal && (
            <span
              className="abt-pill abt-pill--orig"
              title="Your video's original title and thumbnail. Always preserved — never deleted."
            >
              🛡️ Original
            </span>
          )}
        </div>
      </div>
      <div className="abt-variant-thumb-wrap">
        {v.thumbnail_url ? (
          <img className="abt-variant-thumb" src={v.thumbnail_url} alt="" />
        ) : (
          <div className="abt-variant-thumb abt-variant-thumb--empty">No thumbnail</div>
        )}
      </div>
      {v.title && (
        <div className="abt-variant-title" title={v.title}>
          {v.title}
        </div>
      )}

      {/* Hero stat — CTR with horizontal bar vs leader */}
      <div className="abt-variant-hero-stat">
        <div className="abt-variant-hero-stat-top">
          <span className="abt-variant-hero-stat-label">CTR</span>
          <span className="abt-variant-hero-stat-value">{pct(ctr)}</span>
        </div>
        <div className="abt-variant-bar-track">
          <span
            className="abt-variant-bar-fill"
            style={{ width: `${barPct}%`, background: color }}
          />
        </div>
      </div>

      {/* Micro stats — tight row, no label/value stack */}
      <div className="abt-variant-micro">
        <MicroStat label="Views" value={fmtNum(v.views)} />
        <MicroStat label="Impr." value={fmtNum(v.impressions)} />
        <MicroStat label="V/hr" value={v.views_per_hour ?? '—'} />
        <MicroStat label="Ran" value={hoursLabel(v.hours_running)} />
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

function MicroStat({ label, value }) {
  return (
    <div className="abt-micro">
      <span className="abt-micro-val">{value}</span>
      <span className="abt-micro-label">{label}</span>
    </div>
  )
}

/* ── Windowed heatmap — cells coloured by CTR intensity ─────── */
function WindowedHeatmap({ windowed, slugs }) {
  const buckets = ['0-6h', '6-24h', '24-48h', '48h+']
  const allCtrs = slugs.flatMap((s) =>
    buckets.map((b) => windowed[s]?.[b]?.ctr).filter((v) => v != null)
  )
  const maxCtr = Math.max(0.001, ...(allCtrs.length ? allCtrs : [0.05]))
  return (
    <div className="abt-heatmap">
      <div className="abt-heatmap-head">
        <span className="abt-heatmap-corner" />
        {buckets.map((b) => (
          <span key={b} className="abt-heatmap-col">
            {b}
          </span>
        ))}
      </div>
      {slugs.map((slug, i) => (
        <div key={slug} className="abt-heatmap-row">
          <span
            className="abt-heatmap-slug"
            style={{ '--slug-color': SLUG_COLORS[i % SLUG_COLORS.length] }}
          >
            {slug}
          </span>
          {buckets.map((b) => {
            const cell = windowed[slug]?.[b]
            const ctr = cell?.ctr
            const hasData = ctr != null
            const intensity = hasData ? ctr / maxCtr : 0
            const alpha = hasData ? 0.12 + intensity * 0.68 : 0.04
            const color = SLUG_COLORS[i % SLUG_COLORS.length]
            return (
              <div
                key={b}
                className={`abt-heatmap-cell ${hasData ? 'has-data' : ''}`}
                style={{
                  background: hasData
                    ? `linear-gradient(135deg, ${hexToRgba(color, alpha)}, ${hexToRgba(color, alpha * 0.6)})`
                    : 'rgba(255,255,255,0.03)',
                  borderColor: hasData ? hexToRgba(color, 0.32) : 'rgba(255,255,255,0.06)',
                }}
                title={
                  hasData
                    ? `${pct(ctr)} · ${fmtNum(cell.impressions || 0)} impressions`
                    : 'No data in this window'
                }
              >
                <span className="abt-heatmap-ctr">{hasData ? pct(ctr) : '—'}</span>
                {hasData && (
                  <span className="abt-heatmap-meta">{fmtNum(cell.impressions || 0)} imp</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend chart — N slugs, shared SVG
// ─────────────────────────────────────────────────────────────────────────────
const SLUG_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185']

function TrendChartN({ trend, slugs }) {
  const rows = (trend || []).filter((r) => slugs.some((s) => r[s]?.ctr != null))
  if (rows.length < 2)
    return <div className="abt-muted">Trend appears after two or more snapshots.</div>
  const W = 720,
    H = 220,
    PL = 38,
    PR = 16,
    PT = 16,
    PB = 28
  const innerW = W - PL - PR
  const innerH = H - PT - PB
  const xs = rows.map((r) => new Date(r.captured_at).getTime())
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs)
  const ctrs = rows.flatMap((r) => slugs.map((s) => r[s]?.ctr)).filter((v) => v != null)
  const y1 = Math.max(0.01, ...(ctrs.length ? ctrs : [0.1]))
  const xScale = (t) => PL + ((t - x0) / Math.max(1, x1 - x0)) * innerW
  const yScale = (v) => PT + innerH - (v / y1) * innerH
  const ptsFor = (slug) =>
    rows
      .filter((r) => r[slug]?.ctr != null)
      .map((r) => ({
        x: xScale(new Date(r.captured_at).getTime()),
        y: yScale(r[slug].ctr),
        v: r[slug].ctr,
      }))
  const linePath = (pts) =>
    pts.length ? `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}` : ''
  const areaPath = (pts) => {
    if (!pts.length) return ''
    const top = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')
    const baseY = PT + innerH
    return `M ${pts[0].x.toFixed(1)},${baseY} L ${top} L ${pts[pts.length - 1].x.toFixed(1)},${baseY} Z`
  }
  // Tick labels — 4 horizontal grid lines
  const ticks = [0, 0.33, 0.66, 1]
  const fmtTs = (t) => {
    const d = new Date(t)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return (
    <div className="abt-trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="abt-chart" preserveAspectRatio="none">
        <defs>
          {slugs.map((s, i) => {
            const c = SLUG_COLORS[i % SLUG_COLORS.length]
            return (
              <linearGradient key={s} id={`abt-grad-${s}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity="0.45" />
                <stop offset="100%" stopColor={c} stopOpacity="0" />
              </linearGradient>
            )
          })}
        </defs>
        {/* Horizontal grid */}
        {ticks.map((t) => {
          const y = PT + innerH - t * innerH
          return (
            <g key={t}>
              <line
                x1={PL}
                y1={y}
                x2={PL + innerW}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="2 4"
              />
              <text
                x={PL - 8}
                y={y + 3}
                fill="rgba(229,229,231,0.42)"
                fontSize="10"
                textAnchor="end"
              >
                {(y1 * t * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}
        {/* Baseline */}
        <line
          x1={PL}
          y1={PT + innerH}
          x2={PL + innerW}
          y2={PT + innerH}
          stroke="rgba(255,255,255,0.14)"
        />
        {/* Area fills (behind lines) */}
        {slugs.map((s) => {
          const pts = ptsFor(s)
          return <path key={`a-${s}`} d={areaPath(pts)} fill={`url(#abt-grad-${s})`} />
        })}
        {/* Lines */}
        {slugs.map((s, i) => {
          const pts = ptsFor(s)
          const c = SLUG_COLORS[i % SLUG_COLORS.length]
          return (
            <g key={`l-${s}`}>
              <path
                d={linePath(pts)}
                fill="none"
                stroke={c}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((p, j) => (
                <circle
                  key={j}
                  cx={p.x}
                  cy={p.y}
                  r={j === pts.length - 1 ? 3.5 : 2}
                  fill={c}
                  stroke="rgba(12,10,18,0.7)"
                  strokeWidth="1"
                />
              ))}
              {/* End-of-line value label */}
              {pts.length > 0 && (
                <text
                  x={pts[pts.length - 1].x + 6}
                  y={pts[pts.length - 1].y + 3}
                  fill={c}
                  fontSize="10"
                  fontWeight="600"
                >
                  {(pts[pts.length - 1].v * 100).toFixed(1)}%
                </text>
              )}
            </g>
          )
        })}
        {/* X axis date range */}
        <text x={PL} y={H - 8} fill="rgba(229,229,231,0.5)" fontSize="10">
          {fmtTs(x0)}
        </text>
        <text x={PL + innerW} y={H - 8} fill="rgba(229,229,231,0.5)" fontSize="10" textAnchor="end">
          {fmtTs(x1)}
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
