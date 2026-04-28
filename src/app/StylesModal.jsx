/**
 * StylesModal — style-library manager rendered inside the shared <Dialog>
 * primitive so it inherits the same portal, backdrop, entrance motion,
 * and close-X as every other modal in the app.
 *
 * Dual-source: "Personal" tab shows user-created styles (upload or from
 * a YouTube link); "Stock" tab shows admin-published styles. Creators
 * pick either to steer thumbnail generation.
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
import { useObjectURL } from '../lib/useObjectURL'
import { Dialog } from '../components/ui/Dialog'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { PrimaryPill } from '../components/ui/PrimaryPill'
import { InlineSpinner, SkeletonCard, SkeletonGroup } from '../components/ui'
import { friendlyMessage } from '../lib/aiErrors'
import './StylesModal.css'

function IconX({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
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

function IconPlus({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconPalette() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1-.23-.27-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-10-10-10z" />
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
  const createImagePreviewUrl = useObjectURL(createImage)
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
      setCreateError(friendlyMessage(err) || 'Could not create style.')
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
      setCreateError(friendlyMessage(err) || 'Could not create style from link.')
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
    } catch (_) {
      /* keep form open */
    }
  }

  const handleDelete = async (style) => {
    if (style.visibility !== 'personal') return
    if (!window.confirm(`Delete "${style.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(style.id)
      if (selectedStyleId === style.id) setSelectedStyle(null)
    } catch (_) {
      /* ignore */
    }
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

  const showEmpty = !isPending && filteredItems.length === 0 && !showCreate

  return (
    <Dialog open onClose={() => onClose?.()} size="lg" ariaLabelledBy="styles-modal-title">
      <div className="sm-body">
        {/* Header — matches PersonasModal + Optimize dropdown language */}
        <div className="sm-header">
          <div className="sm-header-titles">
            <h2 id="styles-modal-title" className="sm-title">
              Thumbnail styles
            </h2>
            <p className="sm-subtitle">Reference looks for your thumbnails</p>
          </div>
          <button
            type="button"
            className="sm-press sm-icon-btn"
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {/* Personal / Stock tabs */}
        <div className="sm-tabs-row">
          <SegmentedTabs
            value={styleTab}
            onChange={setStyleTab}
            options={[
              { value: 'personal', label: 'Your styles' },
              { value: 'stock', label: 'Stock' },
            ]}
            ariaLabel="Style sections"
          />
        </div>

        {/* Create CTA (only on Personal tab) */}
        {styleTab === 'personal' && !showCreate && (
          <div className="sm-actions-row">
            <PrimaryPill
              onClick={() => setShowCreate(true)}
              label="Create style"
              icon={<IconPlus size={12} />}
              size="sm"
            />
          </div>
        )}

        {/* Inline create form */}
        {showCreate && styleTab === 'personal' && (
          <div className="sm-create-card">
            <div className="sm-create-source-tabs">
              <SegmentedTabs
                value={createSourceTab}
                onChange={(v) => {
                  setCreateError('')
                  setCreateSourceTab(v)
                }}
                options={[
                  { value: 'upload', label: 'Upload image' },
                  { value: 'video', label: 'From YouTube' },
                ]}
                ariaLabel="How to add reference image"
              />
            </div>

            {createSourceTab === 'upload' && (
              <form onSubmit={handleCreate}>
                <div className="sm-upload-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sm-upload-input"
                    onChange={(e) => handleImageSelect(e.target.files?.[0])}
                  />
                  {createImage ? (
                    <div className="sm-upload-preview">
                      <img src={createImagePreviewUrl} alt="Preview" />
                      <button
                        type="button"
                        className="sm-press sm-preview-remove"
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
                      className="sm-press sm-upload-empty"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <IconPlus size={26} />
                      <span>Click to upload thumbnail</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="sm-input"
                  placeholder="Name this style"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                  required
                />
                {createError && <p className="sm-error-text">{createError}</p>}
                <div className="sm-form-actions">
                  <PrimaryPill
                    onClick={clearCreateForm}
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    type="button"
                  />
                  <PrimaryPill
                    type="submit"
                    onClick={() => {}}
                    disabled={createMutation.isPending || !createImage}
                    busy={createMutation.isPending}
                    label="Create"
                    busyLabel="Creating…"
                    size="sm"
                  />
                </div>
              </form>
            )}

            {createSourceTab === 'video' && (
              <form onSubmit={handleCreateFromYoutube}>
                <label htmlFor="styles-yt-url" className="sm-field-label">
                  Video URL
                </label>
                <input
                  id="styles-yt-url"
                  type="url"
                  className="sm-input"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={createYoutubeUrl}
                  onChange={(e) => setCreateYoutubeUrl(e.target.value.slice(0, 280))}
                  autoComplete="off"
                />
                <div className="sm-yt-preview-wrap">
                  <div className="sm-yt-preview">
                    {createYoutubeFetching && (
                      <span className="sm-yt-preview-state">
                        <InlineSpinner size={14} /> Loading preview…
                      </span>
                    )}
                    {!createYoutubeFetching && createYoutubePreview && (
                      <img src={createYoutubePreview} alt="" />
                    )}
                    {!createYoutubeFetching &&
                      !createYoutubePreview &&
                      extractYoutubeUrl(createYoutubeUrl) && (
                        <span className="sm-yt-preview-state">Couldn't load thumbnail</span>
                      )}
                    {!createYoutubeFetching &&
                      !createYoutubePreview &&
                      !extractYoutubeUrl(createYoutubeUrl) && (
                        <span className="sm-yt-preview-state">Preview appears here</span>
                      )}
                  </div>
                </div>
                <input
                  type="text"
                  className="sm-input"
                  placeholder="Name this style"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={80}
                  required
                />
                {createError && <p className="sm-error-text">{createError}</p>}
                <div className="sm-form-actions">
                  <PrimaryPill
                    onClick={clearCreateForm}
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    type="button"
                  />
                  <PrimaryPill
                    type="submit"
                    onClick={() => {}}
                    disabled={
                      createFromUrlMutation.isPending ||
                      !createYoutubePreview ||
                      !extractYoutubeUrl(createYoutubeUrl)
                    }
                    busy={createFromUrlMutation.isPending}
                    label="Create"
                    busyLabel="Creating…"
                    size="sm"
                  />
                </div>
              </form>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isPending && (
          <SkeletonGroup label="Loading styles">
            <div className="sm-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} ratio="16 / 9" lines={1} />
              ))}
            </div>
          </SkeletonGroup>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="sm-empty">
            <div className="sm-empty-icon" aria-hidden>
              <IconPalette />
            </div>
            <h3 className="sm-empty-title">
              {styleTab === 'personal' ? 'No styles yet' : 'No stock styles available'}
            </h3>
            <p className="sm-empty-body">
              {styleTab === 'personal'
                ? 'Upload a thumbnail or paste a YouTube link.'
                : 'Stock styles will appear here soon.'}
            </p>
          </div>
        )}

        {/* Style grid — fixed-size 16:9 cards */}
        {!isPending && filteredItems.length > 0 && (
          <div className="sm-grid">
            {filteredItems.map((s, idx) => {
              const isSelected = s.id === selectedStyleId
              const isEditing = editingId === s.id && s.visibility === 'personal'
              return (
                <div
                  key={s.id}
                  className={`sm-card sm-card--fixed ${isSelected ? 'sm-card--selected' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 28, 280)}ms` }}
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} className="sm-edit-form">
                      <input
                        type="text"
                        className="sm-input sm-edit-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        required
                        autoFocus
                      />
                      <div className="sm-edit-actions">
                        <button
                          type="submit"
                          className="sm-press sm-btn-save"
                          disabled={updateMutation.isPending}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="sm-press sm-btn-ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="sm-card-pick"
                        onClick={() => {
                          setSelectedStyle(s)
                          onClose?.()
                        }}
                        aria-label={`Use ${s.name}`}
                      >
                        <div className="sm-card-image">
                          <img src={s.image_url} alt={s.name} loading="lazy" />
                          {isSelected && (
                            <span className="sm-card-badge" aria-hidden>
                              Active
                            </span>
                          )}
                        </div>
                        <h4 className="sm-card-name">{s.name}</h4>
                      </button>
                      {s.visibility === 'personal' && (
                        <div className="sm-card-actions">
                          <button
                            type="button"
                            className="sm-press sm-card-action"
                            onClick={() => {
                              setEditingId(s.id)
                              setEditName(s.name)
                            }}
                            aria-label={`Rename ${s.name}`}
                            title="Rename"
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            className="sm-press sm-card-action sm-card-action--danger"
                            onClick={() => handleDelete(s)}
                            aria-label={`Delete ${s.name}`}
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}
