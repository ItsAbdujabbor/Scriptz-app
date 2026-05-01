/**
 * StylesModal — style-library manager.
 *
 * Dual-source: "Your styles" tab shows user-created styles (upload or
 * from a YouTube link); "Stock" tab shows admin-published styles.
 * Creators pick either to steer thumbnail generation.
 *
 * Visual language matches the thumbnail screen — pill-shaped mode
 * tabs (.sm-tab), New-chat-pill recipe primary buttons (.sm-pp), the
 * same card padding + rounded-inner-image treatment as the Personas
 * modal, and ConfirmDialog for delete confirmation.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
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
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { InlineSpinner, SkeletonCard, SkeletonGroup } from '../components/ui'
import { friendlyMessage } from '../lib/aiErrors'
import './StylesModal.css'

const STYLE_NAME_MAX = 40

/* ── Inline icons ─────────────────────────────────────────────────── */

function IconX({ size = 14 }) {
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
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconPlus({ size = 14 }) {
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

function IconUpload() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function IconLink() {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/** Graphic-style glyph from src/assets/graphic-style.svg — picture
 * frame with sparkle, used in the empty-state and Create button. */
function IconStyle({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.5,5c.83,0,1.5,.67,1.5,1.5s-.67,1.5-1.5,1.5-1.5-.67-1.5-1.5,.67-1.5,1.5-1.5Zm7.32,3.18l-.35-1.42c-.11-.44-.51-.76-.97-.76s-.86,.31-.97,.76l-.35,1.41-1.4,.32c-.45,.1-.77,.5-.77,.96,0,.46,.3,.86,.74,.98l1.43,.39,.36,1.43c.11,.44,.51,.76,.97,.76s.86-.31,.97-.76l.35-1.42,1.42-.35c.44-.11,.76-.51,.76-.97s-.31-.86-.76-.97l-1.42-.35Zm.79-3.3l1.76,.74,.7,1.75c.15,.38,.52,.63,.93,.63s.78-.25,.93-.63l.7-1.74,1.74-.7c.38-.15,.63-.52,.63-.93s-.25-.78-.63-.93l-1.74-.7-.7-1.74c-.15-.38-.52-.63-.93-.63s-.78,.25-.93,.63l-.69,1.73-1.73,.66c-.38,.14-.64,.51-.65,.92,0,.41,.23,.78,.61,.94Zm7.39,4.12v10c0,2.76-2.24,5-5,5H5c-2.76,0-5-2.24-5-5V5C0,2.24,2.24,0,5,0H15c.55,0,1,.45,1,1s-.45,1-1,1H5c-1.65,0-3,1.35-3,3v6.59l.56-.56c1.34-1.34,3.53-1.34,4.88,0l5.58,5.58c.54,.54,1.43,.54,1.97,0l.58-.58c1.34-1.34,3.53-1.34,4.88,0l1.56,1.56V9c0-.55,.45-1,1-1s1,.45,1,1Zm-2.24,11.17l-2.74-2.74c-.56-.56-1.48-.56-2.05,0l-.58,.58c-1.32,1.32-3.48,1.32-4.8,0l-5.58-5.58c-.56-.56-1.48-.56-2.05,0l-1.98,1.98v4.59c0,1.65,1.35,3,3,3h14c1.24,0,2.3-.75,2.76-1.83Z" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg
      width="13"
      height="13"
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

function IconCheck() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg
      width="13"
      height="13"
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

/* ── Pill tab — same recipe as the thumbnail generator's mode tabs ── */

function PillTab({ active, onClick, children, icon }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`sm-tab${active ? ' sm-tab--active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

/* ── Primary pill — exact recipe of the sidebar's New-chat pill ───── */

function PrimaryButton({
  type = 'button',
  onClick,
  disabled,
  busy,
  busyLabel,
  children,
  icon,
  className = '',
}) {
  return (
    <button
      type={type}
      className={`sm-pp${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {icon && (
        <span className="sm-pp-icon" aria-hidden>
          {busy ? <InlineSpinner size={13} /> : icon}
        </span>
      )}
      <span className="sm-pp-label">{busy && busyLabel ? busyLabel : children}</span>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

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
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [styleToDelete, setStyleToDelete] = useState(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
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
  // Show stock styles (admin-curated) FIRST, then the user's own
  // styles. Stock items get a small "Stock" badge in the grid; the
  // user can pick from either bucket. Bulk-remove only deletes the
  // user's personal styles — admins can't have their stock library
  // wiped from the user-facing app.
  const stockItems = items.filter((s) => s.visibility === 'admin' || s.visibility === 'stock')
  const personalItems = items.filter((s) => s.visibility === 'personal')
  const orderedItems = [...stockItems, ...personalItems]
  // `filteredItems` keeps its name for legacy refs; the order now is
  // stock-first, personal-second.
  const filteredItems = orderedItems

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

  const requestDelete = (style) => {
    if (style.visibility !== 'personal') return
    setStyleToDelete(style)
  }

  const confirmDelete = async () => {
    const s = styleToDelete
    if (!s) return
    setStyleToDelete(null)
    try {
      await deleteMutation.mutateAsync(s.id)
      if (selectedStyleId === s.id) setSelectedStyle(null)
    } catch (_) {
      /* ignore */
    }
  }

  const handleDeleteAll = async () => {
    if (!personalItems.length) return
    setConfirmDeleteAll(false)
    setBulkDeleting(true)
    try {
      // Only personal styles are deletable from the user app — stock
      // (admin) styles stay regardless.
      for (const s of personalItems) {
        try {
          await deleteMutation.mutateAsync(s.id)
        } catch (_) {
          /* keep going */
        }
      }
      setSelectedStyle(null)
    } finally {
      setBulkDeleting(false)
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

  // While the create form is open the dialog is dedicated to that
  // single task — same UX pattern as the Characters dialog. Grid +
  // empty state are hidden so the form has the surface to itself.
  const showEmpty = !isPending && filteredItems.length === 0 && !showCreate
  const showGrid = !isPending && filteredItems.length > 0 && !showCreate

  // Lazy render: keep `visibleCount` items in the DOM and grow on
  // scroll-to-end via IntersectionObserver. Cards carry images
  // (potentially data: URLs which are heavy to decode), so even mid-
  // sized libraries benefit from this.
  const PAGE_SIZE = 24
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  )
  const sentinelRef = useRef(null)
  const scrollRef = useRef(null)

  // Reset paging whenever the underlying list changes (after a delete,
  // create, etc.) so we always start at the top.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filteredItems.length])

  // IntersectionObserver fires when the sentinel enters the viewport
  // of the scroll surface. We watch within `scrollRef` (the dialog's
  // own scroll body) so it doesn't accidentally trigger from the
  // outer page scroll.
  useEffect(() => {
    if (!showGrid) return undefined
    if (visibleCount >= filteredItems.length) return undefined
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target) return undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, filteredItems.length))
        }
      },
      { root, rootMargin: '200px 0px', threshold: 0 }
    )
    io.observe(target)
    return () => io.disconnect()
  }, [showGrid, visibleCount, filteredItems.length])

  return (
    <Dialog open onClose={() => onClose?.()} size="lg" ariaLabelledBy="styles-modal-title">
      <div className="sm-body">
        {/* Header — title + close. Subtitle splits the counts so the
         * user can see at a glance which mix of stock vs personal
         * styles they're looking at. */}
        <div className="sm-header">
          <div className="sm-header-titles">
            <h2 id="styles-modal-title" className="sm-title">
              Thumbnail styles
            </h2>
            <p className="sm-subtitle">
              {filteredItems.length > 0
                ? [
                    stockItems.length > 0 ? `${stockItems.length} stock` : null,
                    personalItems.length > 0 ? `${personalItems.length} yours` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Reference looks for your thumbnails'}
            </p>
          </div>
          <button
            type="button"
            className="sm-icon-btn"
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Scroll body — flex-1 wrapper that owns the dialog's only
         * scroll surface. Top + bottom shadow gradients on the parent
         * `.sm-body` overlay this region for a smooth fade against
         * the header / dialog floor. */}
        <div className="sm-scroll" ref={scrollRef}>
          {/* Actions row — Create on the left, Remove all on the right
           * (only when there's something to remove). Mirrors the
           * Personas dialog so both manager modals behave the same. */}
          {!showCreate && (
            <div className="sm-actions-row">
              <PrimaryButton onClick={() => setShowCreate(true)} icon={<IconStyle size={14} />}>
                Create style
              </PrimaryButton>
              {personalItems.length > 0 && (
                <button
                  type="button"
                  className="sm-manage-btn"
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={bulkDeleting || deleteMutation.isPending}
                  title="Delete every style you've created"
                >
                  {bulkDeleting ? (
                    <>
                      <InlineSpinner size={12} />
                      Removing…
                    </>
                  ) : (
                    <>
                      <IconTrash />
                      Remove all
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Inline create form */}
          {showCreate && (
            <div className="sm-create-card">
              {/* Source tabs — Upload vs YouTube link. Same pill family
               * as the top tabs but smaller. */}
              <div className="sm-tab-row sm-tab-row--inner" role="tablist" aria-label="Source">
                <PillTab
                  active={createSourceTab === 'upload'}
                  onClick={() => {
                    setCreateError('')
                    setCreateSourceTab('upload')
                  }}
                  icon={<IconUpload />}
                >
                  Upload image
                </PillTab>
                <PillTab
                  active={createSourceTab === 'video'}
                  onClick={() => {
                    setCreateError('')
                    setCreateSourceTab('video')
                  }}
                  icon={<IconLink />}
                >
                  From YouTube
                </PillTab>
              </div>

              {createSourceTab === 'upload' && (
                <form onSubmit={handleCreate} className="sm-form">
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
                          className="sm-preview-remove"
                          onClick={() => {
                            setCreateImage(null)
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          aria-label="Remove image"
                        >
                          <IconX size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="sm-upload-empty"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span className="sm-upload-empty-icon" aria-hidden>
                          <IconPlus size={20} />
                        </span>
                        <span className="sm-upload-empty-hint">Click to upload thumbnail</span>
                      </button>
                    )}
                  </div>
                  <div className="sm-name-field">
                    <input
                      type="text"
                      className="sm-input sm-name-input"
                      placeholder="Name this style"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value.slice(0, STYLE_NAME_MAX))}
                      maxLength={STYLE_NAME_MAX}
                      required
                    />
                    <span
                      className={`sm-name-counter${createName.length >= STYLE_NAME_MAX - 5 ? ' sm-name-counter--warn' : ''}`}
                    >
                      {createName.length} / {STYLE_NAME_MAX}
                    </span>
                  </div>
                  {createError && <p className="sm-error-text">{createError}</p>}
                  <div className="sm-form-actions">
                    <button
                      type="button"
                      className="sm-btn-ghost"
                      onClick={clearCreateForm}
                      disabled={createMutation.isPending}
                    >
                      Cancel
                    </button>
                    <PrimaryButton
                      type="submit"
                      disabled={createMutation.isPending || !createImage}
                      busy={createMutation.isPending}
                      busyLabel="Creating…"
                    >
                      Create
                    </PrimaryButton>
                  </div>
                </form>
              )}

              {createSourceTab === 'video' && (
                <form onSubmit={handleCreateFromYoutube} className="sm-form">
                  <input
                    type="url"
                    className="sm-input sm-url-input"
                    placeholder="Paste a YouTube link"
                    value={createYoutubeUrl}
                    onChange={(e) => setCreateYoutubeUrl(e.target.value.slice(0, 280))}
                    autoComplete="off"
                  />
                  <div className="sm-yt-preview">
                    {createYoutubeFetching && (
                      <span className="sm-yt-preview-state">
                        <InlineSpinner size={14} /> Loading preview…
                      </span>
                    )}
                    {!createYoutubeFetching && createYoutubePreview && (
                      <img src={createYoutubePreview} alt="Preview" />
                    )}
                    {!createYoutubeFetching &&
                      !createYoutubePreview &&
                      extractYoutubeUrl(createYoutubeUrl) && (
                        <span className="sm-yt-preview-state">Couldn't load thumbnail</span>
                      )}
                    {!createYoutubeFetching &&
                      !createYoutubePreview &&
                      !extractYoutubeUrl(createYoutubeUrl) && (
                        <span className="sm-yt-preview-state">Preview will appear here</span>
                      )}
                  </div>
                  <div className="sm-name-field">
                    <input
                      type="text"
                      className="sm-input sm-name-input"
                      placeholder="Name this style"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value.slice(0, STYLE_NAME_MAX))}
                      maxLength={STYLE_NAME_MAX}
                      required
                    />
                    <span
                      className={`sm-name-counter${createName.length >= STYLE_NAME_MAX - 5 ? ' sm-name-counter--warn' : ''}`}
                    >
                      {createName.length} / {STYLE_NAME_MAX}
                    </span>
                  </div>
                  {createError && <p className="sm-error-text">{createError}</p>}
                  <div className="sm-form-actions">
                    <button
                      type="button"
                      className="sm-btn-ghost"
                      onClick={clearCreateForm}
                      disabled={createFromUrlMutation.isPending}
                    >
                      Cancel
                    </button>
                    <PrimaryButton
                      type="submit"
                      disabled={
                        createFromUrlMutation.isPending ||
                        !createYoutubePreview ||
                        !extractYoutubeUrl(createYoutubeUrl)
                      }
                      busy={createFromUrlMutation.isPending}
                      busyLabel="Creating…"
                    >
                      Create
                    </PrimaryButton>
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

          {/* Empty state — same recipe as the Characters dialog. */}
          {showEmpty && (
            <div className="sm-empty">
              <div className="sm-empty-icon" aria-hidden>
                <IconStyle size={28} />
              </div>
              <h3 className="sm-empty-title">No styles yet</h3>
              <p className="sm-empty-body">
                Upload a thumbnail or paste a YouTube link to save the look.
              </p>
            </div>
          )}

          {/* Style grid — hidden while the create form is open so the
           * dialog focuses on a single task at a time. Renders the
           * lazy `visibleItems` slice and grows on scroll via the
           * `.sm-scroll-sentinel` IntersectionObserver below. */}
          {showGrid && (
            <div className="sm-grid">
              {visibleItems.map((s, idx) => {
                const isSelected = s.id === selectedStyleId
                const isStock = s.visibility === 'admin' || s.visibility === 'stock'
                const isEditing = editingId === s.id && s.visibility === 'personal'
                return (
                  <div
                    key={s.id}
                    className={`sm-card${isSelected ? ' sm-card--selected' : ''}${isStock ? ' sm-card--stock' : ''}${isEditing ? ' sm-card--editing' : ''}`}
                    style={{ animationDelay: `${Math.min(idx * 28, 280)}ms` }}
                  >
                    {/* Image stays visible during rename so the card
                     * silhouette doesn't shift. Pick / actions hide
                     * while editing so taps don't fight the form. */}
                    <div className="sm-card-image">
                      <img src={s.image_url} alt={s.name} loading="lazy" />
                      {!isEditing && isSelected ? (
                        <span className="sm-card-badge" aria-hidden>
                          Active
                        </span>
                      ) : !isEditing && isStock ? (
                        <span className="sm-card-badge sm-card-badge--stock" aria-hidden>
                          Stock
                        </span>
                      ) : null}

                      {!isEditing && (
                        <button
                          type="button"
                          className="sm-card-pick"
                          onClick={() => {
                            setSelectedStyle(s)
                            onClose?.()
                          }}
                          aria-label={`Use ${s.name}`}
                        />
                      )}

                      {!isEditing && s.visibility === 'personal' && (
                        <div className="sm-card-actions">
                          <button
                            type="button"
                            className="sm-card-action"
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
                            className="sm-card-action sm-card-action--danger"
                            onClick={() => requestDelete(s)}
                            aria-label={`Delete ${s.name}`}
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <form onSubmit={handleUpdate} className="sm-card-rename">
                        <input
                          type="text"
                          className="sm-rename-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value.slice(0, STYLE_NAME_MAX))}
                          maxLength={STYLE_NAME_MAX}
                          required
                          autoFocus
                          aria-label="New name"
                        />
                        <button
                          type="button"
                          className="sm-rename-btn sm-rename-btn--cancel"
                          onClick={() => setEditingId(null)}
                          disabled={updateMutation.isPending}
                          aria-label="Cancel rename"
                          title="Cancel"
                        >
                          <IconX size={11} />
                        </button>
                        <button
                          type="submit"
                          className="sm-rename-btn sm-rename-btn--save"
                          disabled={updateMutation.isPending || !editName.trim()}
                          aria-label="Save name"
                          title="Save"
                        >
                          <IconCheck />
                        </button>
                      </form>
                    ) : (
                      <h4 className="sm-card-name">{s.name}</h4>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Sentinel for IntersectionObserver — when this enters the
           * viewport of `.sm-scroll`, we grow `visibleCount` by one
           * page. */}
          {showGrid && visibleCount < filteredItems.length && (
            <div ref={sentinelRef} className="sm-scroll-sentinel" aria-hidden />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!styleToDelete}
        title={`Delete "${styleToDelete?.name || ''}"?`}
        description="This permanently removes the style. Thumbnails generated before will keep their original look."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setStyleToDelete(null)}
      />

      {/* Bulk-remove confirm — wipes every personal style. Stock
       * styles are admin-curated and stay regardless. */}
      <ConfirmDialog
        open={confirmDeleteAll}
        title={`Delete all ${personalItems.length} of your style${personalItems.length === 1 ? '' : 's'}?`}
        description="This permanently removes every style you've created. Stock styles stay. Cannot be undone."
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </Dialog>
  )
}
