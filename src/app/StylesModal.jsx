import { useState, useRef, useEffect } from 'react'
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
import { TabBar } from '../components/TabBar'
import './StylesModal.css'

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

  const items = data?.items ?? []
  const personalItems = items.filter((s) => s.visibility === 'personal')
  const stockItems = items.filter((s) => s.visibility === 'admin' || s.visibility === 'stock')
  const filteredItems = styleTab === 'personal' ? personalItems : stockItems

  const handleImageSelect = (file) => {
    if (!file?.type?.startsWith('image/')) return
    setCreateImage(file)
    setCreateError('')
  }

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

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createImage) {
      setCreateError('Upload a thumbnail image.')
      return
    }
    const name = createName.trim() || 'My Style'
    if (!name) {
      setCreateError('Enter a name for the style.')
      return
    }
    setCreateError('')
    try {
      const style = await createMutation.mutateAsync({ image: createImage, name })
      setSelectedStyle(style)
      setCreateImage(null)
      setCreateName('')
      setShowCreate(false)
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
      setCreateYoutubeUrl('')
      setCreateYoutubePreview(null)
      setCreateName('')
      setShowCreate(false)
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

  const selectStyle = (s) => setSelectedStyle(s)
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
    <div className="styles-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="styles-modal-title">
      <div className="styles-modal" onClick={(e) => e.stopPropagation()}>
        <div className="styles-modal-header">
          <h2 id="styles-modal-title">Thumbnail Styles</h2>
          <button type="button" className="styles-modal-close" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <p className="styles-modal-intro">
          Reference looks for generation — upload an image or grab a still from any YouTube video. Selected styles steer layout, color, and vibe.
        </p>

        <TabBar
          tabs={[
            { id: 'personal', label: 'Personal' },
            { id: 'stock', label: 'Stock' },
          ]}
          value={styleTab}
          onChange={setStyleTab}
          ariaLabel="Style sections"
          variant="modal"
        />

        {styleTab === 'personal' && (
          <div className="styles-modal-actions">
            <button
              type="button"
              className="styles-modal-btn styles-modal-btn--primary"
              onClick={() => setShowCreate(true)}
            >
              <IconPlus />
              Create style
            </button>
          </div>
        )}

        {showCreate && styleTab === 'personal' && (
          <div className="styles-create-wrap">
            <h3 className="styles-create-title">New visual style</h3>
            <TabBar
              tabs={[
                { id: 'upload', label: 'Upload image' },
                { id: 'video', label: 'From YouTube' },
              ]}
              value={createSourceTab}
              onChange={(id) => {
                setCreateError('')
                setCreateSourceTab(id)
              }}
              ariaLabel="How to add reference image"
              variant="modal"
              className="styles-create-source-tabs"
            />

            {createSourceTab === 'upload' && (
              <form className="styles-form" onSubmit={handleCreate}>
                <p className="styles-form-hint">Drop in a reference thumbnail — we’ll match its look when you generate.</p>
                <div className="styles-image-slot">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="styles-image-input"
                    onChange={(e) => handleImageSelect(e.target.files?.[0])}
                  />
                  {createImage ? (
                    <div className="styles-image-preview">
                      <img src={URL.createObjectURL(createImage)} alt="Preview" />
                      <button
                        type="button"
                        className="styles-image-remove"
                        onClick={() => {
                          setCreateImage(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="styles-image-placeholder"
                      onClick={() => fileInputRef.current?.click()}
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
                  className="styles-name-input"
                  required
                />
                {createError && <p className="styles-form-error">{createError}</p>}
                <div className="styles-form-btns">
                  <button type="submit" disabled={createMutation.isPending || !createImage}>
                    {createMutation.isPending ? 'Creating…' : 'Create style'}
                  </button>
                  <button type="button" onClick={clearCreateForm}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {createSourceTab === 'video' && (
              <form className="styles-form styles-form--video" onSubmit={handleCreateFromYoutube}>
                <p className="styles-form-hint">We’ll use that video’s current thumbnail as the style reference.</p>
                <label className="styles-yt-label" htmlFor="styles-yt-url">
                  Video URL
                </label>
                <input
                  id="styles-yt-url"
                  type="url"
                  className="styles-yt-url-input"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={createYoutubeUrl}
                  onChange={(e) => setCreateYoutubeUrl(e.target.value.slice(0, 280))}
                  autoComplete="off"
                />
                <div className="styles-yt-preview-row">
                  <div className="styles-yt-preview-frame">
                    {createYoutubeFetching && <span className="styles-yt-preview-loading">Loading preview…</span>}
                    {!createYoutubeFetching && createYoutubePreview && (
                      <img src={createYoutubePreview} alt="" className="styles-yt-preview-img" />
                    )}
                    {!createYoutubeFetching && !createYoutubePreview && extractYoutubeUrl(createYoutubeUrl) && (
                      <span className="styles-yt-preview-empty">Couldn’t load thumbnail</span>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Name this style"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                  className="styles-name-input"
                  required
                />
                {createError && <p className="styles-form-error">{createError}</p>}
                <div className="styles-form-btns">
                  <button
                    type="submit"
                    disabled={
                      createFromUrlMutation.isPending || !createYoutubePreview || !extractYoutubeUrl(createYoutubeUrl)
                    }
                  >
                    {createFromUrlMutation.isPending ? 'Creating…' : 'Create style'}
                  </button>
                  <button type="button" onClick={clearCreateForm}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="styles-list">
          {isPending && <div className="styles-list-loading">Loading…</div>}
          {!isPending && filteredItems.length === 0 && !showCreate && (
            <div className="styles-list-empty">
              {styleTab === 'personal'
                ? 'No personal styles. Create one by uploading a thumbnail.'
                : 'No stock styles available.'}
            </div>
          )}
          {!isPending &&
            filteredItems.map((s) => (
              <div
                key={s.id}
                className={`styles-card ${s.id === selectedStyleId ? 'is-selected' : ''}`}
              >
                {editingId === s.id && s.visibility === 'personal' ? (
                  <form className="styles-edit-form" onSubmit={handleUpdate}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={80}
                      required
                    />
                    <div className="styles-edit-btns">
                      <button type="submit" disabled={updateMutation.isPending}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="styles-card-trigger"
                      onClick={() => selectStyle(s)}
                      aria-label={`Select ${s.name}`}
                    >
                      <div className="styles-card-img">
                        <img src={s.image_url} alt={s.name} />
                      </div>
                      <h4 className="styles-card-name">{s.name}</h4>
                    </button>
                    {s.visibility === 'personal' && (
                      <div className="styles-card-actions">
                        <button
                          type="button"
                          className="styles-card-btn"
                          onClick={() => {
                            setEditingId(s.id)
                            setEditName(s.name)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="styles-card-btn styles-card-btn--danger"
                          onClick={() => handleDelete(s)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
