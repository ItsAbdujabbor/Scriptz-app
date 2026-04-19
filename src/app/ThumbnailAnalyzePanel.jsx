import { useState, useCallback, useRef } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import './ThumbnailRater.css'

const YOUTUBE_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

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

function scoreTierClass(score) {
  if (score == null) return ''
  const n = Number(score)
  if (n >= 85) return 'thumb-rater-tier--high'
  if (n >= 60) return 'thumb-rater-tier--mid'
  return 'thumb-rater-tier--low'
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
      setRateError(err?.message || 'Could not fetch thumbnail')
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
      setRateError(err?.message || 'Analysis failed')
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
      setRateError(err?.message || 'Improvement failed')
    } finally {
      setImproving(false)
    }
  }, [ratingId])

  const sub = rating?.subscores
  const analysisLines = Array.isArray(rating?.analysis) ? rating.analysis.filter(Boolean) : []

  return (
    <div className="thumb-rater thumb-analyze">
      <div className="thumb-rater-hero">
        <h2 className="thumb-rater-title">Analyze</h2>
        <p className="thumb-rater-sub">
          Upload a thumbnail or fetch one from YouTube. You get scores, rubric breakdown, strengths
          and weaknesses, and step-by-step recommendations to improve CTR.
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

      {rating && (
        <div className="thumb-rater-results thumb-analyze-results">
          <div className={`thumb-rater-score-card ${scoreTierClass(rating.overall_score)}`}>
            <div className="thumb-rater-score-main">
              <span className="thumb-rater-score-value">
                {Math.round(Number(rating.overall_score) || 0)}
              </span>
              <span className="thumb-rater-score-label">Overall quality</span>
            </div>
            {rating.tier && <span className="thumb-rater-tier-badge">{rating.tier}</span>}
          </div>

          <div className="thumb-rater-metrics">
            <div className="thumb-rater-metric">
              <span className="thumb-rater-metric-label">CTR potential</span>
              <span className="thumb-rater-metric-val">
                {Math.round(Number(rating.ctr_potential_score) || 0)}
              </span>
            </div>
            <div className="thumb-rater-metric">
              <span className="thumb-rater-metric-label">Visual appeal</span>
              <span className="thumb-rater-metric-val">
                {Math.round(Number(rating.visual_appeal_score) || 0)}
              </span>
            </div>
            <div className="thumb-rater-metric">
              <span className="thumb-rater-metric-label">Composition</span>
              <span className="thumb-rater-metric-val">
                {Math.round(Number(rating.composition_score) || 0)}
              </span>
            </div>
            <div className="thumb-rater-metric">
              <span className="thumb-rater-metric-label">Contrast</span>
              <span className="thumb-rater-metric-val">
                {Math.round(Number(rating.color_contrast_score) || 0)}
              </span>
            </div>
            {rating.text_readability_score != null && (
              <div className="thumb-rater-metric">
                <span className="thumb-rater-metric-label">Text readability</span>
                <span className="thumb-rater-metric-val">
                  {Math.round(Number(rating.text_readability_score) || 0)}
                </span>
              </div>
            )}
            <div className="thumb-rater-metric">
              <span className="thumb-rater-metric-label">Emotional appeal</span>
              <span className="thumb-rater-metric-val">
                {Math.round(Number(rating.emotional_appeal_score) || 0)}
              </span>
            </div>
          </div>

          {sub && (
            <div className="thumb-rater-subscores">
              <span className="thumb-rater-section-title">Mobile-first rubric (raw)</span>
              <ul className="thumb-rater-sub-list">
                <li>
                  Clarity / readability{' '}
                  <strong>{sub.clarity != null ? Math.round(sub.clarity) : '—'}</strong> / 25
                </li>
                <li>
                  Contrast <strong>{sub.contrast != null ? Math.round(sub.contrast) : '—'}</strong>{' '}
                  / 20
                </li>
                <li>
                  Hook <strong>{sub.hook != null ? Math.round(sub.hook) : '—'}</strong> / 25
                </li>
                <li>
                  Hierarchy{' '}
                  <strong>{sub.hierarchy != null ? Math.round(sub.hierarchy) : '—'}</strong> / 20
                </li>
                <li>
                  Composition{' '}
                  <strong>{sub.composition != null ? Math.round(sub.composition) : '—'}</strong> /
                  10
                </li>
              </ul>
            </div>
          )}

          {analysisLines.length > 0 && (
            <div className="thumb-rater-block thumb-analyze-deep">
              <span className="thumb-rater-section-title">Detailed breakdown</span>
              <ul className="thumb-rater-bullets">
                {analysisLines.map((line, i) => (
                  <li key={`a-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {rating.strengths?.length > 0 && (
            <div className="thumb-rater-block">
              <span className="thumb-rater-section-title">Strengths</span>
              <ul className="thumb-rater-bullets">
                {rating.strengths.map((s, i) => (
                  <li key={`s-${i}`}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {rating.weaknesses?.length > 0 && (
            <div className="thumb-rater-block">
              <span className="thumb-rater-section-title">Weaknesses</span>
              <ul className="thumb-rater-bullets thumb-rater-bullets--weak">
                {rating.weaknesses.map((s, i) => (
                  <li key={`w-${i}`}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {rating.recommendations?.length > 0 && (
            <div className="thumb-rater-block">
              <span className="thumb-rater-section-title">Recommendations</span>
              <ol className="thumb-rater-numbered">
                {rating.recommendations.map((s, i) => (
                  <li key={`r-${i}`}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {rating.specific_advice && (
            <div className="thumb-rater-advice">
              <span className="thumb-rater-section-title">Expert summary</span>
              <p>{rating.specific_advice}</p>
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
