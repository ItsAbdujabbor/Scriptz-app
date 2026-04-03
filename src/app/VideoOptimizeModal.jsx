import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { youtubeApi } from '../api/youtube'
import { Loading } from '../components/Loading'
import { TabBar } from '../components/TabBar'
import { useYoutubeVideoOptimization } from '../queries/youtube/optimizationQueries'
import { useThumbnailChatMutation } from '../queries/thumbnails/thumbnailQueries'
import { queryKeys } from '../lib/query/queryKeys'
import './VideoOptimizeModal.css'

const TABS = [
  { id: 'title', label: 'Title options' },
  { id: 'thumbnail', label: 'Thumbnail ideas' },
  { id: 'seo', label: 'SEO' },
  { id: 'preview', label: 'Preview' },
]

const COMING_SOON = {
  preview: 'Preview coming soon',
}

const THUMBNAIL_QUICK_PROMPTS = [
  { id: 'dramatic', label: 'More dramatic' },
  { id: 'text', label: 'Add text overlay' },
  { id: 'face', label: 'Close-up face' },
  { id: 'clean', label: 'Clean & minimal' },
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
  const optimizationQuery = useYoutubeVideoOptimization({ videoId: video?.id, enabled: open })
  const data = optimizationQuery.data
  const loading = optimizationQuery.isPending
  const error = optimizationQuery.isError
    ? optimizationQuery.error?.message || 'Failed to load optimization'
    : null
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
  const refineDropdownRef = useRef(null)
  const [thumbnailPrompt, setThumbnailPrompt] = useState('')
  const [thumbnailBatch, setThumbnailBatch] = useState([])
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [uploadedThumbnails, setUploadedThumbnails] = useState([])
  const [selectedPreviewThumbnailUrl, setSelectedPreviewThumbnailUrl] = useState(null)
  const [previewTheme, setPreviewTheme] = useState('dark')
  const fileInputRef = useRef(null)
  const DESC_MAX = 5000
  const TAGS_MAX_CHARS = 500

  const REFINE_OPTIONS = [
    {
      id: 'shorter',
      label: 'Make shorter',
      instruction:
        'Make this description shorter and more concise while keeping the key information.',
    },
    {
      id: 'longer',
      label: 'Make longer',
      instruction: 'Expand this description with more detail, examples, or context.',
    },
    {
      id: 'hooks',
      label: 'Add hooks',
      instruction: 'Add compelling hooks and attention-grabbing phrases at the start.',
    },
    {
      id: 'professional',
      label: 'More professional',
      instruction: 'Rewrite in a more professional, polished tone.',
    },
    {
      id: 'simplify',
      label: 'Simplify',
      instruction: 'Simplify the language - use shorter sentences and fewer jargon.',
    },
    {
      id: 'cta',
      label: 'Add call to action',
      instruction: 'Add a clear call to action (subscribe, like, comment, or visit link).',
    },
    {
      id: 'keywords',
      label: 'Add SEO keywords',
      instruction: 'Naturally weave in relevant SEO keywords and phrases for YouTube search.',
    },
    {
      id: 'firstlines',
      label: 'Optimize first lines',
      instruction:
        'Rewrite the first 1-2 lines to be more clickable and search-visible. YouTube shows ~100 characters in search.',
    },
    {
      id: 'timestamps',
      label: 'Add timestamps section',
      instruction:
        'Add a timestamps section at the end with placeholder format: 0:00 Intro, etc. Keep existing content.',
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
      setTitleScore(null)
      setScoreTier(null)
      setScoreExplanation(null)
      setSaveSuccess(false)
      setTitleRecommendations(null)
    }
  }, [open, video?.title])

  useEffect(() => {
    if (open && video?.id) {
      setThumbnailPrompt('')
      setThumbnailBatch([])
      setUploadedThumbnails([])
      setSelectedPreviewThumbnailUrl(null)
    }
  }, [open, video?.id])

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

  const previewChannelName =
    channelTitle || data?.channel_title || video?.channel_title || 'Your channel'

  useEffect(() => {
    if (open && data) {
      if (data.description != null) setDescriptionInput(data.description || '')
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        setTagsList(data.tags.map((t) => ({ tag: String(t).trim(), score: null })))
        setTagsGenerated(true)
      } else {
        setTagsList([])
        setTagsGenerated(false)
      }
    }
    if (open && !data) {
      if (video?.description != null) setDescriptionInput(video.description || '')
      setTagsList([])
      setTagsGenerated(false)
    }
  }, [open, data?.description, data?.tags, video?.description])

  useEffect(() => {
    if (!open) return
    // If the backend generated title options but the input video has no title,
    // prefer the default AI title for the editing input.
    if (data?.title_options?.length && !video?.title) {
      const idx = data.default_title_index ?? 0
      setTitleInput(data.title_options[idx] || '')
    }
  }, [open, data?.title_options, data?.default_title_index, video?.title])

  const titleRecommendationsMutation = useMutation({
    mutationFn: async ({ videoIdea, thumbnailUrl }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.getTitleRecommendations(token, {
        video_idea: videoIdea,
        thumbnail_url: thumbnailUrl,
      })
    },
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
  })

  const scoreTitleMutation = useMutation({
    mutationFn: async ({ title }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.scoreTitle(token, title)
    },
  })

  const fetchTitleRecommendations = () => {
    if (!video?.title?.trim()) return
    setTitleRecsLoading(true)
    titleRecommendationsMutation
      .mutateAsync({
        videoIdea: titleInput.trim() || video.title,
        thumbnailUrl: video.thumbnail_url || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      })
      .then((res) => setTitleRecommendations(res))
      .catch(() => setTitleRecommendations(null))
      .finally(() => setTitleRecsLoading(false))
  }

  const showSeoNotice = (text, tone = 'success') => {
    setSeoNotice({ text, tone })
    setTimeout(() => setSeoNotice(null), 2800)
  }

  const handleRefineDescription = (instruction) => {
    setRefineDropdownOpen(false)
    if (!video?.id) return
    setRefineLoading(true)
    refineDescriptionMutation
      .mutateAsync({ videoId: video.id, description: descriptionInput, instruction })
      .then((res) => {
        if (res?.description != null) {
          setDescriptionInput(res.description)
          showSeoNotice('Description updated.')
        }
      })
      .catch(() => showSeoNotice('Could not refine. Try again.', 'error'))
      .finally(() => setRefineLoading(false))
  }

  const handleRegenerateDescription = () => {
    handleRefineDescription(
      'Rewrite this description to be more engaging, clear, and SEO-friendly while keeping the same key points.'
    )
  }

  const handleRecreateDescription = () => {
    if (!video?.id || !titleInput?.trim()) return
    const instruction = `Write a completely new, SEO-optimized YouTube description for this video. Use the title "${titleInput.trim()}" as context. Include: a strong hook in the first 1-2 lines (these show in search results), key takeaways or value, relevant keywords, and a clear call to action. Make it engaging and search-friendly.`
    const baseDescription = descriptionInput?.trim() || `Video about: ${titleInput.trim()}`
    setRefineLoading(true)
    refineDescriptionMutation
      .mutateAsync({ videoId: video.id, description: baseDescription, instruction })
      .then((res) => {
        if (res?.description != null) {
          setDescriptionInput(res.description)
          showSeoNotice('Description recreated.')
        }
      })
      .catch(() => showSeoNotice('Could not recreate. Try again.', 'error'))
      .finally(() => setRefineLoading(false))
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
    if (!video?.id) return
    setTagsLoading(true)
    generateTagsMutation
      .mutateAsync({
        videoId: video.id,
        description: descriptionInput || undefined,
        title: video?.title || undefined,
      })
      .then((res) => {
        if (res?.tags?.length) {
          setTagsList(res.tags.map((t) => ({ tag: t.tag, score: t.score })))
          setTagsGenerated(true)
        }
      })
      .catch(() => {})
      .finally(() => setTagsLoading(false))
  }

  const thumbnailChatMutation = useThumbnailChatMutation()

  const getYoutubeUrl = () => (video?.id ? `https://www.youtube.com/watch?v=${video.id}` : '')

  const handleGenerateThumbnails = async () => {
    const url = getYoutubeUrl()
    const prompt = (thumbnailPrompt || video?.title || '').trim()
    if ((!url && !prompt) || thumbnailLoading) return
    const message = url ? (prompt ? `${url} ${prompt}` : url) : prompt
    setThumbnailLoading(true)
    try {
      const res = await thumbnailChatMutation.mutateAsync({
        message,
        num_thumbnails: 4,
        channel_id: channelId || undefined,
      })
      const thumbs = res?.thumbnails || []
      const mapped = thumbs.map((t, i) => ({ ...t, title: t.title || `${i + 1}x` }))
      setThumbnailBatch(mapped)
    } catch (_) {
      setThumbnailBatch([])
    } finally {
      setThumbnailLoading(false)
    }
  }

  const handleThumbnailQuickPrompt = (label) => {
    const url = getYoutubeUrl()
    if (!url) return
    setThumbnailPrompt((p) => (p ? `${p} ${label}` : label))
  }

  const handleUploadThumbnail = (e) => {
    const files = e?.target?.files
    if (!files?.length) return
    const file = files[0]
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setUploadedThumbnails((prev) => [
        ...prev,
        { image_url: dataUrl, title: 'Uploaded', id: `upload-${Date.now()}` },
      ])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveUploaded = (id) => {
    setUploadedThumbnails((prev) => prev.filter((u) => u.id !== id))
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
    if (!titleInput.trim()) return
    setScoreLoading(true)
    scoreTitleMutation
      .mutateAsync({ title: titleInput.trim() })
      .then((res) => {
        setTitleScore(res?.score ?? null)
        setScoreTier(res?.tier ?? getScoreTier(res?.score).id)
        setScoreExplanation(res?.explanation ?? null)
      })
      .catch(() => {
        setTitleScore(null)
        setScoreTier(null)
        setScoreExplanation(null)
      })
      .finally(() => setScoreLoading(false))
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
      return youtubeApi.updateVideoMetadata(token, videoId, payload)
    },
    onMutate: async ({ videoId, payload }) => {
      // Optimistically patch cached list rows so the UI feels instant.
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
    <div
      className="video-opt-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-opt-title"
    >
      <div className="video-opt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="video-opt-header">
          <div className="video-opt-header-video">
            {video?.thumbnail_url && (
              <img src={video.thumbnail_url} alt="" className="video-opt-thumb" />
            )}
            <div className="video-opt-header-text">
              <h2 id="video-opt-title" className="video-opt-title">
                {video?.title || 'Video optimization'}
              </h2>
              <p className="video-opt-subtitle">
                AI suggestions — copy and apply in YouTube Studio
              </p>
              <div className="video-opt-header-watch-row">
                {video?.id && (
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="video-opt-watch-link"
                  >
                    Watch on YouTube ↗
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="video-opt-header-actions">
            <button type="button" className="video-opt-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
            <button
              type="button"
              className="video-opt-save-btn"
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? 'Saving…' : saveSuccess ? 'Saved' : 'Save changes'}
            </button>
          </div>
        </div>

        <div className="video-opt-tabrow">
          <TabBar
            tabs={TABS}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Optimization sections"
            variant="modal"
            className="video-opt-tabs"
          />
        </div>

        <div className="video-opt-body">
          {loading && (
            <div className="video-opt-loading">
              <Loading message="Generating suggestions…" size="lg" />
            </div>
          )}
          {error && <div className="video-opt-error">{error}</div>}
          {!loading && !error && (
            <div
              className={`video-opt-panel ${activeTab === 'title' ? 'video-opt-panel--top' : ''}`}
            >
              {activeTab === 'title' && (
                <div className="video-opt-title-studio">
                  <header className="video-opt-title-studio-hero">
                    <div className="video-opt-title-studio-hero-inner">
                      <span className="video-opt-title-studio-kicker">Title lab</span>
                      <h3 className="video-opt-title-studio-heading">
                        Dial in a headline that earns the click
                      </h3>
                      <p className="video-opt-title-studio-lead">
                        Tune your title, run an AI score, then try alternate hooks below — what you
                        pick stays in sync with Preview and Save changes.
                      </p>
                    </div>
                    <div className="video-opt-title-studio-hero-glow" aria-hidden />
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
                          placeholder="Type a title or start from the video’s current one…"
                          aria-label="Video title"
                          maxLength={100}
                        />
                        <button
                          type="button"
                          className="video-opt-score-btn"
                          onClick={handleScore}
                          disabled={!titleInput.trim() || scoreLoading}
                        >
                          {scoreLoading ? (
                            <>
                              <span className="video-opt-score-btn-spinner" aria-hidden />
                              <span>Scoring…</span>
                            </>
                          ) : (
                            <>
                              <span className="video-opt-score-btn-icon" aria-hidden>
                                ✦
                              </span>
                              Score title
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
                        <h3 id="video-opt-reco-suite-title" className="video-opt-reco-suite-title">
                          Alternate hooks
                        </h3>
                        <p className="video-opt-reco-suite-sub">
                          Three AI angles from your thumbnail + topic. Tap one to load it into the
                          editor.
                        </p>
                      </div>
                      {video?.title && (
                        <button
                          type="button"
                          className="video-opt-generate-btn video-opt-generate-btn--ghost"
                          onClick={fetchTitleRecommendations}
                          disabled={!video?.title?.trim() || titleRecsLoading}
                        >
                          {titleRecsLoading ? (
                            <span className="video-opt-generate-btn-spinner" aria-hidden />
                          ) : (
                            <span className="video-opt-generate-btn-icon" aria-hidden>
                              ↻
                            </span>
                          )}
                          {titleRecsLoading
                            ? 'Cooking ideas…'
                            : titleRecommendations?.titles?.length
                              ? 'Fresh ideas'
                              : 'Generate ideas'}
                        </button>
                      )}
                    </div>
                    {video?.title && (
                      <div className="video-opt-recommendations-grid">
                        {[0, 1, 2].map((i) => {
                          const item = titleRecommendations?.titles?.[i]
                          const isLoading = titleRecsLoading
                          const isPlaceholder = !item
                          const labels = ['A', 'B', 'C']
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
                              <span className="video-opt-reco-option-badge" aria-hidden>
                                {labels[i]}
                              </span>
                              <div className="video-opt-reco-thumb">
                                <img
                                  src={
                                    titleRecommendations?.thumbnail_url ||
                                    video?.thumbnail_url ||
                                    ''
                                  }
                                  alt=""
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
                                className={`video-opt-reco-title-wrap ${isLoading ? 'video-opt-reco-title-wrap--shimmer' : ''} ${isPlaceholder ? 'video-opt-reco-title-wrap--blur' : ''}`}
                              >
                                <p className="video-opt-reco-title">
                                  {item?.title ?? 'Your alternate title lands here'}
                                </p>
                                {!isPlaceholder && !isLoading && (
                                  <span className="video-opt-reco-use-hint">Use this title</span>
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
              {activeTab === 'thumbnail' && (
                <div className="video-opt-thumb-panel">
                  <div className="video-opt-thumb-current-wrap">
                    <div className="video-opt-thumb-current-label">Current</div>
                    <div className="video-opt-thumb-current">
                      {video?.thumbnail_url ? (
                        <>
                          <img
                            src={video.thumbnail_url}
                            alt="Current thumbnail"
                            className="video-opt-thumb-current-img"
                          />
                          <button
                            type="button"
                            className="video-opt-thumb-use-preview"
                            onClick={() => setSelectedPreviewThumbnailUrl(null)}
                            title="Use in preview"
                          >
                            Use in preview
                          </button>
                        </>
                      ) : (
                        <div className="video-opt-thumb-current-placeholder">No thumbnail</div>
                      )}
                    </div>
                  </div>
                  <div className="video-opt-thumb-grid-wrap">
                    <div className="video-opt-thumb-grid-label">
                      Generated & uploaded
                      <span className="video-opt-thumb-grid-hint">
                        Tap an image to view full size
                      </span>
                    </div>
                    <div className="video-opt-thumb-grid">
                      {thumbnailLoading && (
                        <div className="video-opt-thumb-loading-card">
                          <span className="video-opt-thumb-loading-spinner" aria-hidden />
                          <span>Generating…</span>
                        </div>
                      )}
                      {!thumbnailLoading &&
                        thumbnailBatch.map((t, i) => (
                          <div key={`gen-${i}`} className="video-opt-thumb-card">
                            <div className="video-opt-thumb-card-img-wrap">
                              <img
                                src={t.image_url}
                                alt={t.title}
                                className="video-opt-thumb-card-img"
                              />
                            </div>
                            <div className="video-opt-thumb-card-actions">
                              <button
                                type="button"
                                className="video-opt-thumb-card-btn video-opt-thumb-card-btn--preview"
                                title="Use in preview"
                                onClick={() => setSelectedPreviewThumbnailUrl(t.image_url)}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <a
                                href={t.image_url}
                                download={`thumbnail-${i + 1}.png`}
                                className="video-opt-thumb-card-btn"
                                title="Download"
                                aria-label="Download"
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                              </a>
                            </div>
                          </div>
                        ))}
                      {uploadedThumbnails.map((u) => (
                        <div
                          key={u.id}
                          className="video-opt-thumb-card video-opt-thumb-card--uploaded"
                        >
                          <div className="video-opt-thumb-card-img-wrap">
                            <img
                              src={u.image_url}
                              alt={u.title}
                              className="video-opt-thumb-card-img"
                            />
                          </div>
                          <div className="video-opt-thumb-card-actions">
                            <button
                              type="button"
                              className="video-opt-thumb-card-btn video-opt-thumb-card-btn--preview"
                              title="Use in preview"
                              onClick={() => setSelectedPreviewThumbnailUrl(u.image_url)}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            <a
                              href={u.image_url}
                              download="thumbnail-uploaded.png"
                              className="video-opt-thumb-card-btn"
                              title="Download"
                              aria-label="Download"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                            </a>
                            <button
                              type="button"
                              className="video-opt-thumb-card-btn video-opt-thumb-card-btn--remove"
                              title="Remove"
                              aria-label="Remove"
                              onClick={() => handleRemoveUploaded(u.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="video-opt-thumb-float-bar">
                    <div className="video-opt-thumb-float-inner">
                      <div className="video-opt-thumb-quick-pills">
                        {THUMBNAIL_QUICK_PROMPTS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="video-opt-thumb-pill"
                            onClick={() => handleThumbnailQuickPrompt(p.label)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="video-opt-thumb-input-row">
                        <input
                          type="text"
                          className="video-opt-thumb-input"
                          value={thumbnailPrompt}
                          onChange={(e) => setThumbnailPrompt(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleGenerateThumbnails()}
                          placeholder="Describe your thumbnail… or add to quick prompts above"
                          aria-label="Thumbnail prompt"
                        />
                        <button
                          type="button"
                          className="video-opt-thumb-generate-btn"
                          onClick={handleGenerateThumbnails}
                          disabled={thumbnailLoading || !video?.id}
                        >
                          {thumbnailLoading ? (
                            <span className="video-opt-thumb-btn-spinner" aria-hidden />
                          ) : null}
                          {thumbnailLoading ? 'Generating…' : 'Generate'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="video-opt-thumb-file-input"
                          aria-label="Upload thumbnail"
                          onChange={handleUploadThumbnail}
                        />
                        <button
                          type="button"
                          className="video-opt-thumb-upload-btn"
                          onClick={() => fileInputRef.current?.click()}
                          title="Upload your own thumbnail"
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'seo' && (
                <div className="video-opt-details-panel">
                  {seoNotice && (
                    <div
                      className={`video-opt-seo-notice video-opt-seo-notice--${seoNotice.tone}`}
                      role="status"
                    >
                      {seoNotice.text}
                    </div>
                  )}
                  <p className="video-opt-seo-intro">
                    Optimize description and tags for YouTube search. Edit below, then use Recreate
                    or Refine to improve with AI.
                  </p>
                  <div className="video-opt-details-actions-row video-opt-details-actions-row--primary">
                    <button
                      type="button"
                      className="video-opt-details-recreate-btn"
                      onClick={handleRecreateDescription}
                      disabled={refineLoading || !video?.id || !titleInput?.trim()}
                    >
                      {refineLoading ? (
                        <>
                          <span className="video-opt-details-refine-spinner" aria-hidden />
                          Creating…
                        </>
                      ) : (
                        'Recreate'
                      )}
                    </button>
                    <div className="video-opt-details-refine-dropdown-wrap" ref={refineDropdownRef}>
                      <button
                        type="button"
                        className="video-opt-details-refine-main-btn"
                        onClick={() => setRefineDropdownOpen((v) => !v)}
                        disabled={refineLoading}
                        aria-expanded={refineDropdownOpen}
                        aria-haspopup="true"
                      >
                        {refineLoading ? (
                          <>
                            <span className="video-opt-details-refine-spinner" aria-hidden />
                            Refining…
                          </>
                        ) : (
                          'Refine'
                        )}
                      </button>
                      {refineDropdownOpen && (
                        <div className="video-opt-details-refine-dropdown" role="menu">
                          {REFINE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              role="menuitem"
                              className="video-opt-details-refine-dropdown-item"
                              onClick={() => handleRefineDescription(opt.instruction)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="video-opt-details-regenerate-quick-btn"
                      onClick={handleRegenerateDescription}
                      disabled={refineLoading}
                    >
                      {refineLoading ? (
                        <>
                          <span className="video-opt-details-regenerate-spinner" aria-hidden />
                          Regenerating…
                        </>
                      ) : (
                        'Regenerate'
                      )}
                    </button>
                  </div>

                  <div className="video-opt-details-section">
                    <div className="video-opt-details-section-head">
                      <label className="video-opt-details-label">Description</label>
                      <span className="video-opt-details-meta">
                        <span className="video-opt-details-count">
                          {descriptionInput.length} of {DESC_MAX}
                        </span>
                        <button
                          type="button"
                          className="video-opt-details-copy-btn"
                          onClick={handleCopyDescription}
                          disabled={!descriptionInput?.trim()}
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </span>
                    </div>
                    <textarea
                      className="video-opt-details-description"
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value.slice(0, DESC_MAX))}
                      placeholder="Why does it feel like everyone is ahead in life?&#10;&#10;Social media shows the highlights, not the real journey..."
                      maxLength={DESC_MAX}
                      rows={6}
                      aria-label="Video description"
                    />
                  </div>

                  <div className="video-opt-details-section">
                    <div className="video-opt-details-section-head">
                      <label className="video-opt-details-label">Tags</label>
                      <span className="video-opt-details-count">
                        {tagsList.length ? tagsList.map((t) => t.tag).join(',').length : 0} of{' '}
                        {TAGS_MAX_CHARS}
                      </span>
                    </div>
                    <div className="video-opt-details-tags-container">
                      {!tagsGenerated && !tagsLoading && (
                        <div className="video-opt-details-tags-placeholders">
                          {[1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className="video-opt-details-tag-chip video-opt-details-tag-chip--blur"
                            >
                              <span className="video-opt-details-tag-chip-score">—</span>
                              <span className="video-opt-details-tag-chip-name">Tag</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {tagsLoading && (
                        <div className="video-opt-details-tags-placeholders">
                          <span className="video-opt-details-tags-loading">Generating tags…</span>
                        </div>
                      )}
                      {tagsGenerated && tagsList.length > 0 && (
                        <div className="video-opt-details-tags-chips">
                          {tagsList.map((item, index) => (
                            <span
                              key={`${item.tag}-${index}`}
                              className={`video-opt-details-tag-chip video-opt-details-tag-chip--${item.score != null ? getScoreTier(item.score).id : 'custom'}`}
                            >
                              {item.score != null && (
                                <span className="video-opt-details-tag-chip-score">
                                  {item.score}
                                </span>
                              )}
                              <span className="video-opt-details-tag-chip-name">{item.tag}</span>
                              <button
                                type="button"
                                className="video-opt-details-tag-chip-remove"
                                onClick={() => removeTag(index)}
                                aria-label={`Remove ${item.tag}`}
                              >
                                ×
                              </button>
                            </span>
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
                          placeholder="Add tag (Enter or comma)"
                          aria-label="Add tag"
                        />
                      )}
                    </div>
                    {(!tagsGenerated || tagsList.length === 0) && !tagsLoading && (
                      <button
                        type="button"
                        className="video-opt-details-generate-tags-btn"
                        onClick={handleGenerateTags}
                        disabled={!video?.id}
                      >
                        Generate tags
                      </button>
                    )}
                    {tagsGenerated && tagsList.length > 0 && !tagsLoading && (
                      <button
                        type="button"
                        className="video-opt-details-regenerate-tags-btn"
                        onClick={handleGenerateTags}
                        disabled={!video?.id}
                      >
                        Regenerate tags
                      </button>
                    )}
                  </div>

                  <div className="video-opt-details-command-float">
                    <textarea
                      className="video-opt-details-command-input video-opt-details-command-input-expand"
                      value={detailsCommand}
                      onChange={(e) => setDetailsCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleDetailsCommandSubmit()
                        }
                      }}
                      placeholder="Custom instruction… e.g. Add a product link, mention my channel, add FAQ section"
                      aria-label="Command for description"
                      rows={Math.max(1, Math.min(6, detailsCommand.split('\n').length))}
                    />
                    <button
                      type="button"
                      className="video-opt-details-command-submit"
                      onClick={handleDetailsCommandSubmit}
                      disabled={!detailsCommand.trim() || refineLoading}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
              {activeTab === 'preview' && (
                <div className={`video-opt-preview-mock video-opt-preview-mock--${previewTheme}`}>
                  <header className="video-opt-preview-nav">
                    <div className="video-opt-preview-nav-left">
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title="Home"
                        aria-label="Home"
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title="Search"
                        aria-label="Search"
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path
                            fill="currentColor"
                            d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title="Device"
                        aria-label="Device"
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path
                            fill="currentColor"
                            d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title="Media"
                        aria-label="Media"
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path
                            fill="currentColor"
                            d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="video-opt-preview-nav-right">
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title={previewTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                        aria-label="Theme"
                        onClick={() => setPreviewTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                      >
                        {previewTheme === 'dark' ? (
                          <svg viewBox="0 0 24 24" width="24" height="24">
                            <path
                              fill="currentColor"
                              d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="24" height="24">
                            <path
                              fill="currentColor"
                              d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="video-opt-preview-nav-icon"
                        title="Refresh preview"
                        aria-label="Refresh"
                        onClick={() => setSelectedPreviewThumbnailUrl(null)}
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24">
                          <path
                            fill="currentColor"
                            d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                          />
                        </svg>
                      </button>
                    </div>
                  </header>
                  <div className="video-opt-preview-content">
                    <div className="video-opt-preview-grid">
                      <div className="video-opt-preview-card">
                        <div className="video-opt-preview-thumb-wrap">
                          {previewThumbnailUrl ? (
                            <img
                              src={previewThumbnailUrl}
                              alt=""
                              className="video-opt-preview-thumb"
                            />
                          ) : (
                            <div className="video-opt-preview-thumb-placeholder">
                              <span>No thumbnail</span>
                            </div>
                          )}
                          {video?.duration_minutes != null &&
                            video.duration_minutes > 0 &&
                            (() => {
                              const tot = Math.round(video.duration_minutes * 60)
                              const h = Math.floor(tot / 3600)
                              const m = Math.floor((tot % 3600) / 60)
                              const s = tot % 60
                              const pad = (n) => String(n).padStart(2, '0')
                              const t = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
                              return <div className="video-opt-preview-duration">{t}</div>
                            })()}
                        </div>
                        <div className="video-opt-preview-info">
                          <div className="video-opt-preview-avatar" aria-hidden />
                          <div className="video-opt-preview-meta">
                            <h3
                              className="video-opt-preview-title"
                              title={titleInput || video?.title}
                            >
                              {titleInput || video?.title || 'Untitled'}
                            </h3>
                            <div className="video-opt-preview-channel">{previewChannelName}</div>
                            <div className="video-opt-preview-stats">
                              {formatPreviewCount(video?.view_count)}
                              {(video?.view_count != null || video?.published_at) && (
                                <span className="video-opt-preview-dot">•</span>
                              )}
                              {formatPreviewTime(video?.published_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="video-opt-preview-hint">
                    Select a thumbnail in the Thumbnail tab. Use theme and refresh above.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
