/**
 * StylesModal — style-library manager rendered inside the shared <Dialog>
 * primitive so it inherits the same portal, backdrop, entrance motion,
 * and close-X as every other modal in the app.
 */
import { useEffect, useRef, useState } from 'react'
import {
  useStylesQuery,
  useCreateStyleFromUploadMutation,
  useCreateStyleMutation,
  useUpdateStyleMutation,
  useDeleteStyleMutation,
} from '../queries/styles/styleQueries'
import { useStyleStore } from '../stores/styleStore'
import { thumbnailsApi } from '../api/thumbnails'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { Dialog } from '../components/ui/Dialog'
import { InlineSpinner, SkeletonCard, SkeletonGroup } from '../components/ui'

const PRIMARY_GRADIENT = 'var(--accent-gradient)'

function IconX() {
  return (
    <svg
      width="20"
      height="20"
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
  )
}

function IconPlus() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function StylesModal({ onClose }) {
  const { data, isPending } = useStylesQuery()
  const createMutation = useCreateStyleFromUploadMutation()
  const createFromUrlMutation = useCreateStyleMutation()
  const updateMutation = useUpdateStyleMutation()
  const deleteMutation = useDeleteStyleMutation()
  const { selectedStyleId, setSelectedStyle } = useStyleStore()

  const [showCreate, setShowCreate] = useState(false)
  const [createSourceTab, setCreateSourceTab] = useState('upload')
  const [createImage, setCreateImage] = useState(null)
  const [createYoutubeUrl, setCreateYoutubeUrl] = useState('')
  const [createYoutubePreview, setCreateYoutubePreview] = useState(null)
  const [createYoutubeFetching, setCreateYoutubeFetching] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [styleTab, setStyleTab] = useState('personal')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    const url = extractYoutubeUrl(createYoutubeUrl)
    if (!url || createSourceTab !== 'video') {
      setCreateYoutubePreview(null)
      return
    }
    const t = setTimeout(async () => {
      setCreateYoutubeFetching(true)
      setCreateYoutubePreview(null)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
        if (res?.thumbnail_url) setCreateYoutubePreview(res.thumbnail_url)
      } catch {
        setCreateYoutubePreview(null)
      } finally {
        setCreateYoutubeFetching(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [createYoutubeUrl, createSourceTab])

  const items = data?.items ?? []
  const personalItems = items.filter((s) => s.visibility === 'personal')
  const stockItems = items.filter((s) => s.visibility === 'admin' || s.visibility === 'stock')
  const filteredItems = styleTab === 'personal' ? personalItems : stockItems

  const handleImageSelect = (file) => {
    if (!file?.type?.startsWith('image/')) return
    setCreateImage(file)
    setCreateError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createImage) {
      setCreateError('Upload a thumbnail image.')
      return
    }
    const name = createName.trim() || 'My Style'
    setCreateError('')
    try {
      const style = await createMutation.mutateAsync({ image: createImage, name })
      setSelectedStyle(style)
      clearCreateForm()
    } catch (err) {
      setCreateError(err?.message || 'Could not create style.')
    }
  }

  const handleCreateFromYoutube = async (e) => {
    e.preventDefault()
    const url = extractYoutubeUrl(createYoutubeUrl)
    if (!url) {
      setCreateError('Paste a valid YouTube watch or youtu.be link.')
      return
    }
    if (!createYoutubePreview) {
      setCreateError('Wait for the thumbnail preview, or check the link.')
      return
    }
    const name = createName.trim() || 'My Style'
    setCreateError('')
    try {
      const style = await createFromUrlMutation.mutateAsync({
        name,
        image_url: createYoutubePreview,
      })
      setSelectedStyle(style)
      clearCreateForm()
    } catch (err) {
      setCreateError(err?.message || 'Could not create style.')
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    try {
      await updateMutation.mutateAsync({ styleId: editingId, payload: { name } })
      setEditingId(null)
      setEditName('')
    } catch (_) {}
  }

  const handleDelete = async (style) => {
    if (style.visibility !== 'personal') return
    if (!window.confirm(`Delete "${style.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(style.id)
      if (selectedStyleId === style.id) setSelectedStyle(null)
    } catch (_) {}
  }

  const clearCreateForm = () => {
    setCreateImage(null)
    setCreateYoutubeUrl('')
    setCreateYoutubePreview(null)
    setCreateSourceTab('upload')
    setCreateName('')
    setCreateError('')
    setShowCreate(false)
  }

  return (
    <Dialog open onClose={() => onClose?.()} size="lg" ariaLabelledBy="styles-modal-title">
      <div
        style={{
          padding: 24,
          color: '#fff',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h2
            id="styles-modal-title"
            style={{
              margin: 0,
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'rgba(255,255,255,0.95)',
            }}
          >
            Thumbnail Styles
          </h2>
          <button type="button" onClick={() => onClose?.()} aria-label="Close" style={closeBtn}>
            <IconX />
          </button>
        </div>

        <p
          style={{
            margin: '0 0 20px',
            fontSize: 14,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.5,
          }}
        >
          Reference looks for generation — upload an image or grab a still from any YouTube video.
          Selected styles steer layout, color, and vibe.
        </p>

        <div role="tablist" aria-label="Style sections" style={tabBarStyle}>
          {[
            { id: 'personal', label: 'Personal' },
            { id: 'stock', label: 'Stock' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={styleTab === t.id}
              onClick={() => setStyleTab(t.id)}
              style={tabBtnStyle(styleTab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {styleTab === 'personal' && !showCreate && (
          <div style={{ marginBottom: 20 }}>
            <button type="button" onClick={() => setShowCreate(true)} style={primaryBtn}>
              <IconPlus />
              Create style
            </button>
          </div>
        )}

        {showCreate && styleTab === 'personal' && (
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              New visual style
            </h3>

            <div
              role="tablist"
              aria-label="How to add reference image"
              style={{ ...tabBarStyle, marginBottom: 14 }}
            >
              {[
                { id: 'upload', label: 'Upload image' },
                { id: 'video', label: 'From YouTube' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={createSourceTab === t.id}
                  onClick={() => {
                    setCreateError('')
                    setCreateSourceTab(t.id)
                  }}
                  style={tabBtnStyle(createSourceTab === t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {createSourceTab === 'upload' && (
              <form onSubmit={handleCreate}>
                <p style={formHintStyle}>
                  Drop in a reference thumbnail — we’ll match its look when you generate.
                </p>
                <div style={{ marginBottom: 14 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageSelect(e.target.files?.[0])}
                  />
                  {createImage ? (
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '16 / 9',
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: '#0c0c10',
                      }}
                    >
                      <img
                        src={URL.createObjectURL(createImage)}
                        alt="Preview"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCreateImage(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        style={{
                          position: 'absolute',
                          bottom: 8,
                          right: 8,
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: 6,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        border: '2px dashed rgba(255,255,255,0.2)',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)',
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 14,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Click to upload thumbnail
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Name this style"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                  required
                  style={textInput}
                />
                {createError && <p style={errorStyle}>{createError}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !createImage}
                    style={submitBtn(createMutation.isPending || !createImage)}
                  >
                    {createMutation.isPending ? (
                      <span className="sk-btn-pending">
                        <InlineSpinner size={12} />
                        Creating…
                      </span>
                    ) : (
                      'Create style'
                    )}
                  </button>
                  <button type="button" onClick={clearCreateForm} style={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {createSourceTab === 'video' && (
              <form onSubmit={handleCreateFromYoutube}>
                <p style={formHintStyle}>
                  We’ll use that video’s current thumbnail as the style reference.
                </p>
                <label
                  htmlFor="styles-yt-url"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: 6,
                  }}
                >
                  Video URL
                </label>
                <input
                  id="styles-yt-url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={createYoutubeUrl}
                  onChange={(e) => setCreateYoutubeUrl(e.target.value.slice(0, 280))}
                  autoComplete="off"
                  style={textInput}
                />
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 260,
                      aspectRatio: '16 / 9',
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.45)',
                      fontSize: 12,
                      textAlign: 'center',
                      padding: 8,
                      boxSizing: 'border-box',
                    }}
                  >
                    {createYoutubeFetching && <span>Loading preview…</span>}
                    {!createYoutubeFetching && createYoutubePreview && (
                      <img
                        src={createYoutubePreview}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                    {!createYoutubeFetching &&
                      !createYoutubePreview &&
                      extractYoutubeUrl(createYoutubeUrl) && <span>Couldn’t load thumbnail</span>}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Name this style"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                  required
                  style={textInput}
                />
                {createError && <p style={errorStyle}>{createError}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="submit"
                    disabled={
                      createFromUrlMutation.isPending ||
                      !createYoutubePreview ||
                      !extractYoutubeUrl(createYoutubeUrl)
                    }
                    style={submitBtn(
                      createFromUrlMutation.isPending ||
                        !createYoutubePreview ||
                        !extractYoutubeUrl(createYoutubeUrl)
                    )}
                  >
                    {createFromUrlMutation.isPending ? (
                      <span className="sk-btn-pending">
                        <InlineSpinner size={12} />
                        Creating…
                      </span>
                    ) : (
                      'Create style'
                    )}
                  </button>
                  <button type="button" onClick={clearCreateForm} style={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {isPending && (
            <div
              style={{
                gridColumn: '1 / -1',
              }}
            >
              <SkeletonGroup label="Loading styles">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 14,
                  }}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} ratio="1 / 1" lines={1} />
                  ))}
                </div>
              </SkeletonGroup>
            </div>
          )}
          {!isPending && filteredItems.length === 0 && !showCreate && (
            <div style={{ ...emptyState, gridColumn: '1 / -1' }}>
              {styleTab === 'personal'
                ? 'No personal styles. Create one by uploading a thumbnail.'
                : 'No stock styles available.'}
            </div>
          )}
          {!isPending &&
            filteredItems.map((s) => {
              const isSelected = s.id === selectedStyleId
              const isEditing = editingId === s.id && s.visibility === 'personal'
              return (
                <div
                  key={s.id}
                  style={{
                    background: isSelected ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isSelected ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ padding: 12 }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        required
                        style={textInput}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="submit" disabled={updateMutation.isPending} style={saveBtn}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} style={ghostBtn}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedStyle(s)}
                        aria-label={`Select ${s.name}`}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: 0,
                          border: 'none',
                          background: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'inherit',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ aspectRatio: '16 / 9', overflow: 'hidden' }}>
                          <img
                            src={s.image_url}
                            alt={s.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        </div>
                        <h4
                          style={{
                            margin: 0,
                            padding: '10px 12px',
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.9)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.name}
                        </h4>
                      </button>
                      {s.visibility === 'personal' && (
                        <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(s.id)
                              setEditName(s.name)
                            }}
                            style={smallGhost}
                          >
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(s)} style={dangerBtn}>
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </Dialog>
  )
}

const closeBtn = {
  width: 32,
  height: 32,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.7)',
  borderRadius: 8,
  cursor: 'pointer',
}

const tabBarStyle = {
  display: 'flex',
  gap: 4,
  marginBottom: 16,
  padding: 4,
  background: 'rgba(0,0,0,0.3)',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.06)',
}

const tabBtnStyle = (active) => ({
  flex: 1,
  padding: '9px 14px',
  border: 'none',
  borderRadius: 7,
  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s',
})

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '11px 22px',
  border: 'none',
  borderRadius: 999,
  background: PRIMARY_GRADIENT,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px rgba(124,58,237,0.32)',
}

const emptyState = {
  padding: 24,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 14,
}

const textInput = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginBottom: 10,
  padding: '10px 12px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
}

const formHintStyle = {
  margin: '0 0 12px',
  fontSize: 13,
  color: 'rgba(255,255,255,0.6)',
  lineHeight: 1.4,
}

const errorStyle = {
  margin: '0 0 10px',
  fontSize: 13,
  color: '#f87171',
}

const submitBtn = (disabled) => ({
  padding: '10px 20px',
  border: 'none',
  borderRadius: 8,
  background: PRIMARY_GRADIENT,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
  opacity: disabled ? 0.55 : 1,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px rgba(124,58,237,0.32)',
})

const saveBtn = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'rgba(139, 92, 246, 0.6)',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const ghostBtn = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const smallGhost = {
  padding: '6px 12px',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const dangerBtn = {
  padding: '6px 12px',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 6,
  background: 'transparent',
  color: '#f87171',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
