import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useThumbnailsQuery, useDeleteThumbnailMutation } from '../queries/thumbnails/thumbnailQueries'
import { Sidebar } from './Sidebar'
import './Sidebar.css'
import './Library.css'

const IconFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
)

const IconExternal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)

const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
)

const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

function getThumbnailImageUrl(item) {
  return item?.generative_image_url || item?.extracted_image_url || item?.base_thumbnail_url || null
}

function ThumbnailDetailDialog({ item, onClose, onDelete }) {
  const imgUrl = getThumbnailImageUrl(item)
  const deleteMutation = useDeleteThumbnailMutation()

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleDownload = () => {
    if (!imgUrl) return
    if (imgUrl.startsWith('data:')) {
      const link = document.createElement('a')
      link.href = imgUrl
      link.download = `thumbnail-${item.id}.png`
      link.click()
    } else {
      const link = document.createElement('a')
      link.href = imgUrl
      link.download = `thumbnail-${item.id}.png`
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.click()
    }
  }

  const handleEdit = () => {
    onClose()
    window.location.hash = '#coach/thumbnails'
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove this thumbnail from your library?')) return
    try {
      await deleteMutation.mutateAsync(item.id)
      onDelete?.()
      onClose()
    } catch (_) {}
  }

  const handleCopyUrl = async () => {
    if (!imgUrl) return
    try {
      if (imgUrl.startsWith('data:')) {
        const res = await fetch(imgUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      } else {
        await navigator.clipboard.writeText(imgUrl)
      }
    } catch (_) {}
  }

  return (
    <div className="thumb-detail-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="thumb-detail-title">
      <div className="thumb-detail-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="thumb-detail-header">
          <h2 id="thumb-detail-title">Thumbnail</h2>
          <button type="button" className="thumb-detail-close" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="thumb-detail-preview">
          {imgUrl ? (
            <img src={imgUrl} alt="Thumbnail preview" className="thumb-detail-img" />
          ) : (
            <div className="thumb-detail-placeholder">
              <IconFolder />
              <span>No preview</span>
            </div>
          )}
        </div>
        <div className="thumb-detail-actions">
          <button type="button" className="thumb-detail-btn thumb-detail-btn--primary" onClick={handleDownload}>
            <IconDownload />
            Download
          </button>
          <button type="button" className="thumb-detail-btn" onClick={handleEdit}>
            <IconExternal />
            Open in Thumbnail Generator
          </button>
          <button type="button" className="thumb-detail-btn" onClick={handleCopyUrl}>
            <IconCopy />
            Copy image
          </button>
          <button
            type="button"
            className="thumb-detail-btn thumb-detail-btn--danger"
            onClick={handleRemove}
            disabled={deleteMutation.isPending}
          >
            <IconTrash />
            {deleteMutation.isPending ? 'Removing…' : 'Remove from library'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ThumbnailsSection() {
  const { data, isPending } = useThumbnailsQuery({ limit: 50 })
  const deleteMutation = useDeleteThumbnailMutation()
  const items = data?.items ?? []
  const [selectedThumbnail, setSelectedThumbnail] = useState(null)

  const handleDelete = async (item, e) => {
    e?.stopPropagation?.()
    if (!window.confirm('Remove this thumbnail from your library?')) return
    try {
      await deleteMutation.mutateAsync(item.id)
    } catch (_) {}
  }

  if (isPending) {
    return (
      <div className="library-section library-section--loading">
        <span>Loading thumbnails…</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="library-section library-section--empty">
        <span className="library-empty-icon"><IconFolder /></span>
        <h3>No thumbnails yet</h3>
        <p>Generate thumbnails in Thumbnail Generator and save them to see them here.</p>
        <a href="#coach/thumbnails" className="library-cta-btn">
          <IconFolder />
          Go to Thumbnail Generator
        </a>
      </div>
    )
  }

  return (
    <>
      <div className="library-thumbnails-grid">
        {items.map((item) => {
          const imgUrl = getThumbnailImageUrl(item)
          return (
            <button
              key={item.id}
              type="button"
              className="library-thumbnail-card"
              onClick={() => setSelectedThumbnail(item)}
              aria-label={`View thumbnail ${item.id}`}
            >
              <div className="library-thumbnail-img-wrap">
                {imgUrl ? (
                  <img src={imgUrl} alt="Thumbnail" className="library-thumbnail-img" />
                ) : (
                  <div className="library-thumbnail-placeholder">
                    <IconFolder />
                    <span>No preview</span>
                  </div>
                )}
                <button
                  type="button"
                  className="library-thumbnail-remove"
                  onClick={(e) => handleDelete(item, e)}
                  title="Remove from library"
                  aria-label="Remove from library"
                >
                  <IconTrash />
                </button>
              </div>
            </button>
          )
        })}
      </div>
      {selectedThumbnail && (
        <ThumbnailDetailDialog
          item={selectedThumbnail}
          onClose={() => setSelectedThumbnail(null)}
          onDelete={() => setSelectedThumbnail(null)}
        />
      )}
    </>
  )
}

export function Library({ onLogout }) {
  const { user } = useAuthStore()

  return (
    <div className="library-layout">
      <Sidebar
        user={user}
        currentScreen="library"
        onLogout={onLogout}
      />
      <main className="library-main">
        <header className="library-header">
          <h1>Library</h1>
          <p className="library-subtitle">Your saved thumbnails</p>
        </header>

        <div className="library-content">
          <div className="library-panel is-active" role="region" aria-label="Thumbnails">
            <ThumbnailsSection />
          </div>
        </div>
      </main>
    </div>
  )
}
