import { useState, useCallback, useRef, useMemo } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { toast } from '../lib/toast'
import { friendlyTitleFor, parseApiError } from '../lib/errorMessages'
import GenerationProgress from '../components/GenerationProgress'
import './ThumbnailRater.css'

const YOUTUBE_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

const THUMBNAIL_CRITERIA_ORDER = [
  'visual_hierarchy',
  'subject_clarity',
  'emotional_hook',
  'background_discipline',
  'color_and_contrast',
  'lighting_quality',
  'mobile_readability',
  'curiosity_gap',
  'composition',
  'production_polish',
]

const TITLE_CRITERIA_ORDER = [
  'hook',
  'clarity',
  'specificity',
  'value_promise',
  'length_pacing',
  'emotional_appeal',
  'uniqueness',
]

function extractYoutubeUrl(text) {
  const m = String(text || '').match(YOUTUBE_URL_RE)
  return m ? m[0] : null
}

function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

async function pollJobUntilDone(token, jobId, intervalMs = 2000, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await thumbnailsApi.getJob(token, jobId)
    if (job?.status === 'done') return job
    if (job?.status === 'failed') throw new Error(job?.error || 'Improvement failed')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Improvement timed out')
}

function gradeFromScore(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return '—'
  if (n >= 90) return 'A+'
  if (n >= 80) return 'A'
  if (n >= 70) return 'B'
  if (n >= 60) return 'C'
  if (n >= 50) return 'D'
  return 'F'
}

function gradeTierClass(grade) {
  const g = String(grade || '').toUpperCase()
  if (g.startsWith('A')) return 'thumb-grade--a'
  if (g.startsWith('B')) return 'thumb-grade--b'
  if (g.startsWith('C')) return 'thumb-grade--c'
  if (g.startsWith('D')) return 'thumb-grade--d'
  if (g.startsWith('F')) return 'thumb-grade--f'
  return ''
}

function ctrTierClass(band) {
  const b = String(band || '').toLowerCase()
  if (b.includes('top')) return 'thumb-ctr--top'
  if (b.includes('above')) return 'thumb-ctr--above'
  if (b.includes('average') && !b.includes('above') && !b.includes('below')) return 'thumb-ctr--avg'
  if (b.includes('below')) return 'thumb-ctr--below'
  if (b.includes('bottom')) return 'thumb-ctr--bottom'
  return 'thumb-ctr--avg'
}

function verdictClass(verdict) {
  const v = String(verdict || '').toLowerCase()
  if (v.includes('strong')) return 'thumb-verdict--strong'
  if (v.includes('solid')) return 'thumb-verdict--solid'
  if (v.includes('adequate') || v.includes('loose')) return 'thumb-verdict--adequate'
  if (v.includes('weak')) return 'thumb-verdict--weak'
  if (v.includes('poor') || v.includes('mismatch')) return 'thumb-verdict--poor'
  return 'thumb-verdict--solid'
}

function humanizeKey(key) {
  return String(key || '')
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function IconSparkle() {
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
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  )
}

function IconUpload() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function CriterionCard({ entry }) {
  const score = entry?.score
  const verdict = entry?.verdict || ''
  return (
    <div className="thumb-criterion-card">
      <div className="thumb-criterion-head">
        <span className="thumb-criterion-label">{entry?.label || humanizeKey(entry?.key)}</span>
        <div className="thumb-criterion-score-row">
          <span className="thumb-criterion-score">
            {score != null ? Number(score).toFixed(score % 1 === 0 ? 0 : 1) : '—'}
            <span className="thumb-criterion-score-max">/10</span>
          </span>
          {verdict && (
            <span className={`thumb-verdict-pill ${verdictClass(verdict)}`}>{verdict}</span>
          )}
        </div>
      </div>
      {entry?.explanation && <p className="thumb-criterion-text">{entry.explanation}</p>}
      {entry?.suggestion && (
        <div className="thumb-criterion-suggest">
          <span className="thumb-criterion-suggest-label">Try this</span>
          <span className="thumb-criterion-suggest-text">{entry.suggestion}</span>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ children }) {
  return <h3 className="thumb-section-header">{children}</h3>
}

function HeroCard({ grade, overallScore, ctrBand, oneLiner, label }) {
  return (
    <div className={`thumb-hero-card ${gradeTierClass(grade)}`}>
      <div className="thumb-hero-grade-wrap">
        <span className="thumb-hero-grade">{grade || '—'}</span>
        <span className="thumb-hero-grade-label">{label || 'Grade'}</span>
      </div>
      <div className="thumb-hero-body">
        <div className="thumb-hero-score-row">
          <span className="thumb-hero-score">
            {overallScore != null ? overallScore : '—'}
            <span className="thumb-hero-score-max"> / 100</span>
          </span>
          {ctrBand && (
            <span className={`thumb-ctr-pill ${ctrTierClass(ctrBand)}`}>
              Predicted CTR · {ctrBand}
            </span>
          )}
        </div>
        {oneLiner && <p className="thumb-hero-oneliner">{oneLiner}</p>}
      </div>
    </div>
  )
}

function TakeawaysGrid({ strengths, fixes }) {
  if (!strengths?.length && !fixes?.length) return null
  return (
    <div className="thumb-takeaways-grid">
      {strengths?.length > 0 && (
        <div className="thumb-takeaway-card thumb-takeaway--strengths">
          <span className="thumb-takeaway-title">Top strengths</span>
          <ul className="thumb-takeaway-list">
            {strengths.map((s, i) => (
              <li key={`str-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {fixes?.length > 0 && (
        <div className="thumb-takeaway-card thumb-takeaway--fixes">
          <span className="thumb-takeaway-title">Top fixes</span>
          <ul className="thumb-takeaway-list">
            {fixes.map((s, i) => (
              <li key={`fix-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Thorough AI analysis — thumbnail, title, or both (POST /api/thumbnails/analyze).
 */
export function ThumbnailAnalyzePanel() {
  const [preview, setPreview] = useState(null)
  const [youtubeHint, setYoutubeHint] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [niche, setNiche] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [result, setResult] = useState(null)
  const [ratingId, setRatingId] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [rateError, setRateError] = useState('')
  const [improving, setImproving] = useState(false)
  const [improvedUrl, setImprovedUrl] = useState(null)
  const fileInputRef = useRef(null)

  // Either an image or a title is required to run analysis
  const canAnalyze = Boolean(preview?.src || videoTitle.trim())

  const clearImage = useCallback(() => {
    setPreview(null)
    setResult(null)
    setRatingId(null)
    setRateError('')
    setImprovedUrl(null)
  }, [])

  const applyFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setPreview({ kind: 'data', src: dataUrl })
      setResult(null)
      setRatingId(null)
      setImprovedUrl(null)
      setRateError('')
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      const f = e.dataTransfer?.files?.[0]
      if (f) applyFile(f)
    },
    [applyFile]
  )

  const fetchYoutubeThumb = useCallback(async () => {
    const url = extractYoutubeUrl(youtubeHint)
    if (!url) {
      setRateError('Paste a valid YouTube watch or youtu.be link.')
      return
    }
    setLoadingPreview(true)
    setRateError('')
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to fetch thumbnails')
      const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
      if (!res?.thumbnail_url) throw new Error('No thumbnail found for that video')
      setPreview({ kind: 'url', src: res.thumbnail_url })
      setResult(null)
      setRatingId(null)
      setImprovedUrl(null)
    } catch (err) {
      const { code, message } = parseApiError(err, 'Could not fetch thumbnail')
      setRateError(message)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
    } finally {
      setLoadingPreview(false)
    }
  }, [youtubeHint])

  const runAnalyze = useCallback(async () => {
    if (!canAnalyze) return
    setLoadingRate(true)
    setRateError('')
    setResult(null)
    setRatingId(null)
    setImprovedUrl(null)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to analyze')
      const payload = {
        video_title: videoTitle.trim() || undefined,
        niche: niche.trim() || undefined,
      }
      if (preview?.src) {
        if (preview.kind === 'data') {
          const b64 = extractBase64FromDataUrl(preview.src)
          if (!b64) throw new Error('Invalid image data')
          payload.thumbnail_image_base64 = b64
        } else {
          payload.thumbnail_image_url = preview.src
        }
      }
      const res = await thumbnailsApi.analyze(token, payload)
      setResult(res)
      setRatingId(res?.rating_id ?? null)
    } catch (err) {
      const { code, message } = parseApiError(err, 'Analysis failed')
      setRateError(message)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
    } finally {
      setLoadingRate(false)
    }
  }, [canAnalyze, preview, videoTitle, niche])

  const runImprove = useCallback(async () => {
    if (!ratingId) return
    setImproving(true)
    setRateError('')
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in required')
      const improveRes = await thumbnailsApi.improve(token, { rating_id: ratingId })
      const job = await pollJobUntilDone(token, improveRes?.job_id)
      const jobResult = job?.result_json
      const improved = jobResult?.improved_thumbnail || jobResult?.improved
      const imageUrl = improved?.image_url || jobResult?.image_url
      if (imageUrl) setImprovedUrl(imageUrl)
      else throw new Error('No improved image in result')
    } catch (err) {
      const { code, message } = parseApiError(err, 'Improvement failed')
      setRateError(message)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
    } finally {
      setImproving(false)
    }
  }, [ratingId])

  // ── Derived presentation values ──────────────────────────────────────────

  const hasThumbnail = result?.has_thumbnail ?? false
  const hasTitle = result?.has_title ?? false

  const thumbGrade = useMemo(() => {
    if (!result?.has_thumbnail) return null
    if (result.overall_grade) return String(result.overall_grade)
    return gradeFromScore(result.overall_score)
  }, [result])

  const thumbScore = useMemo(() => {
    if (!result?.has_thumbnail || result.overall_score == null) return null
    const n = Number(result.overall_score)
    return Number.isFinite(n) ? Math.round(n) : null
  }, [result])

  const orderedThumbCriteria = useMemo(() => {
    const arr = Array.isArray(result?.criteria) ? result.criteria.filter(Boolean) : []
    if (arr.length === 0) return []
    const byKey = new Map(arr.map((c) => [c?.key, c]))
    const ordered = []
    for (const key of THUMBNAIL_CRITERIA_ORDER) {
      if (byKey.has(key)) {
        ordered.push(byKey.get(key))
        byKey.delete(key)
      }
    }
    for (const remaining of byKey.values()) ordered.push(remaining)
    return ordered
  }, [result])

  const titleAnalysis = result?.title_analysis ?? null

  const orderedTitleCriteria = useMemo(() => {
    const arr = Array.isArray(titleAnalysis?.criteria) ? titleAnalysis.criteria.filter(Boolean) : []
    if (arr.length === 0) return []
    const byKey = new Map(arr.map((c) => [c?.key, c]))
    const ordered = []
    for (const key of TITLE_CRITERIA_ORDER) {
      if (byKey.has(key)) {
        ordered.push(byKey.get(key))
        byKey.delete(key)
      }
    }
    for (const remaining of byKey.values()) ordered.push(remaining)
    return ordered
  }, [titleAnalysis])

  const titleGrade = useMemo(() => {
    if (!titleAnalysis) return null
    if (titleAnalysis.grade) return String(titleAnalysis.grade)
    return gradeFromScore(titleAnalysis.score)
  }, [titleAnalysis])

  const titleScore = useMemo(() => {
    if (!titleAnalysis || titleAnalysis.score == null) return null
    const n = Number(titleAnalysis.score)
    return Number.isFinite(n) ? Math.round(n) : null
  }, [titleAnalysis])

  const titleSynergy = result?.title_synergy ?? null

  return (
    <div className="thumb-rater thumb-analyze">
      <div className="thumb-rater-hero">
        <h2 className="thumb-rater-title">Analyze</h2>
        <p className="thumb-rater-sub">
          Upload a thumbnail, enter a title, or both. Thumbnail analysis covers 10 visual criteria.
          Title analysis scores 7 text-specific factors. With both you also get a synergy card.
        </p>
      </div>

      <div className="thumb-rater-grid">
        <div
          className="thumb-rater-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="thumb-rater-file-input"
            onChange={(e) => applyFile(e.target.files?.[0])}
          />
          {!preview ? (
            <button
              type="button"
              className="thumb-rater-drop-inner"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="thumb-rater-drop-icon">
                <IconUpload />
              </span>
              <span className="thumb-rater-drop-label">Drop an image or click to upload</span>
              <span className="thumb-rater-drop-hint">PNG, JPG, WebP — optional</span>
            </button>
          ) : (
            <div className="thumb-rater-preview-wrap">
              <img
                src={preview.src}
                alt="Thumbnail to analyze"
                className="thumb-rater-preview-img"
                loading="lazy"
                decoding="async"
              />
              <div className="thumb-rater-preview-actions">
                <button type="button" className="thumb-rater-text-btn" onClick={clearImage}>
                  Remove
                </button>
                <button
                  type="button"
                  className="thumb-rater-text-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="thumb-rater-side">
          <label className="thumb-rater-label" htmlFor="thumb-analyze-yt">
            Or paste YouTube URL
          </label>
          <div className="thumb-rater-yt-row">
            <input
              id="thumb-analyze-yt"
              type="text"
              className="thumb-rater-input"
              value={youtubeHint}
              onChange={(e) => setYoutubeHint(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <button
              type="button"
              className="thumb-rater-btn thumb-rater-btn--secondary"
              onClick={fetchYoutubeThumb}
              disabled={loadingPreview}
            >
              {loadingPreview ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
          <label className="thumb-rater-label" htmlFor="thumb-analyze-title">
            Video title
          </label>
          <input
            id="thumb-analyze-title"
            type="text"
            className="thumb-rater-input"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value.slice(0, 200))}
            placeholder="Enter a title to analyze it, or leave blank for thumbnail-only"
          />
          <label className="thumb-rater-label" htmlFor="thumb-analyze-niche">
            Niche (optional)
          </label>
          <input
            id="thumb-analyze-niche"
            type="text"
            className="thumb-rater-input"
            value={niche}
            onChange={(e) => setNiche(e.target.value.slice(0, 100))}
            placeholder="e.g. tech, fitness, gaming"
          />

          <button
            id="thumb-analyze-cta"
            type="button"
            className="thumb-rater-btn thumb-rater-btn--primary"
            onClick={runAnalyze}
            disabled={!canAnalyze || loadingRate}
          >
            {loadingRate ? 'Analyzing…' : 'Run analysis'}
          </button>
          {!canAnalyze && (
            <p className="thumb-rater-hint-text">
              Add a thumbnail image or enter a title to begin.
            </p>
          )}
        </div>
      </div>

      {rateError && <div className="thumb-rater-error">{rateError}</div>}

      {loadingRate && (
        <div className="thumb-analyze-loading">
          <GenerationProgress estimatedDurationMs={14000} />
        </div>
      )}

      {result && !loadingRate && (
        <div className="thumb-rater-results thumb-analyze-results">
          {/* ── Thumbnail analysis ─────────────────────────────────── */}
          {hasThumbnail && (
            <div className="thumb-analysis-section">
              <SectionHeader>Thumbnail Analysis</SectionHeader>

              <HeroCard
                grade={thumbGrade}
                overallScore={thumbScore}
                ctrBand={result.predicted_ctr_band}
                oneLiner={result.one_liner}
                label="Thumbnail grade"
              />

              {orderedThumbCriteria.length > 0 ? (
                <div className="thumb-criteria-grid">
                  {orderedThumbCriteria.map((c, i) => (
                    <CriterionCard key={c?.key || `thumb-crit-${i}`} entry={c} />
                  ))}
                </div>
              ) : (
                <div className="thumb-criteria-empty">
                  Detailed criteria not available — re-run analysis.
                </div>
              )}

              <TakeawaysGrid strengths={result.top_strengths} fixes={result.top_fixes} />

              <div className="thumb-rater-improve-row">
                <button
                  type="button"
                  className="thumb-rater-btn thumb-rater-btn--magic"
                  onClick={runImprove}
                  disabled={!ratingId || improving}
                >
                  {improving ? (
                    <span className="thumb-rater-btn-loading">Improving…</span>
                  ) : (
                    <>
                      <IconSparkle />
                      AI improve thumbnail
                    </>
                  )}
                </button>
              </div>

              {improvedUrl && (
                <div className="thumb-rater-improved">
                  <span className="thumb-rater-section-title">Improved version</span>
                  <img
                    src={improvedUrl}
                    alt="AI-improved thumbnail"
                    className="thumb-rater-improved-img"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="thumb-rater-improved-actions">
                    <a
                      className="thumb-rater-btn thumb-rater-btn--primary"
                      href={improvedUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Title ↔ Thumbnail synergy (only when both provided) ─── */}
          {hasThumbnail && hasTitle && titleSynergy && (
            <div className="thumb-analysis-section">
              <SectionHeader>Title ↔ Thumbnail Synergy</SectionHeader>
              <div className="thumb-synergy-card">
                <div className="thumb-synergy-head">
                  <div className="thumb-synergy-meta">
                    {titleSynergy.score != null && (
                      <span className="thumb-synergy-score">
                        {Number(titleSynergy.score).toFixed(titleSynergy.score % 1 === 0 ? 0 : 1)}
                        <span className="thumb-criterion-score-max">/10</span>
                      </span>
                    )}
                    {titleSynergy.verdict && (
                      <span className={`thumb-verdict-pill ${verdictClass(titleSynergy.verdict)}`}>
                        {titleSynergy.verdict}
                      </span>
                    )}
                  </div>
                </div>
                {titleSynergy.explanation && (
                  <p className="thumb-criterion-text">{titleSynergy.explanation}</p>
                )}
                {titleSynergy.suggestion && (
                  <div className="thumb-criterion-suggest">
                    <span className="thumb-criterion-suggest-label">Try this</span>
                    <span className="thumb-criterion-suggest-text">{titleSynergy.suggestion}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Title analysis ─────────────────────────────────────── */}
          {hasTitle && titleAnalysis && (
            <div className="thumb-analysis-section">
              <SectionHeader>Title Analysis</SectionHeader>

              <HeroCard
                grade={titleGrade}
                overallScore={titleScore}
                oneLiner={titleAnalysis.one_liner}
                label="Title grade"
              />

              {orderedTitleCriteria.length > 0 ? (
                <div className="thumb-criteria-grid">
                  {orderedTitleCriteria.map((c, i) => (
                    <CriterionCard key={c?.key || `title-crit-${i}`} entry={c} />
                  ))}
                </div>
              ) : (
                <div className="thumb-criteria-empty">
                  Detailed criteria not available — re-run analysis.
                </div>
              )}

              <TakeawaysGrid
                strengths={titleAnalysis.top_strengths}
                fixes={titleAnalysis.top_fixes}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
