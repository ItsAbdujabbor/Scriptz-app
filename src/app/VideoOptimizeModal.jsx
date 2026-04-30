import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars
import { youtubeApi } from '../api/youtube'
import {
  Skeleton,
  SkeletonCard,
  SkeletonGroup,
  SkeletonText,
  SkeletonThumbGrid,
  InlineSpinner,
  PrimaryPill,
} from '../components/ui'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { useYoutubeVideoOptimization } from '../queries/youtube/optimizationQueries'
import {
  useVideoAICache,
  useActiveThumbnailJob,
  useThumbnailJob,
  useVideoThumbnails,
  useRateVideoThumbnail,
  lazyRateUnrated,
  videoOptimizeKeys,
} from '../queries/youtube/videoOptimizeQueries'
import { videoThumbnailsApi } from '../api/videoThumbnails'
import { friendlyMessage } from '../lib/aiErrors'
import { PersonaSelector } from '../components/PersonaSelector'
import { StyleSelector } from '../components/StyleSelector'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { useCostOf } from '../queries/billing/creditsQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { invalidateCredits } from '../queries/billing/creditsQueries'
import GenerationProgress from '../components/GenerationProgress'
import './VideoOptimizeModal.css'

function IconZapFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
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

/**
 * CreditBadge — inline zap + number chip, same visual as ThumbSendPill cost.
 * Use inside buttons to show how many credits an action costs.
 */
function CreditBadge({ featureKey, count = 1 }) {
  const { total } = useCostOf(featureKey, count)
  const { isSubscribed } = usePlanEntitlements()
  if (!isSubscribed || !total) return null
  return (
    <span className="vo-credit-badge" aria-hidden="true">
      <span className="vo-credit-badge-zap">
        <IconZapFilled />
      </span>
      <span className="vo-credit-badge-num">{total}</span>
    </span>
  )
}

/**
 * VOSendPill — thin wrapper around <PrimaryPill> so existing call sites
 * don't have to change. Gates the credit chip on `isSubscribed` just
 * like ThumbSendPill does in ThumbnailGenerator.
 */
function VOSendPill({
  featureKey = null,
  count = 1,
  disabled = false,
  loading = false,
  ariaLabel,
  onClick,
}) {
  const { isSubscribed } = usePlanEntitlements()
  return (
    <PrimaryPill
      type="button"
      featureKey={featureKey || undefined}
      count={count}
      showCost={isSubscribed}
      disabled={disabled}
      busy={loading}
      busyLabel=""
      ariaLabel={ariaLabel}
      icon={<IconArrowUp />}
      onClick={onClick}
    />
  )
}

function BatchCirclePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open])
  return (
    <div ref={ref} className={`vo-batch-picker ${disabled ? 'is-disabled' : ''}`}>
      <button
        type="button"
        className="vo-batch-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        title="Concepts per run"
      >
        <span className="vo-batch-val">{value}×</span>
      </button>
      {open && !disabled && (
        <div className="vo-batch-popover" role="listbox">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              className={`vo-batch-option ${n === value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
            >
              {n}×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS = [
  { value: 'title', label: 'Title' },
  { value: 'thumbnail', label: 'Thumbnails' },
  { value: 'seo', label: 'SEO' },
]

const SCORE_TIERS = [
  {
    id: 'great',
    min: 80,
    max: 100,
    label: 'Great',
    inlineClass: 'video-opt-score-inline--great',
    description: 'Strong, click-worthy title.',
  },
  {
    id: 'good',
    min: 60,
    max: 79,
    label: 'Good',
    inlineClass: 'video-opt-score-inline--good',
    description: 'Solid title with room to improve.',
  },
  {
    id: 'fair',
    min: 40,
    max: 59,
    label: 'Fair',
    inlineClass: 'video-opt-score-inline--fair',
    description: 'Title could be stronger.',
  },
  {
    id: 'poor',
    min: 0,
    max: 39,
    label: 'Poor',
    inlineClass: 'video-opt-score-inline--poor',
    description: 'Consider shortening or adding a hook.',
  },
]

function getScoreTier(score) {
  const n = Math.max(0, Math.min(100, Math.round(score)))
  return SCORE_TIERS.find((t) => n >= t.min && n <= t.max) || SCORE_TIERS[3]
}

/* ─ Thumbnail result card ─────────────────────────────────────────────
 * Click anywhere to select. Three always-visible round actions (Preview ·
 * Download · Delete) sit in a glass bar at the bottom of the image. Pass
 * `hideDelete` to suppress delete on immutable cards (e.g. the original). */
function ThumbResultCard({
  imageUrl,
  alt,
  score,
  badge,
  selected,
  onSelect,
  onPreview,
  onEdit,
  downloadName,
  onDelete,
  hideDelete = false,
  hideEdit = false,
}) {
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn?.()
  }
  return (
    <motion.div
      className={`video-opt-thumb-card ${selected ? 'video-opt-thumb-card--selected' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
      layout
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.()
        }
      }}
    >
      <div className="video-opt-thumb-card-img-wrap">
        {/* loading=lazy: browser defers off-screen images until they're
         *  about to scroll into view — the thumbnail grid can have many
         *  cards, only ~3-4 are visible at once. decoding=async lets the
         *  browser decode JPEG/PNG off the main thread so scrolling stays
         *  smooth even with several large images on screen at once. */}
        <img
          src={imageUrl}
          alt={alt || ''}
          className="video-opt-thumb-card-img"
          loading="lazy"
          decoding="async"
        />
        {selected && (
          <span className="video-opt-thumb-card-check" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 5 5L20 7" />
            </svg>
          </span>
        )}
        {badge && <span className="video-opt-thumb-card-badge">{badge}</span>}
        {score != null && (
          <span
            className={`video-opt-thumb-card-score video-opt-thumb-card-score--${getScoreTier(score).id}`}
          >
            {score}
          </span>
        )}
        <div className="video-opt-thumb-card-float" role="toolbar" aria-label="Thumbnail actions">
          <button
            type="button"
            className="video-opt-thumb-card-float-btn"
            onClick={stop(onPreview)}
            title="Preview"
            aria-label="Preview"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
          {!hideEdit && onEdit && (
            <button
              type="button"
              className="video-opt-thumb-card-float-btn"
              onClick={stop(onEdit)}
              title="Edit"
              aria-label="Edit"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 5.3a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 9.7-9.7z" />
                <path d="M13 7 17 11" />
              </svg>
            </button>
          )}
          <a
            href={imageUrl}
            download={downloadName}
            onClick={(e) => e.stopPropagation()}
            className="video-opt-thumb-card-float-btn"
            title="Download"
            aria-label="Download"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          {!hideDelete && onDelete && (
            <button
              type="button"
              className="video-opt-thumb-card-float-btn video-opt-thumb-card-float-btn--danger"
              onClick={stop(onDelete)}
              title="Delete"
              aria-label="Delete"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function VideoOptimizeModal({
  open,
  onClose,
  video,
  getValidAccessToken,
  channelId,
  channelTitle,
}) {
  const [activeTab, setActiveTab] = useState('title')
  const queryClient = useQueryClient()
  // Do NOT auto-generate — only fetch if already cached from a previous session
  const optimizationQuery = useYoutubeVideoOptimization({
    videoId: video?.id,
    channelId,
    enabled: false,
  })
  const data = optimizationQuery.data
  const loading = false
  const error = null
  const [titleInput, setTitleInput] = useState('')
  const [titleScore, setTitleScore] = useState(null)
  const [scoreTier, setScoreTier] = useState(null)
  const [scoreExplanation, setScoreExplanation] = useState(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  const [scoreDescVisible, setScoreDescVisible] = useState(false)
  const [titleRecommendations, setTitleRecommendations] = useState(null)
  const [titleRecsLoading, setTitleRecsLoading] = useState(false)
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [descriptionInput, setDescriptionInput] = useState('')
  const [tagsList, setTagsList] = useState([])
  const [tagsGenerated, setTagsGenerated] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagInputValue, setTagInputValue] = useState('')
  const [detailsCommand, setDetailsCommand] = useState('')
  const [refineDropdownOpen, setRefineDropdownOpen] = useState(false)
  const [refineLoading, setRefineLoading] = useState(false)
  const [seoNotice, setSeoNotice] = useState(null)
  // Inline notice for the Thumbnails tab — used to surface generation
  // errors (insufficient credits, server failures, AI errors) so the
  // user sees *why* the click had no visible effect. Without this, a
  // failed POST silently flips the spinner off and looks like nothing
  // happened.
  const [thumbNotice, setThumbNotice] = useState(null)
  const refineDropdownRef = useRef(null)
  const [thumbnailPrompt, setThumbnailPrompt] = useState('')
  const [thumbnailsByVideo, setThumbnailsByVideo] = useState({})
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [uploadedByVideo, setUploadedByVideo] = useState({})
  const THUMB_PROMPT_MAX = 2500
  const [thumbBatchCount, setThumbBatchCount] = useState(1)
  const videoId = video?.id

  // Pulls cached AI artifacts (titles / tags / refined description) on
  // open so the modal hydrates from disk instead of an empty state.
  // Skipped for the deep-link case where video.id is set but the modal
  // hasn't been "opened" yet to keep a stable behavior with the rest
  // of the lifecycle effects below.
  const aiCacheQuery = useVideoAICache(videoId, { enabled: open && !!videoId })

  // Resume polling for an in-flight thumbnail job when the user reopens
  // the modal — the bg task running on the server doesn't care that the
  // modal closed, so on reopen we want to find it and re-attach progress.
  const [activeJobId, setActiveJobId] = useState(null)
  const activeJobLookup = useActiveThumbnailJob(videoId, {
    enabled: open && !!videoId,
  })
  // Drive the listing through React Query so job-completion invalidations
  // automatically refresh the thumbnail grid.
  const thumbnailListQuery = useVideoThumbnails(videoId, {
    enabled: open && !!videoId,
  })
  // Mutation that runs the idempotent rate-by-id endpoint. The backend
  // returns the persisted score immediately when the row is already
  // rated (no AI call, no credit charge), so calling this on every open
  // for every thumbnail is safe — it's just a DB read in the common case.
  const rateThumbnailMutation = useRateVideoThumbnail(videoId)
  // When we kicked off a job ourselves OR found one to resume, this
  // hook polls /api/jobs/{id} until it terminates and triggers the
  // listing refresh.
  const trackedJobId = activeJobId || activeJobLookup.data?.job_id || null
  const thumbJobQuery = useThumbnailJob(trackedJobId, {
    videoId,
    enabled: !!trackedJobId,
  })

  const thumbnailBatch = thumbnailsByVideo[videoId] || []
  const uploadedThumbnails = uploadedByVideo[videoId] || []
  const [selectedPreviewThumbnailUrl, setSelectedPreviewThumbnailUrl] = useState(null)
  // (previewTheme removed with the Preview tab — left sidebar preview uses a fixed dark theme.)
  const [fullSizeImage, setFullSizeImage] = useState(null)
  const [editingUrl, setEditingUrl] = useState(null)
  const fileInputRef = useRef(null)
  const screenRef = useRef(null)
  const scoreAbortRef = useRef(null)
  const recsAbortRef = useRef(null)
  const refineAbortRef = useRef(null)
  const tagsAbortRef = useRef(null)
  const DESC_MAX = 5000
  const TAGS_MAX_CHARS = 500

  const REFINE_OPTIONS = [
    {
      id: 'firstlines',
      label: 'Optimize first 2 lines',
      icon: '🎯',
      instruction:
        'Rewrite the first 1-2 lines to maximize click-through from YouTube search results. YouTube only shows ~100 characters above the fold — these lines must create curiosity, include the primary keyword naturally, and give viewers a reason to click. Use a question, bold claim, or emotional hook.',
    },
    {
      id: 'keywords',
      label: 'Boost SEO keywords',
      icon: '🔍',
      instruction:
        "Analyze this description and naturally integrate high-ranking YouTube SEO keywords and long-tail phrases. Place the most important keyword in the first sentence. Include related terms that YouTube's algorithm uses for topic clustering. Do NOT keyword-stuff — keep it readable and natural. Ensure keywords match what users would actually search for on YouTube.",
    },
    {
      id: 'hooks',
      label: 'Add retention hooks',
      icon: '🪝',
      instruction:
        "Add compelling hooks optimized for YouTube's algorithm. Include: 1) A curiosity gap in the first line that makes viewers want to watch, 2) A value proposition (\"In this video you'll learn...\"), 3) Social proof or urgency if relevant. YouTube's algorithm favors descriptions that drive watch time — write hooks that set expectations and deliver.",
    },
    {
      id: 'cta',
      label: 'Add YouTube CTAs',
      icon: '📢',
      instruction:
        'Add strategic calls-to-action optimized for YouTube engagement signals. Include: 1) Subscribe + bell notification CTA, 2) "Like if you..." engagement prompt, 3) Comment question to boost comments (YouTube ranks videos with more comments higher), 4) Link to related video/playlist for session time. Place CTAs after delivering value, not at the very start.',
    },
    {
      id: 'timestamps',
      label: 'Add chapters',
      icon: '📑',
      instruction:
        'Add a YouTube Chapters section with timestamps. Format: start with "0:00 Introduction" and add logical chapter markers every 2-5 minutes. YouTube shows chapters in search results and on the progress bar — this improves CTR and watch time. Keep existing description content above the timestamps.',
    },
    {
      id: 'hashtags',
      label: 'Add hashtags',
      icon: '#️⃣',
      instruction:
        'Add 3-5 relevant YouTube hashtags at the very end of the description. YouTube shows the first 3 hashtags above the video title. Use: 1 broad category tag, 1-2 specific topic tags, 1 trending/niche tag. Format: #Hashtag (no spaces, capitalize each word). Do NOT use more than 15 hashtags — YouTube may ignore them all.',
    },
    {
      id: 'shorter',
      label: 'Make concise',
      icon: '✂️',
      instruction:
        'Shorten this description while keeping all SEO value. Remove filler words, redundant phrases, and generic statements. Keep keywords, CTAs, links, and timestamps. YouTube rewards descriptions that are information-dense — every sentence should serve a purpose for either the viewer or the algorithm.',
    },
    {
      id: 'longer',
      label: 'Expand description',
      icon: '📝',
      instruction:
        "Expand this description to 1000-2000 characters for maximum YouTube SEO benefit. Add: detailed video summary with keywords, related topics for algorithm clustering, social links section, related videos/playlists. YouTube's algorithm can extract topics from longer descriptions to recommend the video for more search queries.",
    },
  ]

  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (!refineDropdownOpen) return
    const handleClickOutside = (e) => {
      if (refineDropdownRef.current && !refineDropdownRef.current.contains(e.target))
        setRefineDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [refineDropdownOpen])

  useEffect(() => {
    if (open && video?.title != null) {
      setTitleInput(video.title || '')
      setSelectedRecommendationIndex(null)
      setSaveSuccess(false)
      // Title score + recommendations are hydrated from the per-video
      // AI cache (`/videos/{id}/ai-cache`) by the dedicated effect
      // below. Reset to null here so the badge isn't stuck on a stale
      // score from the previous video while the cache loads.
      setTitleScore(null)
      setScoreTier(null)
      setScoreExplanation(null)
      setTitleRecommendations(null)
    }
  }, [open, video?.id, video?.title])

  useEffect(() => {
    if (open && video?.id) {
      setThumbnailPrompt('')
      setSelectedPreviewThumbnailUrl(null)
    }
  }, [open, video?.id])

  // Scroll to top when screen opens
  useEffect(() => {
    if (open && screenRef.current) {
      screenRef.current.scrollTop = 0
    }
  }, [open, video?.id])

  // eslint-disable-next-line no-unused-vars -- retained for the YouTube preview card UI restored later
  const previewThumbnailUrl =
    selectedPreviewThumbnailUrl ||
    video?.thumbnail_url ||
    (video?.id ? `https://img.youtube.com/vi/${video.id}/mqdefault.jpg` : null)

  function formatPreviewCount(n) {
    if (n == null) return ''
    const num = typeof n === 'number' ? n : parseInt(String(n).replace(/\D/g, ''), 10)
    if (isNaN(num)) return ''
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B views'
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M views'
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K views'
    return num.toLocaleString() + ' views'
  }

  function formatPreviewTime(publishedAt) {
    if (!publishedAt) return ''
    try {
      const d = new Date(publishedAt)
      const now = new Date()
      const diffMs = now - d
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return '1 day ago'
      if (diffDays < 7) return `${diffDays} days ago`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
      return `${Math.floor(diffDays / 365)} years ago`
    } catch {
      return ''
    }
  }

  // eslint-disable-next-line no-unused-vars -- retained for the YouTube preview card UI restored later
  const previewChannelName =
    channelTitle || data?.channel_title || video?.channel_title || 'Your channel'

  // Hydrate from video's existing YouTube data (not AI-generated)
  useEffect(() => {
    if (!open) return
    setDescriptionInput(video?.description || '')
    // Load existing tags from video if available
    if (Array.isArray(video?.tags) && video.tags.length > 0) {
      setTagsList(video.tags.map((t) => ({ tag: String(t).trim(), score: null })))
      setTagsGenerated(true)
    } else {
      setTagsList([])
      setTagsGenerated(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id])

  useEffect(() => {
    if (!open) return
    // Only use cached AI data if it exists (from a previous manual generation)
    if (data?.title_options?.length && !video?.title) {
      const idx = data.default_title_index ?? 0
      setTitleInput(data.title_options[idx] || '')
    }
  }, [open, data?.title_options, data?.default_title_index, video?.title])

  // Hydrate from per-video AI cache (server-side persisted) on open. Each
  // mutation in the modal (title-recommendations, score-title, generate-
  // tags, refine-description) writes through to this cache so the next
  // session picks up where the user left off — no credits charged on
  // rehydration. The cache is per-user, so the same artifacts surface
  // across devices.
  const aiCacheData = aiCacheQuery.data
  useEffect(() => {
    if (!open || !aiCacheData) return

    // Title recommendations — alternatives to the video, not to a
    // specific phrasing, so they apply regardless of titleInput edits.
    if (
      Array.isArray(aiCacheData.title_recommendations) &&
      aiCacheData.title_recommendations.length > 0 &&
      !titleRecommendations
    ) {
      setTitleRecommendations({
        titles: aiCacheData.title_recommendations,
        thumbnail_url:
          video?.thumbnail_url ||
          (video?.id ? `https://img.youtube.com/vi/${video.id}/mqdefault.jpg` : ''),
      })
    }

    // Title score — only apply when the cached score was computed for
    // the title text currently in the input. If the user has typed
    // something different since, the cached score doesn't apply yet.
    const cachedScore = aiCacheData.title_score
    if (
      cachedScore &&
      typeof cachedScore === 'object' &&
      cachedScore.score != null &&
      titleScore == null
    ) {
      const cachedTitle = String(cachedScore.title || '').trim()
      const currentTitle = String(titleInput || '').trim()
      if (cachedTitle && cachedTitle.toLowerCase() === currentTitle.toLowerCase()) {
        setTitleScore(cachedScore.score)
        setScoreTier(cachedScore.tier ?? null)
        setScoreExplanation(cachedScore.explanation ?? null)
      }
    }

    if (
      Array.isArray(aiCacheData.generated_tags) &&
      aiCacheData.generated_tags.length > 0 &&
      // Don't override live YouTube tags — only fill when none are loaded.
      tagsList.length === 0
    ) {
      setTagsList(aiCacheData.generated_tags.map((t) => ({ tag: t.tag, score: t.score })))
      setTagsGenerated(true)
    }
    // refined_description is intentionally NOT auto-applied; the live
    // YouTube description is the source of truth in the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiCacheData, video?.id, titleInput])

  // After any AI mutation completes (success or server error) refresh the
  // credits badge — the server has already debited (or refunded on failure).
  const _creditsBadgeRefresh = {
    onSuccess: () => invalidateCredits(queryClient),
    onError: () => invalidateCredits(queryClient),
  }

  const titleRecommendationsMutation = useMutation({
    mutationFn: async ({ videoIdea, thumbnailUrl }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.getTitleRecommendations(token, {
        video_idea: videoIdea,
        thumbnail_url: thumbnailUrl,
        // Backend uses this to persist the result so the next modal
        // open hydrates from cache without re-charging credits.
        video_id: videoId || undefined,
      })
    },
    onSuccess: () => {
      invalidateCredits(queryClient)
      // Bring the AI cache query up to date with the just-written row.
      if (videoId) {
        queryClient.invalidateQueries({
          queryKey: videoOptimizeKeys.aiCache(videoId),
        })
      }
    },
    onError: () => invalidateCredits(queryClient),
  })

  const refineDescriptionMutation = useMutation({
    mutationFn: async ({ videoId, description, instruction }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.refineDescription(token, {
        video_id: videoId,
        description,
        instruction,
      })
    },
    ..._creditsBadgeRefresh,
  })

  const generateTagsMutation = useMutation({
    mutationFn: async ({ videoId, description, title }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.generateTags(token, {
        video_id: videoId,
        description: description || undefined,
        title: title || undefined,
      })
    },
    ..._creditsBadgeRefresh,
  })

  const scoreTitleMutation = useMutation({
    mutationFn: async ({ title, videoId }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.scoreTitle(token, title, videoId || null)
    },
    onSuccess: () => {
      invalidateCredits(queryClient)
      // Refetch the AI cache so a subsequent open (or another device)
      // sees the freshly-saved title_score without another round-trip.
      if (videoId) {
        queryClient.invalidateQueries({
          queryKey: videoOptimizeKeys.aiCache(videoId),
        })
      }
    },
    onError: () => invalidateCredits(queryClient),
  })

  const fetchTitleRecommendations = () => {
    if (titleRecsLoading) {
      recsAbortRef.current?.abort()
      setTitleRecsLoading(false)
      return
    }
    if (!video?.title?.trim()) return
    const ac = new AbortController()
    recsAbortRef.current = ac
    setTitleRecsLoading(true)
    titleRecommendationsMutation
      .mutateAsync({
        videoIdea: titleInput.trim() || video.title,
        thumbnailUrl: video.thumbnail_url || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      })
      .then((res) => {
        if (ac.signal.aborted) return
        setTitleRecommendations(res)
        // The backend already write-throughs the recommendations to
        // the per-video AI cache (see /title-recommendations route).
        // Refetch so a subsequent open / another device hydrates from
        // the freshly-saved server payload.
        if (videoId) {
          queryClient.invalidateQueries({
            queryKey: videoOptimizeKeys.aiCache(videoId),
          })
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setTitleRecommendations(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setTitleRecsLoading(false)
      })
  }

  const showSeoNotice = (text, tone = 'success') => {
    setSeoNotice({ text, tone })
    setTimeout(() => setSeoNotice(null), 2800)
  }

  const showThumbNotice = (text, tone = 'error') => {
    setThumbNotice({ text, tone })
    // Errors stay on screen longer than success toasts — give the user
    // time to read what went wrong before it auto-clears.
    setTimeout(() => setThumbNotice(null), tone === 'error' ? 5000 : 2800)
  }

  // Defers to the shared mapper in lib/aiErrors. The API client now
  // throws structured Errors (status, code, retryAfterMs, ...) so the
  // mapper can return precise messages — "Service is busy. Try again
  // in 30 seconds." instead of a generic regex-matched string.
  const friendlyGenerateError = (err) => friendlyMessage(err)

  const handleStopRefine = () => {
    refineAbortRef.current?.abort()
    setRefineLoading(false)
  }

  const handleRefineDescription = (instruction) => {
    setRefineDropdownOpen(false)
    if (!video?.id) return
    const ac = new AbortController()
    refineAbortRef.current = ac
    setRefineLoading(true)
    refineDescriptionMutation
      .mutateAsync({ videoId: video.id, description: descriptionInput, instruction })
      .then((res) => {
        if (ac.signal.aborted) return
        if (res?.description != null) {
          setDescriptionInput(res.description)
          showSeoNotice('Description updated.')
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) showSeoNotice('Could not refine. Try again.', 'error')
      })
      .finally(() => {
        if (!ac.signal.aborted) setRefineLoading(false)
      })
  }

  const handleRegenerateDescription = () => {
    handleRefineDescription(
      `Rewrite this YouTube description to maximize search ranking and viewer engagement. Keep the same core topic but: 1) Put the strongest keyword in the first sentence, 2) Write the first 2 lines as a curiosity-driven hook (YouTube shows ~100 chars in search), 3) Include 3-5 natural keyword variations for algorithm topic clustering, 4) Add a subscribe CTA and comment prompt, 5) Keep it under 2000 characters for optimal readability. Follow YouTube SEO best practices.`
    )
  }

  const handleCopyDescription = async () => {
    if (!descriptionInput?.trim()) return
    try {
      await navigator.clipboard?.writeText(descriptionInput)
      showSeoNotice('Copied to clipboard.')
    } catch {
      showSeoNotice('Could not copy.', 'error')
    }
  }

  const handleGenerateTags = () => {
    if (tagsLoading) {
      tagsAbortRef.current?.abort()
      setTagsLoading(false)
      return
    }
    if (!video?.id) return
    const ac = new AbortController()
    tagsAbortRef.current = ac
    setTagsLoading(true)
    generateTagsMutation
      .mutateAsync({
        videoId: video.id,
        description: descriptionInput || undefined,
        title: titleInput?.trim() || video?.title || undefined,
      })
      .then((res) => {
        if (ac.signal.aborted) return
        if (res?.tags?.length) {
          setTagsList(res.tags.map((t) => ({ tag: t.tag, score: t.score })))
          setTagsGenerated(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setTagsLoading(false)
      })
  }

  const getYoutubeUrl = () => (video?.id ? `https://www.youtube.com/watch?v=${video.id}` : '')

  // Mirror the React-Query-managed thumbnail list into the legacy
  // `thumbnailsByVideo` state so the rest of the modal (which reads
  // ``thumbnailBatch``) keeps working unchanged. The query is the
  // source of truth; we just project it.
  useEffect(() => {
    if (!open || !videoId) return
    const items = thumbnailListQuery.data?.thumbnails
    if (Array.isArray(items)) {
      setThumbnailsByVideo((prev) => ({
        ...prev,
        [videoId]: items.map((t) => ({
          ...t,
          id: t.id,
          image_url: t.image_url,
          title: t.title || 'Generated',
          source: t.source || 'generated',
        })),
      }))
    }
  }, [open, videoId, thumbnailListQuery.data])

  // Lazy-rate any unrated rows after the listing arrives. Idempotent
  // server-side: rated rows return their score for free with no AI
  // call and no credit charge. Per-video guard prevents the effect
  // from re-firing on every cache merge while a rate is in flight.
  const lazyRatedKeyRef = useRef(null)
  useEffect(() => {
    if (!open || !videoId) return
    const items = thumbnailListQuery.data?.thumbnails
    if (!Array.isArray(items) || items.length === 0) return
    // Re-trigger when the set of unrated ids changes — covers the
    // "user generated more thumbnails" case without re-running for a
    // simple cache-data identity change.
    const unratedIds = items
      .filter((t) => t && t.id && t.rating_score == null)
      .map((t) => t.id)
      .sort((a, b) => a - b)
      .join(',')
    const key = `${videoId}:${unratedIds}`
    if (unratedIds === '' || lazyRatedKeyRef.current === key) return
    lazyRatedKeyRef.current = key
    lazyRateUnrated(items, rateThumbnailMutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId, thumbnailListQuery.data])

  // The "thumbnail loading" UI follows the active job: an in-flight job
  // (queued or running) means generation is happening even if the user
  // closed and reopened the modal. The local generate handler also flips
  // it on while the initial POST is in flight — tying both paths to a
  // single derived bool keeps the UI consistent.
  const activeJobStatus = thumbJobQuery.data?.status || activeJobLookup.data?.status || null
  const isJobActive = activeJobStatus === 'queued' || activeJobStatus === 'running'
  const derivedThumbnailLoading = thumbnailLoading || isJobActive

  // When the resume lookup finds an in-flight job for this video, lock
  // onto its id so useThumbnailJob takes over polling.
  useEffect(() => {
    if (activeJobLookup.data?.job_id && !activeJobId) {
      setActiveJobId(activeJobLookup.data.job_id)
    }
  }, [activeJobLookup.data?.job_id, activeJobId])

  // When a tracked job terminates, clear our local tracking + drop the
  // synthetic loading flag. The thumbnail listing query is invalidated
  // by useThumbnailJob's onSuccess — the new rows show up automatically.
  // On failure, surface the server-side error string so the user sees
  // *why* nothing rendered, instead of just a silent spinner-off.
  useEffect(() => {
    const status = thumbJobQuery.data?.status
    if (status === 'done' || status === 'failed') {
      setActiveJobId(null)
      setThumbnailLoading(false)
      invalidateCredits(queryClient)
      if (status === 'failed') {
        const err = thumbJobQuery.data?.error || 'Generation failed.'
        showThumbNotice(err.slice(0, 240), 'error')
      }
    }
     
  }, [thumbJobQuery.data?.status, thumbJobQuery.data?.error, queryClient])

  const handleGenerateThumbnails = async () => {
    if (derivedThumbnailLoading) return
    const url = getYoutubeUrl()
    const userPrompt = thumbnailPrompt.trim()
    const contextPrompt = `Create a better, more click-worthy version of the current thumbnail for this video. Keep the same style and subject but make it more eye-catching.`
    const prompt = userPrompt || contextPrompt
    if (!url && !prompt) return
    const message = url ? `${url} ${prompt}` : prompt
    setThumbnailLoading(true)
    setThumbnailPrompt('')
    // Credits are charged immediately on the backend — even if the
    // user closes the modal, the bg job continues and the credits stay
    // debited. Refunds happen automatically on AI failure.
    invalidateCredits(queryClient)
    try {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      const res = await videoThumbnailsApi.generate(token, {
        video_id: videoId,
        channel_id: channelId || undefined,
        message,
        num_thumbnails: thumbBatchCount,
        persona_id: undefined,
        style_id: undefined,
      })
      // The async endpoint returns immediately with a job_id; thumbnails
      // are []. Hand the job_id off to the polling hook — when the job
      // completes it invalidates the listing query and the new rows
      // show up automatically. setThumbnailLoading(false) happens in
      // the terminal-status effect, not here, so the spinner stays up
      // until the work is actually done.
      if (res?.job_id) {
        setActiveJobId(res.job_id)
      } else {
        // Server returned 200 but no job_id — defensive: don't leave
        // the spinner stuck and tell the user something's off so they
        // can retry.
        setThumbnailLoading(false)
        showThumbNotice('Could not start generation. Try again.', 'error')
      }
    } catch (err) {
      setThumbnailLoading(false)
      invalidateCredits(queryClient)
      // Surface the failure — without this, the user sees the spinner
      // flip off and assumes the click did nothing. The friendly
      // mapper handles 402 (insufficient credits), 401, 429, timeouts.
      showThumbNotice(friendlyGenerateError(err), 'error')
    }
  }

  const handleUploadThumbnail = (e) => {
    const files = e?.target?.files
    if (!files?.length) return
    const file = files[0]
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setUploadedByVideo((prev) => ({
        ...prev,
        [videoId]: [
          ...(prev[videoId] || []),
          { image_url: dataUrl, title: 'Uploaded', id: `upload-${Date.now()}` },
        ],
      }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveUploaded = (id) => {
    const removed = uploadedThumbnails.find((u) => u.id === id)
    if (removed && selectedPreviewThumbnailUrl === removed.image_url) {
      setSelectedPreviewThumbnailUrl(null)
    }
    setUploadedByVideo((prev) => ({
      ...prev,
      [videoId]: (prev[videoId] || []).filter((u) => u.id !== id),
    }))
  }

  const handleRemoveGenerated = async (id) => {
    const removed = thumbnailBatch.find((t) => t.id === id)
    if (removed && selectedPreviewThumbnailUrl === removed.image_url) {
      setSelectedPreviewThumbnailUrl(null)
    }
    // Remove from local state immediately
    setThumbnailsByVideo((prev) => ({
      ...prev,
      [videoId]: (prev[videoId] || []).filter((t) => t.id !== id),
    }))
    // Delete from server
    try {
      const token = await getValidAccessToken()
      if (token && typeof id === 'number') {
        await videoThumbnailsApi.delete(token, id)
      }
    } catch (_) {}
  }

  const handleDetailsCommandSubmit = () => {
    const cmd = detailsCommand.trim()
    if (!cmd) return
    handleRefineDescription(cmd)
    setDetailsCommand('')
  }

  const removeTag = (index) => {
    setTagsList((prev) => prev.filter((_, i) => i !== index))
  }

  const addTag = (tag) => {
    const t = String(tag).trim().toLowerCase()
    if (!t || tagsList.some((x) => x.tag === t)) return
    setTagsList((prev) => [...prev, { tag: t, score: null }])
    setTagInputValue('')
  }

  const handleScore = () => {
    if (scoreLoading) {
      scoreAbortRef.current?.abort()
      setScoreLoading(false)
      return
    }
    const trimmed = titleInput.trim()
    if (!trimmed) return
    const ac = new AbortController()
    scoreAbortRef.current = ac
    setScoreLoading(true)
    scoreTitleMutation
      // Passing `videoId` lets the backend write the result through to
      // the per-video AI cache, so the next open (here or on another
      // device) rehydrates the badge for free.
      .mutateAsync({ title: trimmed, videoId: video?.id || null })
      .then((res) => {
        if (ac.signal.aborted) return
        const score = res?.score ?? null
        const tier = res?.tier ?? getScoreTier(res?.score).id
        const explanation = res?.explanation ?? null
        setTitleScore(score)
        setScoreTier(tier)
        setScoreExplanation(explanation)
      })
      .catch(() => {
        if (ac.signal.aborted) return
        setTitleScore(null)
        setScoreTier(null)
        setScoreExplanation(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setScoreLoading(false)
      })
  }

  const tagsArray = tagsList.map((t) => t.tag).filter(Boolean)
  const hasTitleChanges = titleInput.trim() !== (video?.title || '').trim()
  const hasDescChanges = descriptionInput !== (video?.description ?? data?.description ?? '')
  const currentDataTags = data?.tags || video?.tags || []
  const hasTagChanges =
    tagsArray.join(',') !== (Array.isArray(currentDataTags) ? currentDataTags.join(',') : '')
  const hasChanges = hasTitleChanges || hasDescChanges || hasTagChanges

  const updateVideoMetadataMutation = useMutation({
    mutationFn: async ({ videoId, payload }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.updateVideoMetadata(token, videoId, payload, channelId || null)
    },
    onMutate: async ({ videoId, payload }) => {
      const previousEntries = queryClient.getQueriesData({
        queryKey: ['youtube', 'videos', channelId],
        exact: false,
      })
      for (const [qk, old] of previousEntries) {
        if (!old || !Array.isArray(old.items)) continue
        queryClient.setQueryData(qk, {
          ...old,
          items: old.items.map((item) => (item?.id === videoId ? { ...item, ...payload } : item)),
        })
      }

      return { previousEntries }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previousEntries) return
      for (const [qk, data] of ctx.previousEntries) queryClient.setQueryData(qk, data)
    },
    onSuccess: (_res, { videoId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtube.videoOptimization(videoId) })
      queryClient.invalidateQueries({ queryKey: ['youtube', 'videos', channelId], exact: false })
    },
  })

  const handleSave = async () => {
    if (!video?.id || !hasChanges) return
    setSaving(true)
    setSaveSuccess(false)
    const payload = {}
    if (hasTitleChanges) payload.title = titleInput.trim()
    if (hasDescChanges) payload.description = descriptionInput
    if (hasTagChanges) payload.tags = tagsArray
    try {
      await updateVideoMetadataMutation.mutateAsync({ videoId: video.id, payload })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (_) {
      // Error UI is handled by the existing save state.
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <motion.div
      className="video-opt-screen"
      ref={screenRef}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
    >
      {/* AI edit dialog — opens from any thumbnail card's Edit button. The
       *  result is pushed into the "Uploaded" bucket so it appears in the
       *  grid immediately (we don't mutate the YouTube thumbnail itself). */}
      {editingUrl && (
        <EditThumbnailDialog
          imageUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onApply={(result) => {
            const urls = Array.isArray(result) ? result : [result]
            const added = urls.filter(Boolean).map((image_url, i) => ({
              image_url,
              title: 'Edited',
              id: `edit-${Date.now()}-${i}`,
            }))
            if (added.length) {
              setUploadedByVideo((prev) => ({
                ...prev,
                [videoId]: [...added, ...(prev[videoId] || [])],
              }))
              setSelectedPreviewThumbnailUrl(added[0].image_url)
            }
            setEditingUrl(null)
          }}
        />
      )}

      {/* Full-size image viewer */}
      <AnimatePresence>
        {fullSizeImage && (
          <motion.div
            className="video-opt-fullsize-overlay"
            onClick={() => setFullSizeImage(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.img
              src={fullSizeImage}
              alt="Full size"
              className="video-opt-fullsize-img"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
            />
            <button
              type="button"
              className="video-opt-fullsize-close"
              onClick={() => setFullSizeImage(null)}
              aria-label="Close"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header
        className="video-opt-screen-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: [0.33, 1, 0.68, 1] }}
      >
        <div className="video-opt-screen-header-left">
          <button
            type="button"
            className="video-opt-back-btn"
            onClick={onClose}
            aria-label="Back to videos"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </button>
        </div>
        <div className="video-opt-screen-header-center">
          <div className="video-opt-screen-video-info">
            {video?.thumbnail_url && (
              <img src={video.thumbnail_url} alt="" className="video-opt-screen-thumb" />
            )}
            <div className="video-opt-screen-video-text">
              <h2 className="video-opt-screen-title">{video?.title || 'Video optimization'}</h2>
              <p className="video-opt-screen-subtitle">AI suggestions — edit and save to YouTube</p>
            </div>
          </div>
        </div>
        <div className="video-opt-screen-header-right">
          {video?.id && (
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="video-opt-watch-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
              </svg>
              Watch
            </a>
          )}
          <button
            type="button"
            className={`video-opt-save-btn ${saveSuccess ? 'video-opt-save-btn--success' : ''}`}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <span className="video-opt-btn-spinner" aria-hidden />
                Updating YouTube…
              </>
            ) : saveSuccess ? (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Updated on YouTube
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </motion.header>

      {/* Split layout: preview left + tools right */}
      <div className="video-opt-split">
        {/* Left — live preview */}
        <aside className="video-opt-preview-sidebar">
          <div className="video-opt-preview-sidebar-inner">
            <div className="video-opt-preview-sidebar-card">
              <div className="video-opt-preview-sidebar-thumb">
                <img
                  src={
                    selectedPreviewThumbnailUrl ||
                    video?.thumbnail_url ||
                    (video?.id ? `https://img.youtube.com/vi/${video.id}/mqdefault.jpg` : '')
                  }
                  alt=""
                />
                {video?.duration_minutes != null &&
                  video.duration_minutes > 0 &&
                  (() => {
                    const tot = Math.round(video.duration_minutes * 60)
                    const h = Math.floor(tot / 3600)
                    const m = Math.floor((tot % 3600) / 60)
                    const s = tot % 60
                    const pad = (n) => String(n).padStart(2, '0')
                    const t = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
                    return <span className="video-opt-preview-sidebar-duration">{t}</span>
                  })()}
              </div>
              <div className="video-opt-preview-sidebar-meta">
                <h3 className="video-opt-preview-sidebar-title">
                  {titleInput || video?.title || 'Untitled'}
                </h3>
                <p className="video-opt-preview-sidebar-channel">
                  {channelTitle || video?.channel_title || 'Your channel'}
                </p>
                <p className="video-opt-preview-sidebar-stats">
                  {formatPreviewCount(video?.view_count)}
                  {video?.view_count != null && video?.published_at && ' · '}
                  {formatPreviewTime(video?.published_at)}
                </p>
              </div>
              {descriptionInput && (
                <div className="video-opt-preview-sidebar-desc">
                  <p>
                    {descriptionInput.slice(0, 160)}
                    {descriptionInput.length > 160 ? '…' : ''}
                  </p>
                </div>
              )}
              {tagsGenerated && tagsList.length > 0 && (
                <div className="video-opt-preview-sidebar-tags">
                  {tagsList.slice(0, 8).map((t, i) => (
                    <span key={i} className="video-opt-preview-sidebar-tag">
                      {t.tag}
                    </span>
                  ))}
                  {tagsList.length > 8 && (
                    <span className="video-opt-preview-sidebar-tag">+{tagsList.length - 8}</span>
                  )}
                </div>
              )}
            </div>
            <div className="video-opt-preview-sidebar-hint">Live preview — updates as you edit</div>
          </div>
        </aside>

        {/* Right — tools */}
        <div className="video-opt-tools">
          <div className="video-opt-screen-tabrow">
            <SegmentedTabs
              value={activeTab}
              onChange={setActiveTab}
              options={TABS}
              ariaLabel="Optimization sections"
              layoutId="video-opt-tabs"
              className="video-opt-tabs"
            />
          </div>

          <div className="video-opt-screen-body">
            {loading && (
              <div className="video-opt-loading">
                <SkeletonGroup label="Generating suggestions">
                  <SkeletonCard ratio="16 / 9" lines={3} />
                  <SkeletonText lines={2} lineHeight={14} />
                  <SkeletonThumbGrid cols={3} count={3} />
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 12,
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: 13,
                    }}
                  >
                    <InlineSpinner size={12} />
                    <span>Generating suggestions…</span>
                  </div>
                </SkeletonGroup>
              </div>
            )}
            {error && (
              <div className="video-opt-error">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{error}</span>
                <button
                  type="button"
                  className="video-opt-error-retry"
                  onClick={() => optimizationQuery.refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  className={`video-opt-panel ${activeTab === 'title' ? 'video-opt-panel--top' : ''}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
                >
                  {/* === TITLE TAB === */}
                  {activeTab === 'title' && (
                    <div className="video-opt-title-studio">
                      <header className="video-opt-title-studio-hero">
                        <div className="video-opt-title-studio-hero-inner">
                          <span className="video-opt-title-studio-kicker">Title lab</span>
                          <h3 className="video-opt-title-studio-heading">
                            Dial in a headline that earns the click
                          </h3>
                          <p className="video-opt-title-studio-lead">
                            Tune your title, run an AI score, then try alternate hooks below — what
                            you pick stays in sync with Preview and Save changes.
                          </p>
                        </div>
                      </header>

                      <section
                        className="video-opt-title-editor-card"
                        aria-labelledby="video-opt-title-field-label"
                      >
                        <div className="video-opt-title-editor-card-top">
                          <label
                            id="video-opt-title-field-label"
                            className="video-opt-title-editor-label"
                            htmlFor="video-opt-title-field"
                          >
                            Working title
                          </label>
                          <span className="video-opt-title-char-count" aria-live="polite">
                            {titleInput.length}
                            <span className="video-opt-title-char-max">/100</span>
                          </span>
                        </div>
                        <div className="video-opt-title-row video-opt-title-row--stack">
                          <div className="video-opt-title-input-wrap">
                            <input
                              id="video-opt-title-field"
                              type="text"
                              className="video-opt-title-input"
                              value={titleInput}
                              onChange={(e) => setTitleInput(e.target.value)}
                              placeholder="Type a title or start from the video's current one…"
                              aria-label="Video title"
                              maxLength={100}
                            />
                            <button
                              type="button"
                              className={`video-opt-score-btn ${scoreLoading ? 'video-opt-score-btn--loading' : ''}`}
                              onClick={handleScore}
                              disabled={!titleInput.trim() && !scoreLoading}
                            >
                              {scoreLoading ? (
                                <>
                                  <span className="video-opt-btn-spinner" aria-hidden />
                                  <span>Stop</span>
                                </>
                              ) : (
                                <>
                                  <span className="video-opt-score-btn-icon" aria-hidden>
                                    ✦
                                  </span>
                                  Score title
                                  <CreditBadge featureKey="title_score" />
                                </>
                              )}
                            </button>
                          </div>
                          {titleScore != null && (
                            <button
                              type="button"
                              className={`video-opt-score-badge ${scoreTier ? `video-opt-score-badge--${scoreTier}` : `video-opt-score-badge--${getScoreTier(titleScore).id}`}`}
                              onClick={() => setScoreDescVisible((v) => !v)}
                              aria-expanded={scoreDescVisible}
                              title={scoreExplanation || getScoreTier(titleScore).description}
                            >
                              <span className="video-opt-score-badge-num">{titleScore}</span>
                              <span className="video-opt-score-badge-label">
                                {scoreTier || getScoreTier(titleScore).label}
                              </span>
                              <span className="video-opt-score-badge-chevron" aria-hidden>
                                {scoreDescVisible ? '▲' : '▼'}
                              </span>
                            </button>
                          )}
                        </div>
                        {titleScore != null && scoreDescVisible && (
                          <p
                            className="video-opt-score-desc video-opt-score-desc--card"
                            role="region"
                            aria-live="polite"
                          >
                            {scoreExplanation || getScoreTier(titleScore).description}
                          </p>
                        )}
                      </section>

                      <section
                        className="video-opt-reco-suite"
                        aria-labelledby="video-opt-reco-suite-title"
                      >
                        <div className="video-opt-reco-suite-head">
                          <div className="video-opt-reco-suite-head-text">
                            <h3
                              id="video-opt-reco-suite-title"
                              className="video-opt-reco-suite-title"
                            >
                              Alternate hooks
                            </h3>
                          </div>
                          {video?.title && (
                            <button
                              type="button"
                              className={`video-opt-generate-btn video-opt-generate-btn--ghost ${titleRecsLoading ? 'video-opt-generate-btn--loading' : ''}`}
                              onClick={fetchTitleRecommendations}
                              disabled={!video?.title?.trim() && !titleRecsLoading}
                            >
                              {titleRecsLoading ? (
                                <span className="video-opt-btn-spinner" aria-hidden />
                              ) : (
                                <span className="video-opt-generate-btn-icon" aria-hidden>
                                  ↻
                                </span>
                              )}
                              {titleRecsLoading
                                ? 'Stop'
                                : titleRecommendations?.titles?.length
                                  ? 'Fresh ideas'
                                  : 'Generate ideas'}
                              {!titleRecsLoading && <CreditBadge featureKey="title_generate_3" />}
                            </button>
                          )}
                        </div>
                        {video?.title && (
                          <div className="video-opt-recommendations-grid">
                            {[0, 1, 2].map((i) => {
                              const item = titleRecommendations?.titles?.[i]
                              const isLoading = titleRecsLoading
                              const isPlaceholder = !item
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  className={`video-opt-reco-card ${selectedRecommendationIndex === i ? 'video-opt-reco-card--selected' : ''} ${isPlaceholder ? 'video-opt-reco-card--placeholder' : ''}`}
                                  onClick={() => {
                                    if (isPlaceholder) return
                                    const next = selectedRecommendationIndex === i ? null : i
                                    setSelectedRecommendationIndex(next)
                                    if (next !== null && titleRecommendations?.titles?.[next]) {
                                      setTitleInput(titleRecommendations.titles[next].title)
                                    }
                                  }}
                                  disabled={isPlaceholder}
                                >
                                  <div className="video-opt-reco-thumb">
                                    <img
                                      src={
                                        titleRecommendations?.thumbnail_url ||
                                        video?.thumbnail_url ||
                                        ''
                                      }
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                    />
                                    {!isPlaceholder && item?.score != null && (
                                      <span
                                        className={`video-opt-reco-score-pill video-opt-reco-score-pill--${getScoreTier(item.score).id}`}
                                      >
                                        <span className="video-opt-reco-score-pill-num">
                                          {item.score}
                                        </span>
                                        <span className="video-opt-reco-score-pill-label">
                                          {getScoreTier(item.score).label}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={`video-opt-reco-title-wrap ${isPlaceholder ? 'video-opt-reco-title-wrap--blur' : ''}`}
                                  >
                                    {isLoading ? (
                                      <Skeleton
                                        height={16}
                                        width="92%"
                                        radius={999}
                                        style={{ margin: '4px 0' }}
                                      />
                                    ) : (
                                      <p className="video-opt-reco-title">
                                        {item?.title ?? 'Your alternate title lands here'}
                                      </p>
                                    )}
                                    {!isPlaceholder && !isLoading && (
                                      <span className="video-opt-reco-use-hint">
                                        Use this title
                                      </span>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {!video?.title && (
                          <p className="video-opt-reco-empty">
                            Select a video from Optimize to unlock AI title ideas.
                          </p>
                        )}
                      </section>
                    </div>
                  )}

                  {/* === THUMBNAIL TAB === */}
                  {activeTab === 'thumbnail' && (
                    <div className="video-opt-thumb-panel">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="video-opt-thumb-file-input"
                        onChange={handleUploadThumbnail}
                      />

                      {/* Inline notice — surfaces generation failures
                       *  (insufficient credits, AI errors, network) so a
                       *  failed click doesn't look like nothing happened.
                       *  Reuses the SEO-tab notice CSS for a consistent
                       *  look across tabs. */}
                      <AnimatePresence>
                        {thumbNotice && (
                          <motion.div
                            className={`video-opt-seo-notice video-opt-seo-notice--${thumbNotice.tone}`}
                            role="status"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                          >
                            {thumbNotice.text}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Thumbnail gallery — action cards + thumbnails in same grid */}
                      <div className="video-opt-thumb-gallery">
                        {/* Quick generate */}
                        <button
                          type="button"
                          className={`video-opt-thumb-card video-opt-thumb-card--action ${derivedThumbnailLoading ? 'video-opt-thumb-card--action-active' : ''}`}
                          onClick={handleGenerateThumbnails}
                          disabled={derivedThumbnailLoading || !video?.id}
                        >
                          {derivedThumbnailLoading ? (
                            <span className="video-opt-btn-spinner" aria-hidden />
                          ) : (
                            <svg
                              width="26"
                              height="26"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M12 2L2 7l10 5 10-5-10-5z" />
                              <path d="M2 17l10 5 10-5" />
                              <path d="M2 12l10 5 10-5" />
                            </svg>
                          )}
                          <span className="video-opt-thumb-card-action-label">
                            {derivedThumbnailLoading ? 'Generating…' : 'Quick generate'}
                          </span>
                          {!derivedThumbnailLoading && (
                            <CreditBadge featureKey="video_thumbnail_generate" />
                          )}
                        </button>

                        {/* Start from frame */}
                        <button
                          type="button"
                          className="video-opt-thumb-card video-opt-thumb-card--action"
                          onClick={handleGenerateThumbnails}
                          disabled={!video?.id}
                        >
                          <svg
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect x="2" y="2" width="20" height="20" rx="2" />
                            <path d="M9 2v20" />
                            <path d="M2 12h7" />
                          </svg>
                          <span className="video-opt-thumb-card-action-label">
                            Start from frame
                          </span>
                        </button>

                        {/* Upload */}
                        <button
                          type="button"
                          className="video-opt-thumb-card video-opt-thumb-card--action"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <svg
                            width="26"
                            height="26"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span className="video-opt-thumb-card-action-label">Upload</span>
                        </button>

                        {/* Current — original YouTube thumbnail, cannot be deleted.
                         *  Editing opens the dialog with a fresh copy; the original on
                         *  YouTube is never overwritten from here. */}
                        <ThumbResultCard
                          imageUrl={
                            video?.thumbnail_url ||
                            `https://img.youtube.com/vi/${video?.id}/mqdefault.jpg`
                          }
                          alt="Current"
                          badge="Current"
                          selected={!selectedPreviewThumbnailUrl}
                          onSelect={() => setSelectedPreviewThumbnailUrl(null)}
                          onPreview={() =>
                            setFullSizeImage(
                              video?.thumbnail_url ||
                                `https://img.youtube.com/vi/${video?.id}/mqdefault.jpg`
                            )
                          }
                          onEdit={() =>
                            setEditingUrl(
                              video?.thumbnail_url ||
                                `https://img.youtube.com/vi/${video?.id}/mqdefault.jpg`
                            )
                          }
                          downloadName={`current-${video?.id || 'thumbnail'}.jpg`}
                          hideDelete
                        />

                        {/* Generating */}
                        <AnimatePresence>
                          {derivedThumbnailLoading && (
                            <motion.div
                              className="video-opt-thumb-card video-opt-thumb-card--generating"
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="video-opt-thumb-card-img-wrap">
                                <div className="video-opt-thumb-generating-placeholder">
                                  <GenerationProgress estimatedDurationMs={25000} />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Generated */}
                        <AnimatePresence>
                          {thumbnailBatch.map((t) => (
                            <ThumbResultCard
                              key={t.id}
                              imageUrl={t.image_url}
                              alt={t.title}
                              // rating_score is persisted on the row by the
                              // auto-rate step in run_thumbnail_job and by the
                              // /rate endpoint. Falls back to legacy ``score``
                              // for any in-memory cards that haven't synced yet.
                              score={t.rating_score != null ? Math.round(t.rating_score) : t.score}
                              selected={selectedPreviewThumbnailUrl === t.image_url}
                              onSelect={() => setSelectedPreviewThumbnailUrl(t.image_url)}
                              onPreview={() => setFullSizeImage(t.image_url)}
                              onEdit={() => setEditingUrl(t.image_url)}
                              downloadName={`thumbnail-${t.id}.png`}
                              onDelete={() => handleRemoveGenerated(t.id)}
                            />
                          ))}
                        </AnimatePresence>

                        {/* Uploaded */}
                        <AnimatePresence>
                          {uploadedThumbnails.map((u) => (
                            <ThumbResultCard
                              key={u.id}
                              imageUrl={u.image_url}
                              alt={u.title}
                              badge="Uploaded"
                              selected={selectedPreviewThumbnailUrl === u.image_url}
                              onSelect={() => setSelectedPreviewThumbnailUrl(u.image_url)}
                              onPreview={() => setFullSizeImage(u.image_url)}
                              onEdit={() => setEditingUrl(u.image_url)}
                              downloadName={`thumbnail-${u.id}.png`}
                              onDelete={() => handleRemoveUploaded(u.id)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* === SEO TAB === */}
                  {activeTab === 'seo' && (
                    <div className="video-opt-details-panel">
                      <AnimatePresence>
                        {seoNotice && (
                          <motion.div
                            className={`video-opt-seo-notice video-opt-seo-notice--${seoNotice.tone}`}
                            role="status"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                          >
                            {seoNotice.text}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Description section */}
                      <div className="video-opt-details-section">
                        <div className="video-opt-details-section-head">
                          <label className="video-opt-details-label">Description</label>
                          <span className="video-opt-details-meta">
                            <span className="video-opt-details-count">
                              {descriptionInput.length}/{DESC_MAX}
                            </span>
                            <button
                              type="button"
                              className="video-opt-details-copy-btn"
                              onClick={handleCopyDescription}
                              disabled={!descriptionInput?.trim()}
                            >
                              Copy
                            </button>
                          </span>
                        </div>
                        <textarea
                          className="video-opt-details-description"
                          value={descriptionInput}
                          onChange={(e) => setDescriptionInput(e.target.value.slice(0, DESC_MAX))}
                          placeholder="Write a compelling description for your video...&#10;&#10;The first 2 lines are critical — YouTube shows them in search results."
                          maxLength={DESC_MAX}
                          rows={8}
                          aria-label="Video description"
                        />

                        {/* AI refine tools — inline pills */}
                        <div className="video-opt-details-refine-row">
                          {refineLoading ? (
                            <button
                              type="button"
                              className="video-opt-details-refine-pill video-opt-details-refine-pill--stop"
                              onClick={handleStopRefine}
                            >
                              <span className="video-opt-btn-spinner" aria-hidden />
                              Stop
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="video-opt-details-refine-pill"
                                onClick={handleRegenerateDescription}
                                disabled={!descriptionInput?.trim()}
                              >
                                Regenerate
                                <CreditBadge featureKey="description_rewrite" />
                              </button>
                              <div
                                className="video-opt-details-refine-dropdown-wrap"
                                ref={refineDropdownRef}
                              >
                                <button
                                  type="button"
                                  className="video-opt-details-refine-pill"
                                  onClick={() => setRefineDropdownOpen((v) => !v)}
                                  aria-expanded={refineDropdownOpen}
                                  aria-haspopup="true"
                                >
                                  Refine
                                  <CreditBadge featureKey="description_rewrite" />
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </button>
                                <AnimatePresence>
                                  {refineDropdownOpen && (
                                    <motion.div
                                      className="video-opt-details-refine-dropdown"
                                      role="menu"
                                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                                      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                      {REFINE_OPTIONS.map((opt) => (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          role="menuitem"
                                          className="video-opt-details-refine-dropdown-item"
                                          onClick={() => handleRefineDescription(opt.instruction)}
                                        >
                                          <span className="video-opt-details-refine-dropdown-icon">
                                            {opt.icon}
                                          </span>
                                          {opt.label}
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Tags section */}
                      <div className="video-opt-details-section">
                        <div className="video-opt-details-section-head">
                          <label className="video-opt-details-label">Tags</label>
                          <span className="video-opt-details-meta">
                            <span className="video-opt-details-count">
                              {tagsList.length ? tagsList.map((t) => t.tag).join(',').length : 0}/
                              {TAGS_MAX_CHARS}
                            </span>
                            {tagsLoading ? (
                              <button
                                type="button"
                                className="video-opt-details-generate-tags-btn video-opt-details-generate-tags-btn--stop"
                                onClick={handleGenerateTags}
                              >
                                <span className="video-opt-btn-spinner" aria-hidden />
                                Stop
                              </button>
                            ) : !tagsGenerated || tagsList.length === 0 ? (
                              <button
                                type="button"
                                className="video-opt-details-generate-tags-btn"
                                onClick={handleGenerateTags}
                                disabled={!video?.id}
                              >
                                Generate
                                <CreditBadge featureKey="tag_generate" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="video-opt-details-generate-tags-btn"
                                onClick={handleGenerateTags}
                                disabled={!video?.id}
                              >
                                Regenerate
                                <CreditBadge featureKey="tag_generate" />
                              </button>
                            )}
                          </span>
                        </div>
                        <div className="video-opt-details-tags-container">
                          {!tagsGenerated && !tagsLoading && (
                            <div className="video-opt-details-tags-placeholders">
                              {['keyword', 'topic', 'niche'].map((t) => (
                                <span
                                  key={t}
                                  className="video-opt-details-tag-chip video-opt-details-tag-chip--blur"
                                >
                                  <span className="video-opt-details-tag-chip-name">{t}</span>
                                </span>
                              ))}
                              <span className="video-opt-details-tags-hint">
                                Generate tags to see YouTube-optimized suggestions
                              </span>
                            </div>
                          )}
                          {tagsLoading && (
                            <div className="video-opt-details-tags-placeholders">
                              <span className="video-opt-btn-spinner" aria-hidden />
                              <span className="video-opt-details-tags-loading">
                                Analyzing video for optimal tags…
                              </span>
                            </div>
                          )}
                          {tagsGenerated && tagsList.length > 0 && (
                            <div className="video-opt-details-tags-chips">
                              {tagsList.map((item, index) => (
                                <motion.span
                                  key={`${item.tag}-${index}`}
                                  className={`video-opt-details-tag-chip video-opt-details-tag-chip--${item.score != null ? getScoreTier(item.score).id : 'custom'}`}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: index * 0.03, duration: 0.2 }}
                                  layout
                                >
                                  {item.score != null && (
                                    <span className="video-opt-details-tag-chip-score">
                                      {item.score}
                                    </span>
                                  )}
                                  <span className="video-opt-details-tag-chip-name">
                                    {item.tag}
                                  </span>
                                  <button
                                    type="button"
                                    className="video-opt-details-tag-chip-remove"
                                    onClick={() => removeTag(index)}
                                    aria-label={`Remove ${item.tag}`}
                                  >
                                    ×
                                  </button>
                                </motion.span>
                              ))}
                            </div>
                          )}
                          {tagsGenerated && (
                            <input
                              type="text"
                              className="video-opt-details-tag-input"
                              value={tagInputValue}
                              onChange={(e) => setTagInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault()
                                  addTag(tagInputValue)
                                } else if (
                                  e.key === 'Backspace' &&
                                  !tagInputValue &&
                                  tagsList.length > 0
                                ) {
                                  removeTag(tagsList.length - 1)
                                }
                              }}
                              placeholder="Add a custom tag…"
                              aria-label="Add tag"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Float bars pinned to bottom of tools panel */}
          {activeTab === 'thumbnail' && (
            <div className="video-opt-thumb-float-bar">
              <div className="video-opt-float-glass">
                <textarea
                  className="video-opt-float-input"
                  value={thumbnailPrompt}
                  onChange={(e) => setThumbnailPrompt(e.target.value.slice(0, THUMB_PROMPT_MAX))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleGenerateThumbnails()
                    }
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px'
                  }}
                  placeholder="Describe your thumbnail idea... e.g. dramatic lighting, close-up face with surprised expression, bold text overlay"
                  aria-label="Thumbnail prompt"
                  maxLength={THUMB_PROMPT_MAX}
                  rows={1}
                />
                <div className="video-opt-float-actions">
                  <div className="video-opt-float-actions-left">
                    <button
                      type="button"
                      className="video-opt-float-circle-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title="Add reference image"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </button>
                    <PersonaSelector variant="glassCircle" />
                    <StyleSelector variant="glassCircle" />
                  </div>
                  <div className="video-opt-float-actions-right">
                    <BatchCirclePicker
                      value={thumbBatchCount}
                      onChange={setThumbBatchCount}
                      disabled={derivedThumbnailLoading}
                    />
                    <VOSendPill
                      featureKey="video_thumbnail_generate"
                      count={thumbBatchCount}
                      loading={derivedThumbnailLoading}
                      disabled={derivedThumbnailLoading || !videoId}
                      onClick={handleGenerateThumbnails}
                      ariaLabel="Generate thumbnails"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'seo' && (
            <div className="video-opt-details-command-float">
              <div className="video-opt-float-glass">
                <textarea
                  className="video-opt-float-input"
                  value={detailsCommand}
                  onChange={(e) => setDetailsCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleDetailsCommandSubmit()
                    }
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px'
                  }}
                  placeholder="Ask AI to edit your description…"
                  aria-label="AI command for description"
                  rows={1}
                />
                <div className="video-opt-float-actions">
                  <div className="video-opt-float-actions-left" aria-hidden />
                  <div className="video-opt-float-actions-right">
                    <VOSendPill
                      featureKey="description_rewrite"
                      loading={refineLoading}
                      disabled={!detailsCommand.trim() && !refineLoading}
                      onClick={handleDetailsCommandSubmit}
                      ariaLabel="Refine description"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
