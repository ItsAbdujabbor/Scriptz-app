import { useState, useCallback, useRef, useEffect } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { usePersonaStore } from '../stores/personaStore'
import { PersonaSelector } from '../components/PersonaSelector'
import './ThumbnailGenerator.css'

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconArrowUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19 0-14" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconEmptyThumbnail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

const THUMBNAIL_LOADING_STEPS = [
  { id: 'analyze', label: 'Analyzing your request' },
  { id: 'generate', label: 'Generating thumbnails' },
  { id: 'done', label: 'Finalizing' },
]

const CONCEPT_COUNTS = [1, 2, 3, 4]
const STYLE_PRESETS = [
  { value: '', label: 'Style' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'clickbait', label: 'Clickbait' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'professional', label: 'Professional' },
]

const YOUTUBE_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

function extractYoutubeUrl(text) {
  const m = String(text || '').match(YOUTUBE_URL_RE)
  return m ? m[0] : null
}

const THUMBNAIL_QUICK_ACTIONS = [
  { id: 'productivity', label: 'Productivity tips video', prompt: 'Productivity tips video thumbnail. Clean, professional style.' },
  { id: 'vlog', label: 'Daily vlog thumbnail', prompt: 'Daily vlog about a software developer\'s life. Warm, personal, engaging.' },
  { id: 'tutorial', label: 'Tech tutorial thumbnail', prompt: '"How to learn Python" tutorial. Educational, click-worthy.' },
]

function ThumbnailGridBlock({ thumbnails }) {
  if (!thumbnails?.length) return null
  return (
    <div className="script-gen-content thumb-gen-content">
      <div className="script-gen-block script-gen-block--thumb">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">{thumbnails.length} Thumbnail{thumbnails.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="script-gen-block-body">
          <div className="thumb-concept-grid">
            {thumbnails.map((t, i) => (
              <div key={i} className="thumb-concept-card">
                <div className="thumb-thumbnail-img-wrap">
                  <img src={t.image_url} alt={t.title} className="thumb-thumbnail-img" />
                </div>
                <h4 className="thumb-concept-title">{t.title}</h4>
                <p className="thumb-concept-emotion">{t.emotion}</p>
                <p className="thumb-concept-psychology">{t.psychology_angle}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ThumbnailImageBlock({ imageUrl }) {
  if (!imageUrl) return null
  return (
    <div className="script-gen-content thumb-gen-content">
      <div className="script-gen-block script-gen-block--thumb-img">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">Generated Thumbnail</span>
        </div>
        <div className="script-gen-block-body">
          <img src={imageUrl} alt="Generated thumbnail" className="thumb-generated-img" />
        </div>
      </div>
    </div>
  )
}

export function ThumbnailGenerator({ channelId, onOpenPersonas }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(4)
  const [stylePreset, setStylePreset] = useState('')
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const [fetchedThumbnailUrl, setFetchedThumbnailUrl] = useState(null)
  const [fetchingThumb, setFetchingThumb] = useState(false)
  const stepIntervalRef = useRef(null)
  const fetchThumbRef = useRef(null)
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId)
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const isEmptyScreen = messages.length === 0 && !pendingUserMessage && !pendingAssistant

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingUserMessage, pendingAssistant])

  useEffect(() => {
    if (!pendingAssistant) {
      setLoadingStepIndex(0)
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
        stepIntervalRef.current = null
      }
      return
    }
    setLoadingStepIndex(0)
    const totalSteps = THUMBNAIL_LOADING_STEPS.length
    const intervalMs = 6000
    stepIntervalRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, totalSteps - 1))
    }, intervalMs)
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current)
    }
  }, [pendingAssistant])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(28, Math.min(el.scrollHeight, 140))}px`
  }, [draft])

  useEffect(() => {
    const url = extractYoutubeUrl(draft)
    if (!url) {
      setFetchedThumbnailUrl(null)
      return
    }
    if (fetchThumbRef.current) clearTimeout(fetchThumbRef.current)
    fetchThumbRef.current = setTimeout(async () => {
      setFetchingThumb(true)
      setFetchedThumbnailUrl(null)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
        if (res?.thumbnail_url) setFetchedThumbnailUrl(res.thumbnail_url)
      } catch {
        setFetchedThumbnailUrl(null)
      } finally {
        setFetchingThumb(false)
      }
    }, 500)
    return () => {
      if (fetchThumbRef.current) clearTimeout(fetchThumbRef.current)
    }
  }, [draft])

  const handleQuickAction = (prompt) => {
    setDraft(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(len, len)
    })
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const trimmed = String(draft || '').trim()
    if (!trimmed || pendingAssistant) return

    const url = extractYoutubeUrl(trimmed)
    const isRegenerate = !!url

    if (isRegenerate) {
      const context = trimmed.replace(url, '').replace(/\s+/g, ' ').trim()
      const hasPersona = !!selectedPersonaId
      const hasContext = !!context
      if (!hasPersona && !hasContext) {
        setSendError('Select a persona and/or add context (e.g. "more dramatic") in the same input.')
        return
      }
    } else if (trimmed.length < 5) {
      return
    }

    setSendError('')
    setPendingUserMessage(trimmed)
    setPendingAssistant(true)
    setDraft('')

    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')

      if (isRegenerate) {
        const context = trimmed.replace(url, '').replace(/\s+/g, ' ').trim()
        const result = await thumbnailsApi.regenerateWithPersona(token, {
          youtube_url: url,
          persona_id: selectedPersonaId || undefined,
          prompt: context || undefined,
        })
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Regenerated thumbnail.',
          thumbnails: [{ title: 'Regenerated', emotion: '', psychology_angle: '', image_url: result?.image_url }],
        }
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: trimmed },
          assistantMsg,
        ])
      } else {
        const result = await thumbnailsApi.generateBatch(token, {
          user_request: trimmed,
          num_thumbnails: numThumbnails,
          profile_context: channelId ? {} : null,
          persona_id: selectedPersonaId || undefined,
          style_preset: stylePreset || undefined,
        })
        const thumbnails = result?.thumbnails || []
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: thumbnails.length > 0
            ? `Here are ${thumbnails.length} thumbnail${thumbnails.length !== 1 ? 's' : ''} for "${trimmed}".`
            : `Could not generate thumbnails for "${trimmed}". Try a different description.`,
          thumbnails,
        }
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: trimmed },
          assistantMsg,
        ])
      }
    } catch (err) {
      setSendError(err?.message || 'Could not generate thumbnails.')
      setDraft(trimmed)
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleCopyMessage = async (msg) => {
    try {
      let text = msg.content || ''
      if (msg.thumbnails?.length) {
        text += '\n\n' + msg.thumbnails.map((t) => `${t.title}: ${t.image_url?.slice(0, 80)}...`).join('\n\n')
      }
      if (navigator.clipboard?.writeText && text) await navigator.clipboard.writeText(text)
    } catch (_) {}
  }

  return (
    <div
      id="coach-panel-thumbnails"
      className={`coach-main ${isEmptyScreen ? 'coach-main--empty' : ''}`}
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <section className={`coach-chat-shell ${isEmptyScreen ? 'coach-chat-shell--empty' : ''}`}>
        <div ref={threadRef} className={`coach-thread ${isEmptyScreen ? 'coach-thread--empty' : ''}`}>
          {isEmptyScreen && (
            <div className="coach-empty-state">
              <span className="coach-empty-state-kicker">Thumbnail Generator</span>
              <h1>What thumbnail do you need?</h1>
              <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                {THUMBNAIL_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`coach-empty-action coach-empty-action--${action.id}`}
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <span className="coach-empty-action-icon-wrap" aria-hidden>
                      <IconEmptyThumbnail />
                    </span>
                    <span className="coach-empty-action-label">{action.label}</span>
                  </button>
                ))}
              </div>
              {channelId && <p className="script-gen-empty-hint">Using your channel for personalized thumbnails.</p>}
            </div>
          )}

          {messages.map((msg) => (
            <article
              key={msg.id}
              className={`coach-message ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
            >
              {msg.role === 'user' ? (
                <div className="coach-user-message-stack">
                  <div className="coach-message-bubble">
                    <p>{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div className="coach-message-bubble">
                  {msg.content && <p>{msg.content}</p>}
                  {msg.thumbnails?.length > 0 && (
                    <ThumbnailGridBlock thumbnails={msg.thumbnails} />
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
              </div>
            </article>
          ))}

          {pendingUserMessage && (
            <article className="coach-message coach-message--user">
              <div className="coach-user-message-stack">
                <div className="coach-message-bubble">
                  <p>{pendingUserMessage}</p>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && (
            <article className="coach-message coach-message--assistant">
              <div className="coach-message-bubble script-loading-bubble">
                <div className="script-loading-steps" role="status" aria-live="polite" aria-label="Generating thumbnails">
                  <div className="script-loading-header">
                    <div className="script-loading-spinner" aria-hidden />
                    <span className="script-loading-title">Generating thumbnails</span>
                  </div>
                  <ul className="script-loading-list">
                    {THUMBNAIL_LOADING_STEPS.map((step, i) => {
                      const done = i < loadingStepIndex
                      const active = i === loadingStepIndex
                      return (
                        <li
                          key={step.id}
                          className={`script-loading-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
                        >
                          <span className="script-loading-step-icon">
                            {done ? <IconCheck /> : active ? <span className="script-loading-step-dot" /> : <span className="script-loading-step-pending" />}
                          </span>
                          <span className="script-loading-step-label">{step.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        <footer className={`coach-composer-wrap ${isEmptyScreen ? 'coach-composer-wrap--empty' : ''}`}>
          {sendError && <div className="coach-compose-error">{sendError}</div>}
          <form className="coach-composer script-gen-composer" onSubmit={handleSubmit}>
            <div className="coach-composer-input-wrap">
              {(fetchedThumbnailUrl || fetchingThumb) && (
                <div className="thumb-input-preview">
                  {fetchingThumb && <span className="thumb-input-status">Fetching thumbnail…</span>}
                  {fetchedThumbnailUrl && !fetchingThumb && (
                    <img src={fetchedThumbnailUrl} alt="Fetched" className="thumb-input-preview-img" />
                  )}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(String(e.target.value).slice(0, 500))}
                placeholder="Paste YouTube URL or describe your video… e.g. https://youtube.com/watch?v=… or Thumbnail for a productivity tips video"
                rows={1}
                className="coach-composer-input"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
            </div>
            <div className="coach-composer-actions">
              <div className="coach-composer-actions-left script-gen-actions-left">
                <PersonaSelector onOpenLibrary={onOpenPersonas} compact />
                <select
                  className="script-gen-dropdown"
                  value={numThumbnails}
                  onChange={(e) => setNumThumbnails(Number(e.target.value))}
                  aria-label="Number of thumbnails"
                >
                  {CONCEPT_COUNTS.map((n) => (
                    <option key={n} value={n}>{n} thumbnail{n !== 1 ? 's' : ''}</option>
                  ))}
                </select>
                <select
                  className="script-gen-dropdown"
                  value={stylePreset}
                  onChange={(e) => setStylePreset(e.target.value)}
                  aria-label="Style preset"
                >
                  {STYLE_PRESETS.map((s) => (
                    <option key={s.value || 'none'} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="coach-composer-send coach-composer-primary-action is-send"
                disabled={!draft.trim() || pendingAssistant || (!extractYoutubeUrl(draft) && draft.trim().length < 5)}
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
