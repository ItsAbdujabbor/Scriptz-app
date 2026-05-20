import { memo, useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import FailedGenerationCard from '../../components/FailedGenerationCard'

function gradeFromScore(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return null
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

/**
 * Why-the-thumbnail-got-that-score block. One compact card under the
 * analyzed thumbnail: grade + score on the left, the AI's one-line
 * reason on the right, and up to three terse "fix this" bullets below.
 * Same width as the thumbnail card so the two read as a single unit.
 */
export const AnalysisBreakdown = memo(function AnalysisBreakdown({ analysis }) {
  const overallScore = useMemo(() => {
    const n = Number(analysis?.overall_score)
    return Number.isFinite(n) ? Math.round(n) : null
  }, [analysis])
  const grade = useMemo(() => {
    if (analysis?.overall_grade) return String(analysis.overall_grade)
    return gradeFromScore(analysis?.overall_score)
  }, [analysis])
  const fixes = useMemo(() => {
    const list =
      Array.isArray(analysis?.top_fixes) && analysis.top_fixes.length > 0
        ? analysis.top_fixes
        : Array.isArray(analysis?.recommendations)
          ? analysis.recommendations
          : []
    return list.filter(Boolean).slice(0, 3)
  }, [analysis])
  const oneLiner = analysis?.one_liner || analysis?.specific_advice || ''
  const notThumbnailNote =
    analysis?.is_youtube_thumbnail === false ? analysis?.not_thumbnail_note || null : null

  if (!analysis) return null
  // Backend emits a hard-coded fallback payload when the vision model fails
  // (see app/services/thumbnail_rating_service.py — "Analysis unavailable —
  // please retry." one-liner with a stock C / 50 grade and generic fixes).
  // Showing that card to the user is worse than showing nothing: it looks
  // like a real analysis result but carries zero signal. Suppress it; the
  // chat layer already renders an error toast for the underlying failure.
  if (analysis?.one_liner === 'Analysis unavailable — please retry.') return null
  return (
    <div className={`thumb-analysis-card coach-stream-block ${gradeTierClass(grade)}`}>
      {notThumbnailNote && <p className="thumb-analysis-card-not-thumb">⚠ {notThumbnailNote}</p>}
      <div className="thumb-analysis-card-head">
        <div className="thumb-analysis-card-grade">
          <span className="thumb-analysis-card-grade-letter">{grade || '—'}</span>
          <span className="thumb-analysis-card-score">
            {overallScore != null ? overallScore : '—'}
            <span className="thumb-analysis-card-score-max"> / 100</span>
          </span>
        </div>
        {oneLiner && <p className="thumb-analysis-card-oneliner">{oneLiner}</p>}
      </div>
      {fixes.length > 0 && (
        <ul className="thumb-analysis-card-fixes">
          {fixes.map((s, i) => (
            <li key={`fix-${i}`}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  )
})

// Map a Gemini click-likelihood score (0-100) to a tier so the score
// badge picks an appropriate accent colour without exposing raw
// thresholds in the JSX. Same buckets the model uses internally.
function titleScoreTier(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'na'
  if (n >= 90) return 'a'
  if (n >= 80) return 'b'
  if (n >= 70) return 'c'
  return 'd'
}

/**
 * TitleIdeasBlock — renders Gemini-generated YouTube title ideas as a
 * grid of cards with the title up top, a one-line "why this works"
 * reasoning below, and two action chips on the right: Copy (writes
 * the title to the clipboard) and Generate thumbnail (drops the
 * title into the Prompt-tab textarea and switches mode). Cards use
 * the same surface family as the thumbnail batch card and
 * stagger-enter via a CSS keyframe so the list reveals smoothly.
 */
export function TitleIdeasBlock({ titles, onUseTitle }) {
  const [copiedIndex, setCopiedIndex] = useState(null)
  const handleCopy = useCallback((text, idx) => {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
    setCopiedIndex(idx)
    setTimeout(() => {
      setCopiedIndex((current) => (current === idx ? null : current))
    }, 1400)
  }, [])
  return (
    <div className="thumb-titles-block coach-stream-block">
      <div className="thumb-titles-grid">
        {titles.map((t, i) => {
          const title = (t?.title || '').trim()
          if (!title) return null
          const copied = copiedIndex === i
          return (
            <div
              key={`${i}-${title}`}
              className="thumb-title-card"
              style={{ animationDelay: `${Math.min(i * 60, 780)}ms` }}
            >
              <span className="thumb-title-card__index">{i + 1}</span>
              <span className="thumb-title-card__body">
                <span className="thumb-title-card__title">{title}</span>
                {Number.isFinite(t?.score) && (
                  <span
                    className={`thumb-title-card__score thumb-title-card__score--${titleScoreTier(t.score)}`}
                    aria-label={`Click-likelihood score: ${t.score} of 100`}
                    title="Click-likelihood score"
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                      <path d="M12 2 14.55 8.5 21.5 9 16.25 13.6 17.85 20.5 12 17.1 6.15 20.5 7.75 13.6 2.5 9l6.95-.5L12 2z" />
                    </svg>
                    <span className="thumb-title-card__score-num">{t.score}</span>
                  </span>
                )}
              </span>
              <span className="thumb-title-card__actions">
                <button
                  type="button"
                  className={`thumb-title-action thumb-title-action--icon ${copied ? 'thumb-title-action--copied' : ''}`}
                  onClick={() => handleCopy(title, i)}
                  aria-label={copied ? 'Copied' : `Copy title: ${title}`}
                  title={copied ? 'Copied' : 'Copy title'}
                >
                  {copied ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                {onUseTitle && (
                  <button
                    type="button"
                    className="thumb-title-action thumb-title-action--primary"
                    onClick={() => onUseTitle(title)}
                    aria-label={`Generate a thumbnail for: ${title}`}
                    title="Generate a thumbnail with this title"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                      <path d="M19.5,24a1,1,0,0,1-.929-.628l-.844-2.113-2.116-.891a1.007,1.007,0,0,1,.035-1.857l2.088-.791.837-2.092a1.008,1.008,0,0,1,1.858,0l.841,2.1,2.1.841a1.007,1.007,0,0,1,0,1.858l-2.1.841-.841,2.1A1,1,0,0,1,19.5,24ZM10,21a2,2,0,0,1-1.936-1.413L6.45,14.54,1.387,12.846a2.032,2.032,0,0,1,.052-3.871L6.462,7.441,8.154,2.387A1.956,1.956,0,0,1,10.108,1a2,2,0,0,1,1.917,1.439l1.532,5.015,5.03,1.61a2.042,2.042,0,0,1,0,3.872h0l-5.039,1.612-1.612,5.039A2,2,0,0,1,10,21Z" />
                    </svg>
                    <span>Generate</span>
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ThumbnailLightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!url) return null
  return createPortal(
    <div
      className="thumb-gen-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Thumbnail preview"
    >
      <div className="thumb-gen-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt="" className="thumb-gen-lightbox-img" />
        <button
          type="button"
          className="thumb-gen-lightbox-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m18 6-12 12" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  )
}

/**
 * Renders a single failed-generation pair in the chat thread: the user's
 * prompt bubble (mirroring `ChatMessageItem`'s user-bubble shape) plus
 * the inline error card with retry / dismiss controls. Lives at the bottom
 * of the file so the chat list can call it as a regular component.
 */
export function FailedAttemptBlock({ entry, onRetry }) {
  // When `_skipUserBubble` is set the caller is preserving the
  // optimistic user_local entry separately (so the user's message
  // never remounts through the error swap) — render only the
  // assistant-side failure card. Without this flag the block also
  // owns the user bubble (used by analyze / recreate / titles /
  // event-retry paths that don't keep a separate user_local).
  const renderUserBubble = !entry._skipUserBubble && (entry.userImageUrl || entry.userText)
  return (
    <>
      {renderUserBubble ? (
        <article className="coach-message coach-message--user">
          <div className="coach-user-message-stack">
            {entry.userImageUrl ? (
              <div className="thumb-user-sent-image">
                <img
                  src={entry.userImageUrl}
                  alt="Sent thumbnail"
                  className="thumb-user-sent-img"
                  decoding="async"
                />
              </div>
            ) : null}
            {entry.userText ? (
              <div className="coach-message-bubble">
                <p>{entry.userText}</p>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
      <article className="coach-message coach-message--assistant">
        <FailedGenerationCard entry={entry} onRetry={onRetry} />
      </article>
    </>
  )
}
