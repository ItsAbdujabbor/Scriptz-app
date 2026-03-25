import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { scriptsApi } from '../api/scripts'
import { useScriptConversationQuery } from '../queries/scripts/scriptQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { stripHashQueryParams } from '../lib/dashboardActionPayload'
import './ScriptGenerator.css'

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
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

function IconEmptyScript() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
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

const SCRIPT_LOADING_STEPS = [
  { id: 'concept', label: 'Refining your concept' },
  { id: 'hooks', label: 'Generating opening hooks' },
  { id: 'script', label: 'Writing the script' },
  { id: 'titles', label: 'Adding titles & metadata' },
  { id: 'polish', label: 'Quality check & polish' },
]

const SCRIPT_QUICK_ACTIONS = [
  { id: 'short', label: '60s Short about productivity', prompt: 'Generate a 60-second YouTube Short script about productivity hacks.' },
  { id: 'long', label: '10-min script on side hustles', prompt: 'Generate a 10-minute script about how to start a side hustle.' },
  { id: 'educ', label: 'Educational ML for beginners', prompt: 'Create an educational script about machine learning for beginners.' },
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
  const parts = String(text).split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[B-ROLL\]|\[ON-SCREEN TEXT\]|\[PAUSE\]|\[SFX\]|\[CUT\])/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (/^\*\*\*[^*]+\*\*\*$/.test(part)) return <strong key={key}><em>{part.slice(3, -3)}</em></strong>
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    if (/^\[(B-ROLL|ON-SCREEN TEXT|PAUSE|SFX|CUT)\]$/.test(part)) {
      return <span key={key} className="script-marker">{part}</span>
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
            <span key={i} className="script-marker">{m.startsWith('[') ? m : `[${m}]`}</span>
          ))}
        </span>
      )}
      <div className="script-segment-text">
        {lines.map((line, li) => {
          const trimmed = line.trim()
          if (!trimmed) return <br key={`${keyPrefix}-${index}-line-${li}`} />
          if (/^###\s+/.test(trimmed)) {
            return <h4 key={`${keyPrefix}-${index}-line-${li}`}>{renderScriptInline(trimmed.replace(/^###\s+/, ''), `${keyPrefix}-${index}-${li}`)}</h4>
          }
          if (/^##\s+/.test(trimmed)) {
            return <h3 key={`${keyPrefix}-${index}-line-${li}`}>{renderScriptInline(trimmed.replace(/^##\s+/, ''), `${keyPrefix}-${index}-${li}`)}</h3>
          }
          if (/^#\s+/.test(trimmed)) {
            return <h3 key={`${keyPrefix}-${index}-line-${li}`}>{renderScriptInline(trimmed.replace(/^#\s+/, ''), `${keyPrefix}-${index}-${li}`)}</h3>
          }
          return <p key={`${keyPrefix}-${index}-line-${li}`}>{renderScriptInline(trimmed, `${keyPrefix}-${index}-${li}`)}</p>
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
  const [openSections, setOpenSections] = useState({ script: true, hooks: true, titles: true })
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
            <button type="button" className="script-gen-copy" onClick={copyScript} aria-label={copiedScript ? 'Copied' : 'Copy'}>
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
            {pkg.script_rationale.hook_psychology && <p><strong>Hook:</strong> {pkg.script_rationale.hook_psychology}</p>}
            {pkg.script_rationale.retention_strategy && <p><strong>Retention:</strong> {pkg.script_rationale.retention_strategy}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function ScriptGenerator({ channelId, youtube, conversationId: conversationIdProp, onNavigateToConversation }) {
  const queryClient = useQueryClient()
  const conversationQuery = useScriptConversationQuery(conversationIdProp ?? null)
  const loadedMessages = useMemo(() => conversationQuery.data?.messages?.items ?? [], [conversationQuery.data])

  const [localMessages, setLocalMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [tone, setTone] = useState('')
  const [audience, setAudience] = useState('')
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const stepIntervalRef = useRef(null)
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const messages = conversationIdProp != null ? loadedMessages : localMessages
  const isLoadingConversation = conversationIdProp != null && conversationQuery.isPending
  const isEmptyScreen = !isLoadingConversation && messages.length === 0 && !pendingUserMessage && !pendingAssistant

  useEffect(() => {
    if (conversationIdProp != null) setLocalMessages([])
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
    if (!pendingAssistant) {
      setLoadingStepIndex(0)
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
        stepIntervalRef.current = null
      }
      return
    }
    setLoadingStepIndex(0)
    const totalSteps = SCRIPT_LOADING_STEPS.length
    const intervalMs = 12000
    stepIntervalRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, totalSteps - 1))
    }, intervalMs)
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
      }
    }
  }, [pendingAssistant])

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

  const buildMessage = () => {
    const topic = String(draft || '').trim()
    const parts = [topic]
    if (tone) parts.push(`Tone: ${tone}`)
    if (audience) parts.push(`Audience: ${audience}`)
    return parts.join('. ')
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const trimmed = String(draft || '').trim()
    if (!trimmed || pendingAssistant) return

    const finalMessage = buildMessage()
    setSendError('')
    setPendingUserMessage(finalMessage)
    setPendingAssistant(true)
    setDraft('')

    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')

      const res = await scriptsApi.sendChatMessage(
        token,
        {
          message: finalMessage,
          conversation_id: conversationIdProp ?? undefined,
          channel_id: channelId || undefined,
        },
        channelId
      )

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
          },
        ])
      }

      if (res.conversation_id != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scripts.conversations() })
        queryClient.invalidateQueries({ queryKey: queryKeys.scripts.conversation(res.conversation_id) })
        onNavigateToConversation?.(res.conversation_id)
      }
    } catch (err) {
      setSendError(err?.message || 'Could not generate script.')
      setDraft(trimmed)
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleCopyMessage = async (msg) => {
    try {
      let text = msg.content || ''
      if (msg.has_script && msg.script_response?.content_package?.script?.length) {
        text = msg.script_response.content_package.script.map((s) => s.text).join('\n\n')
      }
      if (navigator.clipboard?.writeText && text) await navigator.clipboard.writeText(text)
    } catch (_) {}
  }

  return (
    <div
      id="coach-panel-scripts"
      className={`coach-main ${isEmptyScreen ? 'coach-main--empty' : ''}`}
      role="tabpanel"
      aria-labelledby="coach-tab-scripts"
    >
      <section className={`coach-chat-shell ${isEmptyScreen ? 'coach-chat-shell--empty' : ''}`}>
        <div ref={threadRef} className={`coach-thread ${isEmptyScreen ? 'coach-thread--empty' : ''}`}>
          {isLoadingConversation && (
            <div className="coach-thread-state">Loading script…</div>
          )}
          {isEmptyScreen && (
            <div className="coach-empty-state">
              <span className="coach-empty-state-kicker">Script Generator</span>
              <h1>What script do you need?</h1>
              <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                {SCRIPT_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`coach-empty-action coach-empty-action--${action.id}`}
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <span className="coach-empty-action-icon-wrap" aria-hidden>
                      <IconEmptyScript />
                    </span>
                    <span className="coach-empty-action-label">{action.label}</span>
                  </button>
                ))}
              </div>
              {youtube && <p className="script-gen-empty-hint">Using your channel for personalized scripts.</p>}
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
                  {msg.has_script && msg.script_response?.content_package && (
                    <ScriptContentBlock pkg={msg.script_response.content_package} />
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
                <div className="script-loading-steps" role="status" aria-live="polite" aria-label="Generating script">
                  <div className="script-loading-header">
                    <div className="script-loading-spinner" aria-hidden />
                    <span className="script-loading-title">Creating your script</span>
                  </div>
                  <ul className="script-loading-list">
                    {SCRIPT_LOADING_STEPS.map((step, i) => {
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
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(String(e.target.value).slice(0, 3000))}
                placeholder="Topic… e.g. How to start a side hustle in 2024"
                rows={1}
                className="coach-composer-input"
                maxLength={3000}
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
                <select
                  className="script-gen-dropdown"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  aria-label="Tone"
                >
                  <option value="">Tone</option>
                  <option value="educational">Educational</option>
                  <option value="entertaining">Entertaining</option>
                  <option value="conversational">Conversational</option>
                  <option value="professional">Professional</option>
                </select>
                <select
                  className="script-gen-dropdown"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  aria-label="Audience"
                >
                  <option value="">Audience</option>
                  <option value="beginners">Beginners</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <button
                type="submit"
                className="coach-composer-send coach-composer-primary-action is-send"
                disabled={!draft.trim() || pendingAssistant}
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
