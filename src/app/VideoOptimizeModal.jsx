import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { youtubeApi } from '../api/youtube'
import { Loading } from '../components/Loading'
import { useYoutubeVideoOptimization } from '../queries/youtube/optimizationQueries'
import { queryKeys } from '../lib/query/queryKeys'
import './VideoOptimizeModal.css'

const TABS = [
  { id: 'title', label: 'Title options' },
  { id: 'thumbnail', label: 'Thumbnail ideas' },
  { id: 'details', label: 'Details & metadata' },
  { id: 'preview', label: 'Preview' },
]

const COMING_SOON = {
  thumbnail: 'Thumbnail ideas coming soon',
  details: 'Details & metadata coming soon',
  preview: 'Preview coming soon',
}

const SCORE_TIERS = [
  { id: 'great', min: 80, max: 100, label: 'Great', inlineClass: 'video-opt-score-inline--great', description: 'Strong, click-worthy title.' },
  { id: 'good', min: 60, max: 79, label: 'Good', inlineClass: 'video-opt-score-inline--good', description: 'Solid title with room to improve.' },
  { id: 'fair', min: 40, max: 59, label: 'Fair', inlineClass: 'video-opt-score-inline--fair', description: 'Title could be stronger.' },
  { id: 'poor', min: 0, max: 39, label: 'Poor', inlineClass: 'video-opt-score-inline--poor', description: 'Consider shortening or adding a hook.' },
]

function getScoreTier(score) {
  const n = Math.max(0, Math.min(100, Math.round(score)))
  return SCORE_TIERS.find((t) => n >= t.min && n <= t.max) || SCORE_TIERS[3]
}

export function VideoOptimizeModal({ open, onClose, video, getValidAccessToken, channelId }) {
  const [activeTab, setActiveTab] = useState('title')
  const queryClient = useQueryClient()
  const optimizationQuery = useYoutubeVideoOptimization({ videoId: video?.id, enabled: open })
  const data = optimizationQuery.data
  const loading = optimizationQuery.isPending
  const error = optimizationQuery.isError ? (optimizationQuery.error?.message || 'Failed to load optimization') : null
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
  const refineDropdownRef = useRef(null)
  const DESC_MAX = 5000
  const TAGS_MAX_CHARS = 500

  const REFINE_OPTIONS = [
    { id: 'shorter', label: 'Make shorter' },
    { id: 'longer', label: 'Make longer' },
    { id: 'hooks', label: 'Add hooks' },
    { id: 'professional', label: 'More professional' },
    { id: 'simplify', label: 'Simplify' },
    { id: 'cta', label: 'Add call to action' },
  ]

  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (!refineDropdownOpen) return
    const handleClickOutside = (e) => {
      if (refineDropdownRef.current && !refineDropdownRef.current.contains(e.target)) setRefineDropdownOpen(false)
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

  const handleRefineDescription = (instruction) => {
    setRefineDropdownOpen(false)
    if (!video?.id) return
    setRefineLoading(true)
    refineDescriptionMutation
      .mutateAsync({ videoId: video.id, description: descriptionInput, instruction })
      .then((res) => {
        if (res?.description != null) setDescriptionInput(res.description)
      })
      .catch(() => {})
      .finally(() => setRefineLoading(false))
  }

  const handleRegenerateDescription = () => {
    handleRefineDescription('Rewrite this description to be more engaging, clear, and SEO-friendly while keeping the same key points.')
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
  const currentDataTags = (data?.tags || video?.tags || [])
  const hasTagChanges = tagsArray.join(',') !== (Array.isArray(currentDataTags) ? currentDataTags.join(',') : '')
  const hasChanges = hasTitleChanges || hasDescChanges || hasTagChanges

  const updateVideoMetadataMutation = useMutation({
    mutationFn: async ({ videoId, payload }) => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.updateVideoMetadata(token, videoId, payload)
    },
    onMutate: async ({ videoId, payload }) => {
      // Optimistically patch cached list rows so the UI feels instant.
      const previousEntries = queryClient.getQueriesData({ queryKey: ['youtube', 'videos', channelId], exact: false })
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
    <div className="video-opt-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="video-opt-title">
      <div className="video-opt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="video-opt-header">
          <div className="video-opt-header-video">
            {video?.thumbnail_url && (
              <img src={video.thumbnail_url} alt="" className="video-opt-thumb" />
            )}
            <div className="video-opt-header-text">
              <h2 id="video-opt-title" className="video-opt-title">{video?.title || 'Video optimization'}</h2>
              <p className="video-opt-subtitle">AI suggestions — copy and apply in YouTube Studio</p>
              <div className="video-opt-header-watch-row">
                {video?.id && (
                  <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="video-opt-watch-link">Watch on YouTube ↗</a>
                )}
              </div>
            </div>
          </div>
          <div className="video-opt-header-actions">
            <button type="button" className="video-opt-close" onClick={onClose} aria-label="Close">&times;</button>
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
          <nav className="video-opt-tabs" aria-label="Optimization sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`video-opt-tab ${activeTab === tab.id ? 'video-opt-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-selected={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="video-opt-body">
          {loading && (
            <div className="video-opt-loading">
              <Loading message="Generating suggestions…" size="lg" />
            </div>
          )}
          {error && (
            <div className="video-opt-error">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className={`video-opt-panel ${activeTab === 'title' ? 'video-opt-panel--top' : ''}`}>
              {activeTab === 'title' && (
                <div className="video-opt-title-section">
                  <div className="video-opt-title-row">
                    <div className="video-opt-title-input-wrap">
                      <input
                        type="text"
                        className="video-opt-title-input"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        placeholder="Enter or edit video title…"
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
                          'Score'
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
                        <span className="video-opt-score-badge-label">{scoreTier || getScoreTier(titleScore).label}</span>
                        <span className="video-opt-score-badge-chevron" aria-hidden>{scoreDescVisible ? '▲' : '▼'}</span>
                      </button>
                    )}
                  </div>
                  {titleScore != null && scoreDescVisible && (
                    <p className="video-opt-score-desc" role="region" aria-live="polite">
                      {scoreExplanation || getScoreTier(titleScore).description}
                    </p>
                  )}

                  <div className="video-opt-recommendations">
                    <div className="video-opt-recommendations-head">
                      <h3 className="video-opt-recommendations-title">Title recommendations</h3>
                      {video?.title && (
                        <button
                          type="button"
                          className="video-opt-generate-btn"
                          onClick={fetchTitleRecommendations}
                          disabled={!video?.title?.trim() || titleRecsLoading}
                        >
                          {titleRecsLoading ? (
                            <span className="video-opt-generate-btn-spinner" aria-hidden />
                          ) : null}
                          {titleRecsLoading ? 'Generating…' : titleRecommendations?.titles?.length ? 'Regenerate' : 'Generate titles'}
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
                                <img src={titleRecommendations?.thumbnail_url || video?.thumbnail_url || ''} alt="" />
                                {!isPlaceholder && item?.score != null && (
                                  <span className={`video-opt-reco-score-pill video-opt-reco-score-pill--${getScoreTier(item.score).id}`}>
                                    <span className="video-opt-reco-score-pill-num">{item.score}</span>
                                    <span className="video-opt-reco-score-pill-label">{getScoreTier(item.score).label}</span>
                                  </span>
                                )}
                              </div>
                              <div className={`video-opt-reco-title-wrap ${isLoading ? 'video-opt-reco-title-wrap--shimmer' : ''} ${isPlaceholder ? 'video-opt-reco-title-wrap--blur' : ''}`}>
                                <p className="video-opt-reco-title">{item?.title ?? 'Title will appear here'}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {!video?.title && (
                      <p className="video-opt-reco-empty">Open a video to see title recommendations.</p>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'thumbnail' && (
                <div className="video-opt-coming-soon">
                  <span className="video-opt-coming-soon-icon">◇</span>
                  <p className="video-opt-coming-soon-text">{COMING_SOON.thumbnail}</p>
                </div>
              )}
              {activeTab === 'details' && (
                <div className="video-opt-details-panel">
                  <div className="video-opt-details-actions-row">
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
                              onClick={() => handleRefineDescription(opt.label.toLowerCase())}
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
                      <span className="video-opt-details-count">{descriptionInput.length} of {DESC_MAX}</span>
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
                      <span className="video-opt-details-count">{tagsList.length ? tagsList.map((t) => t.tag).join(',').length : 0} of {TAGS_MAX_CHARS}</span>
                    </div>
                    <div className="video-opt-details-tags-container">
                      {!tagsGenerated && !tagsLoading && (
                        <div className="video-opt-details-tags-placeholders">
                          {[1, 2, 3].map((i) => (
                            <span key={i} className="video-opt-details-tag-chip video-opt-details-tag-chip--blur">
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
                              {item.score != null && <span className="video-opt-details-tag-chip-score">{item.score}</span>}
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
                            } else if (e.key === 'Backspace' && !tagInputValue && tagsList.length > 0) {
                              removeTag(tagsList.length - 1)
                            }
                          }}
                          placeholder="Add tag (Enter or comma)"
                          aria-label="Add tag"
                        />
                      )}
                    </div>
                    {!tagsGenerated && !tagsLoading && (
                      <button
                        type="button"
                        className="video-opt-details-generate-tags-btn"
                        onClick={handleGenerateTags}
                        disabled={!video?.id}
                      >
                        Generate tags
                      </button>
                    )}
                  </div>

                  <div className="video-opt-details-command-float">
                    <textarea
                      className="video-opt-details-command-input video-opt-details-command-input-expand"
                      value={detailsCommand}
                      onChange={(e) => setDetailsCommand(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDetailsCommandSubmit() } }}
                      placeholder="e.g. Make it shorter, add a call to action, more professional..."
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
                <div className="video-opt-coming-soon">
                  <span className="video-opt-coming-soon-icon">◇</span>
                  <p className="video-opt-coming-soon-text">{COMING_SOON.preview}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
