import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { scriptsApi } from '../api/scripts'
import {
  useScriptConversationQuery,
  useScriptWritingSuggestionsQuery,
} from '../queries/scripts/scriptQueries'
import { refreshScriptConversationCache } from '../lib/query/chatCacheUtils'
import { stripHashQueryParams } from '../lib/dashboardActionPayload'
import { ChatHistoryLoading } from '../components/ChatHistoryLoading'
import { Dropdown } from '../components/ui/Dropdown'
import { AnimatedComposerHint } from '../components/AnimatedComposerHint'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { useThreadScrollToBottom } from '../lib/useThreadScrollToBottom'
import './ScriptGenerator.css'

const SCRIPT_COMPOSER_HINTS = [
  'What script do you need?',
  'Topic… e.g. How to start a side hustle in 2024',
  'Ask me for a hook that opens with tension…',
  "Paste a title and I'll draft the full script…",
  'Need an intro that stops the scroll?',
  'Want a 60-second Short script?',
  'Tell me the video and target length…',
]

const SCRIPT_DRAFT_MAX_LEN = 3000

function packClarificationFromResponse(res) {
  if (!res?.clarification) return undefined
  return {
    clarification: {
      questions: res.clarification.questions ?? [],
      quick_replies: res.clarification.quick_replies ?? [],
    },
  }
}

function renderSimpleBoldText(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>
    return <span key={i}>{p}</span>
  })
}

function normalizeScriptRatingCategory(c) {
  if (!c || typeof c !== 'object') return null
  const imp = c.improvements ?? c.suggestions
  const improvements = Array.isArray(imp)
    ? imp.map((x) => String(x))
    : typeof imp === 'string' && imp.trim()
      ? [imp]
      : []
  const sc = c.score ?? c.value
  let score = null
  if (sc != null && sc !== '') {
    const n = Number(sc)
    if (!Number.isNaN(n)) score = Math.max(1, Math.min(100, Math.round(n)))
  }
  return {
    id: String(c.id || c.key || '').trim(),
    label: String(c.label || c.name || c.title || c.id || 'Category'),
    score,
    feedback: String(c.feedback || c.notes || c.analysis || ''),
    improvements,
    rewrite_example: c.rewrite_example ?? c.rewriteExample ?? c.example ?? null,
  }
}

function normalizeScriptRating(raw) {
  if (!raw || typeof raw !== 'object') return null
  const overallRaw = raw.overall_score ?? raw.overallScore ?? raw.total_score ?? raw.totalScore
  let overall_score = null
  if (overallRaw != null && overallRaw !== '') {
    const n = Number(overallRaw)
    if (!Number.isNaN(n)) overall_score = Math.max(1, Math.min(100, Math.round(n)))
  }
  const cats = Array.isArray(raw.categories)
    ? raw.categories.map(normalizeScriptRatingCategory).filter(Boolean)
    : []
  const weakSrc = raw.weak_sections ?? raw.weakSections ?? raw.weak_spots ?? []
  const weak = Array.isArray(weakSrc)
    ? weakSrc.map((w) => ({
        excerpt: String(w?.excerpt || w?.quote || w?.text || ''),
        issue: String(w?.issue || w?.problem || ''),
        fix: String(w?.fix || w?.suggestion || ''),
        rewrite_example: String(w?.rewrite_example || w?.rewriteExample || w?.rewrite || ''),
      }))
    : []
  const topSrc = raw.top_actions ?? raw.topActions ?? raw.actions ?? []
  const top_actions = Array.isArray(topSrc)
    ? topSrc.map((t) => String(t)).filter(Boolean)
    : typeof topSrc === 'string' && topSrc.trim()
      ? [topSrc]
      : []
  return {
    overall_score,
    executive_summary: String((raw.executive_summary ?? raw.executiveSummary ?? raw.summary) || ''),
    categories: cats,
    weak_sections: weak,
    top_actions,
  }
}

function packAssistantExtra(res) {
  const out = {}
  const cl = packClarificationFromResponse(res)
  if (cl) Object.assign(out, cl)
  if (res?.script_rating) {
    const normalized = normalizeScriptRating(res.script_rating)
    out.script_rating = normalized || res.script_rating
  }
  return Object.keys(out).length ? out : undefined
}

function ScriptRatingBlock({ rating, intro }) {
  const r = normalizeScriptRating(rating) || {}
  const cats = r.categories || []
  const weak = r.weak_sections || []
  const top = r.top_actions || []
  const overall = r.overall_score
  const summary = r.executive_summary || ''

  return (
    <div className="script-rating-block coach-stream-block">
      {intro?.trim() ? (
        <div className="script-rating-intro-banner">
          <span className="script-rating-intro-banner-label">Summary</span>
          <div className="script-rating-intro script-assistant-text">
            {renderSimpleBoldText(intro)}
          </div>
        </div>
      ) : null}

      <div className="script-rating-card">
        <div className="script-rating-hero">
          <div className="script-rating-hero-copy">
            <span className="script-rating-card-kicker">Script rater</span>
            <h3 className="script-rating-hero-title">Full script breakdown</h3>
            <p className="script-rating-hero-sub">
              Twelve dimensions from hook and intro through CTA, outro, and spoken delivery — plus
              weak lines and rewrites.
            </p>
          </div>
          {overall != null ? (
            <div
              className="script-rating-score-dial-wrap"
              aria-label={`Overall score ${overall} out of 100`}
              style={{ '--rating-score': String(overall) }}
            >
              <div className="script-rating-score-dial" aria-hidden />
              <div className="script-rating-score-dial-inner">
                <span className="script-rating-score-dial-num">{overall}</span>
                <span className="script-rating-score-dial-denom">/100</span>
              </div>
            </div>
          ) : (
            <div className="script-rating-score-dial-wrap script-rating-score-dial-wrap--na">
              <span className="script-rating-score-na">Score unavailable</span>
            </div>
          )}
        </div>

        {summary ? <p className="script-rating-summary">{summary}</p> : null}

        {cats.length > 0 ? (
          <div className="script-rating-categories">
            <div className="script-rating-section-head">
              <h4 className="script-rating-section-title">Dimension scores</h4>
              <span className="script-rating-section-meta">{cats.length} categories</span>
            </div>
            <ul className="script-rating-cat-grid">
              {cats.map((c, i) => (
                <li key={c.id || i} className="script-rating-cat">
                  <div className="script-rating-cat-top">
                    <span className="script-rating-cat-label">{c.label || c.id}</span>
                    <span className="script-rating-cat-score">{c.score ?? '—'}</span>
                  </div>
                  <div
                    className="script-rating-cat-bar"
                    role="progressbar"
                    aria-valuenow={c.score ?? 0}
                    aria-valuemin={1}
                    aria-valuemax={100}
                    style={{ '--cat-pct': `${c.score != null ? c.score : 0}%` }}
                  />
                  {c.feedback ? <p className="script-rating-cat-feedback">{c.feedback}</p> : null}
                  {(c.improvements?.length ?? 0) > 0 && (
                    <ul className="script-rating-cat-improve">
                      {c.improvements.map((im, j) => (
                        <li key={j}>{im}</li>
                      ))}
                    </ul>
                  )}
                  {c.rewrite_example ? (
                    <div className="script-rating-rewrite">
                      <span className="script-rating-rewrite-label">Example rewrite</span>
                      <pre className="script-rating-rewrite-pre">{c.rewrite_example}</pre>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="script-rating-empty-note">
            No category breakdown returned. Try sending again.
          </p>
        )}

        {weak.length > 0 ? (
          <div className="script-rating-weak">
            <div className="script-rating-section-head">
              <h4 className="script-rating-section-title">Weak lines & rewrites</h4>
              <span className="script-rating-section-meta">{weak.length} spots</span>
            </div>
            <ul className="script-rating-weak-list">
              {weak.map((w, i) => (
                <li key={i} className="script-rating-weak-item">
                  {w.excerpt ? (
                    <blockquote className="script-rating-excerpt">
                      &ldquo;{w.excerpt}&rdquo;
                    </blockquote>
                  ) : null}
                  {w.issue ? (
                    <p className="script-rating-issue">
                      <span className="script-rating-issue-label">Issue</span>
                      {w.issue}
                    </p>
                  ) : null}
                  {w.fix ? (
                    <p className="script-rating-fix">
                      <span className="script-rating-fix-label">Fix</span>
                      {w.fix}
                    </p>
                  ) : null}
                  {w.rewrite_example ? (
                    <pre className="script-rating-rewrite-pre script-rating-rewrite-pre--weak">
                      {w.rewrite_example}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {top.length > 0 ? (
          <div className="script-rating-top">
            <div className="script-rating-section-head">
              <h4 className="script-rating-section-title">Priority fixes</h4>
            </div>
            <ol className="script-rating-top-list">
              {top.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Mirrors API intent: full step loader only when we expect real script generation. */
const SCRIPT_INTENT_KEYWORDS = [
  'generate',
  'create',
  'make',
  'write',
  'script',
  'video about',
  'video on',
  'content about',
  'content on',
  'i need',
  'i want',
  'can you',
  'please',
]

function looksLikeScriptUiPayload(text) {
  return /\bTone:\s*\S+/i.test(text) || /\bAudience:\s*\S+/i.test(text)
}

function stripScriptUiSuffixes(text) {
  let s = String(text || '').trim()
  s = s.replace(/\s*\.?\s*Tone:\s*[^.]+\s*\.\s*Audience:\s*.+$/i, '')
  s = s.replace(/\s*\.?\s*Audience:\s*.+$/i, '')
  s = s.replace(/\s*\.?\s*Tone:\s*[^.]+$/i, '')
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/g, ' ')
    .trim()
    .replace(/^\.|\.$/g, '')
    .trim()
}

function clientTopicNeedsClarification(bare) {
  if (!bare || bare.length < 4) return true
  const words = bare.toLowerCase().match(/[a-z]{2,}/g) || []
  if (words.length < 1) return true
  const vowels = new Set('aeiouy')
  const isGarbage = (w) => ![...w].some((c) => vowels.has(c))
  const garbageCount = words.filter(isGarbage).length
  if (garbageCount >= Math.max(1, Math.ceil(words.length / 2))) return true
  if (words.length === 1 && words[0].length >= 10 && isGarbage(words[0])) return true
  return false
}

function hasScriptIntentKeyword(text) {
  const lower = String(text || '').toLowerCase()
  return SCRIPT_INTENT_KEYWORDS.some((k) => lower.includes(k))
}

/** Quick-reply lines always request generation; composer uses same heuristics as the API. */
function expectsFullScriptGeneration(message, isQuickReply) {
  if (isQuickReply) return true
  const text = String(message || '')
  const ui = looksLikeScriptUiPayload(text)
  const kw = hasScriptIntentKeyword(text)
  if (!kw && !ui) return false
  const bare = stripScriptUiSuffixes(text)
  if (!bare) return false
  if (clientTopicNeedsClarification(bare)) return false
  return true
}

/** Consecutive assistant clarification turns without a delivered script; resets after `has_script`. */
function clarificationStreakFromMessages(messageList) {
  let streak = 0
  for (const msg of messageList || []) {
    if (msg.role !== 'assistant') continue
    if (msg.has_script) {
      streak = 0
      continue
    }
    if (msg.extra?.clarification) streak += 1
  }
  return streak
}

function IconCopy() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function IconArrowUp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19 0-14" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconEmptyScript() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconEmptyShort() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="m10 10 4 2-4 2z" fill="currentColor" />
    </svg>
  )
}

function IconEmptyLong() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" />
    </svg>
  )
}

function IconEmptyEducational() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
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
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

const SCRIPT_LOADING_STEPS = [
  { id: 'concept', label: 'Refining your concept' },
  { id: 'hooks', label: 'Generating opening hooks' },
  { id: 'script', label: 'Writing the script' },
  { id: 'titles', label: 'Adding titles & metadata' },
  { id: 'polish', label: 'Quality check & polish' },
]

const SCRIPT_QUICK_ACTIONS = [
  {
    id: 'short',
    label: '60s Short about productivity',
    prompt: 'Generate a 60-second YouTube Short script about productivity hacks.',
    Icon: IconEmptyShort,
  },
  {
    id: 'long',
    label: '10-min script on side hustles',
    prompt: 'Generate a 10-minute script about how to start a side hustle.',
    Icon: IconEmptyLong,
  },
  {
    id: 'educ',
    label: 'Educational ML for beginners',
    prompt: 'Create an educational script about machine learning for beginners.',
    Icon: IconEmptyEducational,
  },
]

const TONE_OPTIONS = [
  { value: '', label: 'Any tone', hint: 'Let AI pick' },
  { value: 'educational', label: 'Educational', hint: 'Clear, instructive' },
  { value: 'entertaining', label: 'Entertaining', hint: 'Fun, engaging' },
  { value: 'conversational', label: 'Conversational', hint: 'Casual, friendly' },
  { value: 'professional', label: 'Professional', hint: 'Formal, polished' },
]

const AUDIENCE_OPTIONS = [
  { value: '', label: 'Any audience', hint: 'Let AI pick' },
  { value: 'beginners', label: 'Beginners', hint: 'New to the topic' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Some background' },
  { value: 'advanced', label: 'Advanced', hint: 'Expert viewers' },
]

function useCopy(text) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText && text) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch (_) {}
  }, [text])
  return [copy, copied]
}

function renderScriptInline(text, keyPrefix) {
  if (!text) return null
  const parts = String(text).split(
    /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[B-ROLL\]|\[ON-SCREEN TEXT\]|\[PAUSE\]|\[SFX\]|\[CUT\])/g
  )
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (/^\*\*\*[^*]+\*\*\*$/.test(part))
      return (
        <strong key={key}>
          <em>{part.slice(3, -3)}</em>
        </strong>
      )
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    if (/^\[(B-ROLL|ON-SCREEN TEXT|PAUSE|SFX|CUT)\]$/.test(part)) {
      return (
        <span key={key} className="script-marker">
          {part}
        </span>
      )
    }
    return <span key={key}>{part}</span>
  })
}

function renderScriptSegment(seg, index, keyPrefix) {
  const text = seg?.text || ''
  if (!text.trim()) return null
  const ts = seg?.timestamp_seconds
  const markers = Array.isArray(seg?.markers) ? seg.markers : []
  const lines = text.split('\n')
  return (
    <div key={`${keyPrefix}-seg-${index}`} className="script-segment">
      {ts != null && <span className="script-segment-ts">[{formatTimestamp(ts)}]</span>}
      {markers.length > 0 && (
        <span className="script-segment-markers">
          {markers.map((m, i) => (
            <span key={i} className="script-marker">
              {m.startsWith('[') ? m : `[${m}]`}
            </span>
          ))}
        </span>
      )}
      <div className="script-segment-text">
        {lines.map((line, li) => {
          const trimmed = line.trim()
          if (!trimmed) return <br key={`${keyPrefix}-${index}-line-${li}`} />
          if (/^###\s+/.test(trimmed)) {
            return (
              <h4 key={`${keyPrefix}-${index}-line-${li}`}>
                {renderScriptInline(trimmed.replace(/^###\s+/, ''), `${keyPrefix}-${index}-${li}`)}
              </h4>
            )
          }
          if (/^##\s+/.test(trimmed)) {
            return (
              <h3 key={`${keyPrefix}-${index}-line-${li}`}>
                {renderScriptInline(trimmed.replace(/^##\s+/, ''), `${keyPrefix}-${index}-${li}`)}
              </h3>
            )
          }
          if (/^#\s+/.test(trimmed)) {
            return (
              <h3 key={`${keyPrefix}-${index}-line-${li}`}>
                {renderScriptInline(trimmed.replace(/^#\s+/, ''), `${keyPrefix}-${index}-${li}`)}
              </h3>
            )
          }
          return (
            <p key={`${keyPrefix}-${index}-line-${li}`}>
              {renderScriptInline(trimmed, `${keyPrefix}-${index}-${li}`)}
            </p>
          )
        })}
      </div>
    </div>
  )
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`
}

function ScriptContentBlock({ pkg }) {
  const outline = pkg?.outline || []
  const script = pkg?.script || []

  const segmentsBySection = (() => {
    if (!outline.length) return [{ title: null, segments: script }]
    const groups = []
    for (let i = 0; i < outline.length; i++) {
      const sec = outline[i]
      const start = sec.start_time_seconds ?? 0
      const end = outline[i + 1]?.start_time_seconds ?? 999999
      const segs = script.filter((s) => {
        const ts = s?.timestamp_seconds ?? 0
        return ts >= start && ts < end
      })
      groups.push({ title: sec?.title || `Section ${i + 1}`, segments: segs })
    }
    const assigned = new Set(groups.flatMap((g) => g.segments))
    const unassigned = script.filter((s) => !assigned.has(s))
    if (unassigned.length) groups.push({ title: 'Continued', segments: unassigned })
    return groups
  })()

  const fullScriptParts = []
  if (pkg?.hook?.text) {
    fullScriptParts.push('# HOOK\n' + pkg.hook.text)
  }
  if (segmentsBySection.length) {
    segmentsBySection.forEach((group) => {
      if (group.title) fullScriptParts.push(`## ${group.title}`)
      group.segments.forEach((s) => {
        const ts = s?.timestamp_seconds
        const pre = ts != null ? `[${formatTimestamp(ts)}] ` : ''
        fullScriptParts.push(pre + (s?.text || ''))
      })
    })
  }
  const scriptText = fullScriptParts.join('\n\n')
  const [copyScript, copiedScript] = useCopy(scriptText)

  return (
    <div className="script-gen-content">
      {/* 1. HOOK first - prominent */}
      {pkg?.hook?.text && (
        <div className="script-gen-block script-gen-block--hook">
          <div className="script-gen-block-head">
            <span className="script-gen-block-title">HOOK</span>
          </div>
          <div className="script-gen-block-body">
            <p className="script-hook-text">{renderScriptInline(pkg.hook.text, 'hook')}</p>
            {pkg.backup_hooks?.length > 0 && (
              <div className="script-backup-hooks">
                <span className="script-backup-label">Backups:</span> {pkg.backup_hooks.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Full script with sections, headings, formatting */}
      {script.length > 0 && (
        <div className="script-gen-block script-gen-block--script">
          <div className="script-gen-block-head">
            <span className="script-gen-block-title">Script</span>
            <button
              type="button"
              className="script-gen-copy"
              onClick={copyScript}
              aria-label={copiedScript ? 'Copied' : 'Copy'}
            >
              <IconCopy />
              {copiedScript && <span className="script-gen-copy-ok">Copied</span>}
            </button>
          </div>
          <div className="script-gen-block-body">
            {segmentsBySection.map((group, gi) => (
              <div key={gi} className="script-section">
                {group.title && <h3 className="script-section-heading">{group.title}</h3>}
                {group.segments.map((seg, si) => renderScriptSegment(seg, si, `sec-${gi}`))}
              </div>
            ))}
          </div>
        </div>
      )}

      {pkg?.video_titles?.length > 0 && (
        <div className="script-gen-block script-gen-block--sm">
          <div className="script-gen-block-head">
            <span className="script-gen-block-title">Titles</span>
          </div>
          <div className="script-gen-block-body">
            <ol className="script-gen-list">
              {pkg.video_titles.slice(0, 5).map((t, i) => (
                <li key={i}>{t.title}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {pkg.script_score != null && (
        <div className="script-gen-block script-gen-block--sm">
          <div className="script-gen-block-head">
            <span className="script-gen-block-title">Score</span>
            <span className="script-gen-score">{pkg.script_score?.total_score ?? 0}/100</span>
          </div>
        </div>
      )}

      {pkg.script_rationale && (
        <div className="script-gen-block script-gen-block--sm">
          <div className="script-gen-block-head">
            <span className="script-gen-block-title">Why it works</span>
          </div>
          <div className="script-gen-block-body">
            {pkg.script_rationale.hook_psychology && (
              <p>
                <strong>Hook:</strong> {pkg.script_rationale.hook_psychology}
              </p>
            )}
            {pkg.script_rationale.retention_strategy && (
              <p>
                <strong>Retention:</strong> {pkg.script_rationale.retention_strategy}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ScriptGenerator({
  channelId,
  youtube: _youtube,
  conversationId: conversationIdProp,
  onNavigateToConversation,
}) {
  const queryClient = useQueryClient()
  const conversationQuery = useScriptConversationQuery(conversationIdProp ?? null)
  const loadedMessages = useMemo(
    () => conversationQuery.data?.messages?.items ?? [],
    [conversationQuery.data]
  )

  const [localMessages, setLocalMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [tone, setTone] = useState('')
  const [audience, setAudience] = useState('')
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  /** 'full' = multi-step generation UI; 'minimal' = fast clarify / short reply (no fake hour-long steps). */
  const [pendingLoadMode, setPendingLoadMode] = useState(null)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const stepIntervalRef = useRef(null)
  const prevConversationIdRef = useRef(undefined)
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const messages = conversationIdProp != null ? loadedMessages : localMessages
  const clarificationStreak = useMemo(() => clarificationStreakFromMessages(messages), [messages])
  const inputBlocked = clarificationStreak >= 3
  const suggestionsPrefetch = inputBlocked || clarificationStreak >= 2
  const suggestionsQuery = useScriptWritingSuggestionsQuery(channelId, suggestionsPrefetch)

  const isHistoryLoading =
    conversationIdProp != null &&
    (conversationQuery.isPending || conversationQuery.isPlaceholderData)
  const isEmptyScreen =
    !isHistoryLoading && messages.length === 0 && !pendingUserMessage && !pendingAssistant
  const layoutCentered = isEmptyScreen || isHistoryLoading
  const { showScrollToBottom, scrollToBottom } = useThreadScrollToBottom(threadRef, {
    enabled: !isHistoryLoading,
    deps: [messages.length, pendingUserMessage, pendingAssistant],
  })
  useEffect(() => {
    const prev = prevConversationIdRef.current
    prevConversationIdRef.current = conversationIdProp
    if (prev != null && conversationIdProp != null && prev !== conversationIdProp) {
      setLocalMessages([])
    }
  }, [conversationIdProp])

  const appliedDashKeyRef = useRef('')

  useEffect(() => {
    if (conversationIdProp != null) return
    const hash = (typeof window !== 'undefined' && window.location.hash) || ''
    const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
    const [routePart, search = ''] = normalized.split('?')
    if (routePart !== 'coach/scripts') return
    const params = new URLSearchParams(search)
    const rawPre = params.get('prefill')
    const concept = params.get('concept')
    const key = `${rawPre || ''}|${concept || ''}`
    if (!rawPre && !concept) return
    if (appliedDashKeyRef.current === key) return
    let line = ''
    if (rawPre) {
      try {
        line = decodeURIComponent(rawPre)
      } catch {
        line = rawPre
      }
    }
    if (concept) {
      try {
        const c = decodeURIComponent(concept.replace(/\+/g, ' '))
        line = line ? `${line}\n\nConcept: ${c}` : `Concept: ${c}`
      } catch {
        /* ignore */
      }
    }
    if (!line) return
    appliedDashKeyRef.current = key
    setDraft((d) => (d.trim() ? d : line))
    stripHashQueryParams(['prefill', 'concept'])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(len, len)
    })
  }, [conversationIdProp])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingUserMessage, pendingAssistant])

  useEffect(() => {
    if (!pendingAssistant || pendingLoadMode !== 'full') {
      setLoadingStepIndex(0)
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
        stepIntervalRef.current = null
      }
      return
    }
    setLoadingStepIndex(0)
    const totalSteps = SCRIPT_LOADING_STEPS.length
    const intervalMs = 850
    stepIntervalRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, totalSteps - 1))
    }, intervalMs)
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
      }
    }
  }, [pendingAssistant, pendingLoadMode])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(28, Math.min(el.scrollHeight, 140))}px`
  }, [draft])

  const handleQuickAction = (prompt) => {
    setDraft(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(len, len)
    })
  }

  const buildMessage = useCallback(() => {
    const topic = String(draft || '').trim()
    const parts = [topic]
    if (tone) parts.push(`Tone: ${tone}`)
    if (audience) parts.push(`Audience: ${audience}`)
    return parts.join('. ')
  }, [draft, tone, audience])

  const submitScriptMessage = useCallback(
    async (overrideText) => {
      const fromComposer = overrideText == null
      if (pendingAssistant) return
      if (fromComposer && clarificationStreak >= 3) return
      if (fromComposer && !String(draft || '').trim()) return
      const finalMessage = fromComposer ? buildMessage() : String(overrideText || '').trim()
      if (!finalMessage) return

      const draftSnapshot = draft
      const isQuickReply = overrideText != null
      const loadMode = expectsFullScriptGeneration(finalMessage, isQuickReply) ? 'full' : 'minimal'
      setSendError('')
      setPendingLoadMode(loadMode)
      setPendingUserMessage(finalMessage)
      setPendingAssistant(true)
      if (fromComposer) setDraft('')

      try {
        const token = await getAccessTokenOrNull()
        if (!token) throw new Error('Not authenticated')

        const res = await scriptsApi.sendChatMessage(
          token,
          {
            intent: 'generate',
            message: finalMessage,
            conversation_id: conversationIdProp ?? undefined,
            channel_id: channelId || undefined,
          },
          channelId
        )

        const extra = packAssistantExtra(res)

        if (conversationIdProp == null) {
          setLocalMessages((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, role: 'user', content: finalMessage },
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: res.content || '',
              script_response: res.script_response,
              has_script: res.has_script,
              extra,
            },
          ])
        }

        if (res.conversation_id != null) {
          await refreshScriptConversationCache(queryClient, res.conversation_id)
          onNavigateToConversation?.(res.conversation_id)
        }
      } catch (err) {
        setSendError(err?.message || 'Could not generate script.')
        if (fromComposer) setDraft(draftSnapshot)
      } finally {
        setPendingUserMessage(null)
        setPendingAssistant(false)
        setPendingLoadMode(null)
      }
    },
    [
      pendingAssistant,
      draft,
      buildMessage,
      conversationIdProp,
      channelId,
      queryClient,
      onNavigateToConversation,
      clarificationStreak,
    ]
  )

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    void submitScriptMessage(null)
  }

  const handleRetryAssistantMessage = (assistantMsg) => {
    if (pendingAssistant) return
    // Find the previous user message that triggered this assistant response
    const idx = messages.findIndex((m) => m.id === assistantMsg.id)
    if (idx <= 0) return
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        const prevText = messages[i].content
        if (prevText) {
          void submitScriptMessage(prevText)
        }
        return
      }
    }
  }

  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'assistant') return messages[i].id
    }
    return null
  }, [messages])

  const handleCopyMessage = async (msg) => {
    try {
      let text = msg.content || ''
      const rating = normalizeScriptRating(msg.extra?.script_rating)
      if (rating) {
        const lines = []
        if (rating.overall_score != null) lines.push(`Overall: ${rating.overall_score}/100`)
        if (rating.executive_summary) lines.push(rating.executive_summary)
        ;(rating.categories || []).forEach((c) => {
          lines.push(`\n${c.label || c.id}: ${c.score ?? '—'}`)
          if (c.feedback) lines.push(c.feedback)
        })
        text = lines.join('\n')
      } else if (msg.has_script && msg.script_response?.content_package?.script?.length) {
        text = msg.script_response.content_package.script.map((s) => s.text).join('\n\n')
      }
      if (navigator.clipboard?.writeText && text) await navigator.clipboard.writeText(text)
    } catch (_) {}
  }

  return (
    <div
      id="coach-panel-scripts"
      className="coach-main"
      role="tabpanel"
      aria-labelledby="coach-tab-scripts"
    >
      <section className="coach-chat-shell">
        <div
          ref={threadRef}
          className={`coach-thread ${layoutCentered ? 'coach-thread--empty' : ''} ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
        >
          {isHistoryLoading && (
            <ChatHistoryLoading
              kicker="Script Generator"
              label="Loading your script chat…"
              subtitle="Fetching script, ratings, and history."
            />
          )}
          {isEmptyScreen && (
            <div className="coach-empty-state">
              <span className="coach-empty-state-kicker">Script Generator</span>
              <h1>What script do you need?</h1>
              <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                {SCRIPT_QUICK_ACTIONS.map((action) => {
                  const Icon = action.Icon || IconEmptyScript
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={`coach-empty-action coach-empty-action--${action.id}`}
                      onClick={() => handleQuickAction(action.prompt)}
                    >
                      <span className="coach-empty-action-icon-wrap" aria-hidden>
                        <Icon />
                      </span>
                      <span className="coach-empty-action-label">{action.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!isHistoryLoading &&
            messages.map((msg) => (
              <article
                key={msg.id}
                className={`coach-message coach-message--enter ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
              >
                {msg.role === 'user' ? (
                  <div className="coach-user-message-stack">
                    <div
                      className={`coach-message-bubble ${String(msg.content || '').length > 800 ? 'coach-message-bubble--long-script' : ''}`}
                    >
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="coach-message-bubble">
                    {msg.extra?.script_rating ? (
                      <ScriptRatingBlock rating={msg.extra.script_rating} intro={msg.content} />
                    ) : msg.has_script && msg.script_response?.content_package ? (
                      <div className="script-gen-output-shell coach-stream-block">
                        <header className="script-gen-output-header">
                          <span className="script-gen-output-kicker">Script package</span>
                          <h3 className="script-gen-output-title">Your generated content</h3>
                          <p className="script-gen-output-meta">
                            Hook, script, titles, tags, and notes — together in one place.
                          </p>
                        </header>
                        {msg.content?.trim() ? (
                          <div className="script-gen-output-intro">
                            {renderMessageContent(msg.content, `script-intro-${msg.id}`)}
                          </div>
                        ) : null}
                        <div className="script-gen-output-body">
                          <ScriptContentBlock pkg={msg.script_response.content_package} />
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content
                          ? renderMessageContent(msg.content, `script-msg-${msg.id}`)
                          : null}
                        {msg.extra?.clarification && (
                          <div className="script-clarification-panel coach-stream-block">
                            {(msg.extra.clarification.questions?.length ?? 0) > 0 ? (
                              <ol className="script-clarification-questions">
                                {msg.extra.clarification.questions.map((q, qi) => (
                                  <li key={qi}>{q}</li>
                                ))}
                              </ol>
                            ) : null}
                            {msg.extra.clarification.quick_replies?.length > 0 && (
                              <div
                                className="script-clarification-chips"
                                role="group"
                                aria-label="Quick reply suggestions"
                              >
                                {msg.extra.clarification.quick_replies.map((qr, ri) => (
                                  <button
                                    key={ri}
                                    type="button"
                                    className="script-clarification-chip"
                                    disabled={pendingAssistant || inputBlocked}
                                    onClick={() => submitScriptMessage(qr.message)}
                                  >
                                    {qr.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="coach-message-actions">
                  <button
                    type="button"
                    className="coach-message-action"
                    onClick={() => handleCopyMessage(msg)}
                    aria-label="Copy"
                  >
                    <IconCopy />
                  </button>
                  {msg.role === 'assistant' && msg.id === lastAssistantMessageId && (
                    <button
                      type="button"
                      className="coach-message-action"
                      onClick={() => handleRetryAssistantMessage(msg)}
                      disabled={pendingAssistant}
                      aria-label="Try again"
                      title="Try again"
                    >
                      <IconRefresh />
                    </button>
                  )}
                </div>
              </article>
            ))}

          {pendingUserMessage && (
            <article className="coach-message coach-message--user coach-message--enter">
              <div className="coach-user-message-stack">
                <div className="coach-message-bubble">
                  <p>{pendingUserMessage}</p>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && pendingLoadMode === 'minimal' && (
            <article className="coach-message coach-message--assistant coach-message--enter">
              <div className="coach-message-bubble coach-message-bubble--loading">
                <div className="coach-assistant-loader" aria-label="Loading response">
                  <span className="coach-assistant-loader-orb" aria-hidden="true" />
                  <span className="coach-assistant-loader-lines" aria-hidden="true">
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--lg" />
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--md" />
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--sm" />
                  </span>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && pendingLoadMode === 'full' && (
            <article className="coach-message coach-message--assistant coach-message--enter script-gen-progress-wrap">
              <div
                className="script-gen-progress-card coach-stream-block"
                role="status"
                aria-live="polite"
                aria-label="Generating script"
              >
                <div
                  className="script-gen-progress-track"
                  aria-hidden
                  style={{
                    ['--script-gen-progress']: `${Math.min(
                      100,
                      ((loadingStepIndex + 0.35) / SCRIPT_LOADING_STEPS.length) * 100
                    )}%`,
                  }}
                />
                <header className="script-gen-progress-head">
                  <div className="script-gen-progress-head-left">
                    <span className="script-gen-progress-kicker">Generating</span>
                    <h3 className="script-gen-progress-title">Writing your script</h3>
                    <p className="script-gen-progress-sub">Hang tight — usually under a minute.</p>
                  </div>
                  <div className="script-gen-progress-head-right">
                    <span className="script-gen-progress-spinner" aria-hidden />
                    <span className="script-gen-progress-pill">
                      Step {Math.min(loadingStepIndex + 1, SCRIPT_LOADING_STEPS.length)} of{' '}
                      {SCRIPT_LOADING_STEPS.length}
                    </span>
                  </div>
                </header>
                <ol className="script-gen-progress-list">
                  {SCRIPT_LOADING_STEPS.map((step, i) => {
                    const done = i < loadingStepIndex
                    const active = i === loadingStepIndex
                    return (
                      <li
                        key={step.id}
                        className={`script-gen-progress-row ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
                        style={{ '--script-gen-i': i }}
                      >
                        <div className="script-gen-progress-row-left">
                          <span className="script-gen-progress-num" aria-hidden>
                            {i + 1}
                          </span>
                          <span className="script-gen-progress-label">{step.label}</span>
                        </div>
                        <div className="script-gen-progress-row-right">
                          {done ? (
                            <>
                              <span className="script-gen-progress-status script-gen-progress-status--done">
                                Complete
                              </span>
                              <span className="script-gen-progress-check" aria-hidden>
                                <IconCheck />
                              </span>
                            </>
                          ) : active ? (
                            <>
                              <span className="script-gen-progress-status script-gen-progress-status--active">
                                In progress
                              </span>
                              <span className="script-gen-progress-mini-ring" aria-hidden />
                            </>
                          ) : (
                            <>
                              <span className="script-gen-progress-status script-gen-progress-status--wait">
                                Pending
                              </span>
                              <span className="script-gen-progress-wait-dot" aria-hidden />
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div
          className={`coach-scroll-to-bottom ${showScrollToBottom && !isEmptyScreen ? 'coach-scroll-to-bottom--visible' : ''}`}
          aria-hidden={!showScrollToBottom || isEmptyScreen}
        >
          <button
            type="button"
            className="coach-scroll-to-bottom-btn"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <IconChevronDown />
          </button>
        </div>

        <footer
          className={`coach-composer-wrap ${inputBlocked ? 'coach-composer-wrap--script-blocked' : ''}`}
        >
          {inputBlocked && (
            <div
              className="script-gen-blocked-panel"
              role="region"
              aria-label="Pick a direction to continue"
            >
              <p className="script-gen-blocked-lead">
                We still need a clearer topic. Tap one idea below — it sends a ready-made prompt for
                your channel.
              </p>
              <div className="script-gen-suggestion-cards">
                {suggestionsQuery.isPending && (
                  <>
                    <div
                      className="script-gen-suggestion-card script-gen-suggestion-card--skeleton"
                      aria-hidden
                    />
                    <div
                      className="script-gen-suggestion-card script-gen-suggestion-card--skeleton"
                      aria-hidden
                    />
                    <div
                      className="script-gen-suggestion-card script-gen-suggestion-card--skeleton"
                      aria-hidden
                    />
                  </>
                )}
                {suggestionsQuery.isError && (
                  <p className="script-gen-suggestion-error">
                    Could not load ideas.{' '}
                    <button
                      type="button"
                      className="script-gen-suggestion-retry"
                      onClick={() => suggestionsQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {suggestionsQuery.data?.cards?.map((card, ci) => (
                  <button
                    key={ci}
                    type="button"
                    className="script-gen-suggestion-card"
                    disabled={pendingAssistant}
                    onClick={() => void submitScriptMessage(card.message)}
                  >
                    <span className="script-gen-suggestion-card-title">{card.title}</span>
                    {card.subtitle ? (
                      <span className="script-gen-suggestion-card-subtitle">{card.subtitle}</span>
                    ) : null}
                    <span className="script-gen-suggestion-card-desc">{card.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {sendError && <div className="coach-compose-error">{sendError}</div>}
          <form className="coach-composer script-gen-composer" onSubmit={handleSubmit}>
            <div className="coach-composer-input-wrap">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(String(e.target.value).slice(0, SCRIPT_DRAFT_MAX_LEN))}
                rows={1}
                className="coach-composer-input"
                maxLength={SCRIPT_DRAFT_MAX_LEN}
                disabled={inputBlocked}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
              {!draft ? (
                <AnimatedComposerHint hints={SCRIPT_COMPOSER_HINTS} paused={inputBlocked} />
              ) : null}
            </div>
            <div className="coach-composer-actions">
              <div className="coach-composer-actions-left script-gen-actions-left">
                <Dropdown
                  label="Tone"
                  value={tone}
                  onChange={setTone}
                  options={TONE_OPTIONS}
                  disabled={inputBlocked}
                  size="sm"
                />
                <Dropdown
                  label="Audience"
                  value={audience}
                  onChange={setAudience}
                  options={AUDIENCE_OPTIONS}
                  disabled={inputBlocked}
                  size="sm"
                />
              </div>
              <button
                type="submit"
                className="coach-composer-send coach-composer-primary-action is-send"
                disabled={pendingAssistant || inputBlocked || !draft.trim()}
                aria-label="Send"
              >
                <IconArrowUp />
              </button>
            </div>
          </form>
        </footer>
      </section>
    </div>
  )
}
