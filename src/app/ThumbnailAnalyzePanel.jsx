import { useState, useCallback, useRef, useMemo } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { toast } from '../lib/toast'
import { friendlyTitleFor, parseApiError } from '../lib/errorMessages'
import GenerationProgress from '../components/GenerationProgress'
import './ThumbnailRater.css'

const YOUTUBE_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

const CRITERIA_ORDER = [
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

/**
 * Thorough AI thumbnail analysis (POST /api/thumbnails/rate + optional /improve).
 */
export function ThumbnailAnalyzePanel() {
  const [preview, setPreview] = useState(null)
  const [youtubeHint, setYoutubeHint] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [niche, setNiche] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [rating, setRating] = useState(null)
  const [ratingId, setRatingId] = useState(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [rateError, setRateError] = useState('')
  const [improving, setImproving] = useState(false)
  const [improvedUrl, setImprovedUrl] = useState(null)
  const fileInputRef = useRef(null)

  const clearImage = useCallback(() => {
    setPreview(null)
    setRating(null)
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
      setRating(null)
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
      setRating(null)
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

  const runRate = useCallback(async () => {
    if (!preview?.src) return
    setLoadingRate(true)
    setRateError('')
    setRating(null)
    setRatingId(null)
    setImprovedUrl(null)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to analyze thumbnails')
      let payload
      if (preview.kind === 'data') {
        const b64 = extractBase64FromDataUrl(preview.src)
        if (!b64) throw new Error('Invalid image data')
        payload = {
          thumbnail_image_base64: b64,
          video_title: videoTitle.trim() || undefined,
          niche: niche.trim() || undefined,
        }
      } else {
        payload = {
          thumbnail_image_url: preview.src,
          video_title: videoTitle.trim() || undefined,
          niche: niche.trim() || undefined,
        }
      }
      const res = await thumbnailsApi.rate(token, payload)
      setRating(res)
      setRatingId(res?.rating_id ?? null)
    } catch (err) {
      const { code, message } = parseApiError(err, 'Analysis failed')
      setRateError(message)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
    } finally {
      setLoadingRate(false)
    }
  }, [preview, videoTitle, niche])

  const runImprove = useCallback(async () => {
    if (!ratingId) return
    setImproving(true)
    setRateError('')
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in required')
      const improveRes = await thumbnailsApi.improve(token, { rating_id: ratingId })
      const job = await pollJobUntilDone(token, improveRes?.job_id)
      const result = job?.result_json
      const improved = result?.improved_thumbnail || result?.improved
      const imageUrl = improved?.image_url || result?.image_url
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

  // Derive presentation values from the rating with legacy fallbacks.
  const overallScore = useMemo(() => {
    if (!rating) return null
    const n = Number(rating.overall_score)
    return Number.isFinite(n) ? Math.round(n) : null
  }, [rating])

  const grade = useMemo(() => {
    if (!rating) return null
    if (rating.overall_grade) return String(rating.overall_grade)
    return gradeFromScore(rating.overall_score)
  }, [rating])

  const orderedCriteria = useMemo(() => {
    const arr = Array.isArray(rating?.criteria) ? rating.criteria.filter(Boolean) : []
    if (arr.length === 0) return []
    const byKey = new Map(arr.map((c) => [c?.key, c]))
    const ordered = []
    for (const key of CRITERIA_ORDER) {
      if (byKey.has(key)) {
        ordered.push(byKey.get(key))
        byKey.delete(key)
      }
    }
    // Append any unexpected keys at the end so we never drop server data.
    for (const remaining of byKey.values()) ordered.push(remaining)
    return ordered
  }, [rating])

  const topStrengths = useMemo(() => {
    if (!rating) return []
    if (Array.isArray(rating.top_strengths) && rating.top_strengths.length > 0) {
      return rating.top_strengths.slice(0, 3)
    }
    if (Array.isArray(rating.strengths)) return rating.strengths.slice(0, 3)
    return []
  }, [rating])

  const topFixes = useMemo(() => {
    if (!rating) return []
    if (Array.isArray(rating.top_fixes) && rating.top_fixes.length > 0) {
      return rating.top_fixes.slice(0, 3)
    }
    if (Array.isArray(rating.recommendations)) return rating.recommendations.slice(0, 3)
    return []
  }, [rating])

  const titleSynergy = rating?.title_synergy || null
  const oneLiner = rating?.one_liner || rating?.specific_advice || ''
  const ctrBand = rating?.predicted_ctr_band || ''

  return (
    <div className="thumb-rater thumb-analyze">
      <div className="thumb-rater-hero">
        <h2 className="thumb-rater-title">Analyze</h2>
        <p className="thumb-rater-sub">
          Upload a thumbnail or fetch one from YouTube. You get a graded breakdown across 10
          criteria, predicted CTR band, and the highest-leverage fixes.
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
              <span className="thumb-rater-drop-hint">PNG, JPG, WebP — 16:9 works best</span>
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
            Video title (optional)
          </label>
          <input
            id="thumb-analyze-title"
            type="text"
            className="thumb-rater-input"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value.slice(0, 200))}
            placeholder="Helps tailor the analysis to your topic"
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
            onClick={runRate}
            disabled={!preview || loadingRate}
          >
            {loadingRate ? 'Running analysis…' : 'Run full analysis'}
          </button>
        </div>
      </div>

      {rateError && <div className="thumb-rater-error">{rateError}</div>}

      {loadingRate && (
        <div className="thumb-analyze-loading">
          <GenerationProgress estimatedDurationMs={14000} />
        </div>
      )}

      {rating && !loadingRate && (
        <div className="thumb-rater-results thumb-analyze-results">
          {/* Hero card */}
          <div className={`thumb-hero-card ${gradeTierClass(grade)}`}>
            <div className="thumb-hero-grade-wrap">
              <span className="thumb-hero-grade">{grade || '—'}</span>
              <span className="thumb-hero-grade-label">Overall grade</span>
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
              {(videoTitle || niche) && (
                <div className="thumb-hero-meta">
                  {videoTitle && (
                    <span className="thumb-hero-meta-item">
                      <span className="thumb-hero-meta-key">Title</span>
                      <span className="thumb-hero-meta-val">{videoTitle}</span>
                    </span>
                  )}
                  {niche && (
                    <span className="thumb-hero-meta-item">
                      <span className="thumb-hero-meta-key">Niche</span>
                      <span className="thumb-hero-meta-val">{niche}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Criterion cards grid */}
          {orderedCriteria.length > 0 ? (
            <div className="thumb-criteria-grid">
              {orderedCriteria.map((c, i) => (
                <CriterionCard key={c?.key || `crit-${i}`} entry={c} />
              ))}
            </div>
          ) : (
            <div className="thumb-criteria-empty">
              Detailed criteria not available — re-run analysis to get the new breakdown.
            </div>
          )}

          {/* Title synergy (only when title was provided AND synergy returned) */}
          {titleSynergy && (
            <div className="thumb-synergy-card">
              <div className="thumb-synergy-head">
                <span className="thumb-synergy-title">Title ↔ Thumbnail</span>
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
          )}

          {/* Strengths + Fixes */}
          {(topStrengths.length > 0 || topFixes.length > 0) && (
            <div className="thumb-takeaways-grid">
              {topStrengths.length > 0 && (
                <div className="thumb-takeaway-card thumb-takeaway--strengths">
                  <span className="thumb-takeaway-title">Top strengths</span>
                  <ul className="thumb-takeaway-list">
                    {topStrengths.map((s, i) => (
                      <li key={`str-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {topFixes.length > 0 && (
                <div className="thumb-takeaway-card thumb-takeaway--fixes">
                  <span className="thumb-takeaway-title">Top fixes</span>
                  <ul className="thumb-takeaway-list">
                    {topFixes.map((s, i) => (
                      <li key={`fix-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
    </div>
  )
}
