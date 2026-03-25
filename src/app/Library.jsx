import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useThumbnailsQuery, useDeleteThumbnailMutation } from '../queries/thumbnails/thumbnailQueries'
import {
  useScriptConversationsQuery,
  useUpdateScriptConversationMutation,
  useDeleteScriptConversationMutation,
} from '../queries/scripts/scriptQueries'
import { TabBar } from '../components/TabBar'
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

const IconScript = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
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

const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
)

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
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

function ScriptsSection() {
  const { data, isPending } = useScriptConversationsQuery({ limit: 50 })
  const updateMutation = useUpdateScriptConversationMutation()
  const deleteMutation = useDeleteScriptConversationMutation()
  const items = data?.items ?? []
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const handleOpen = (conversationId) => {
    window.location.hash = conversationId ? `#coach/scripts?id=${conversationId}` : '#coach/scripts'
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditTitle(item.title || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingId || !editTitle.trim()) return
    try {
      await updateMutation.mutateAsync({ conversationId: editingId, payload: { title: editTitle.trim() } })
      setEditingId(null)
      setEditTitle('')
    } catch (_) {}
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.title || 'Untitled script'}"?`)) return
    try {
      await deleteMutation.mutateAsync(item.id)
    } catch (_) {}
  }

  if (isPending) {
    return (
      <div className="library-section library-section--loading">
        <span>Loading scripts…</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="library-section library-section--empty">
        <span className="library-empty-icon"><IconScript /></span>
        <h3>No scripts yet</h3>
        <p>Create scripts in Script Generator to see them here.</p>
        <a href="#coach/scripts" className="library-cta-btn">
          <IconScript />
          Go to Script Generator
        </a>
      </div>
    )
  }

  return (
    <div className="library-scripts-grid">
      {items.map((item) => (
        <div key={item.id} className="library-script-card">
          {editingId === item.id ? (
            <form className="library-script-edit-form" onSubmit={saveEdit}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Script title"
                maxLength={200}
                autoFocus
                className="library-script-edit-input"
              />
              <div className="library-script-edit-btns">
                <button type="submit" disabled={updateMutation.isPending || !editTitle.trim()}>
                  {updateMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div className="library-script-icon">
                <IconScript />
              </div>
              <h4 className="library-script-title">{item.title || 'Untitled script'}</h4>
              <p className="library-script-meta">
                {item.message_count ?? 0} message{(item.message_count ?? 0) !== 1 ? 's' : ''}
              </p>
              <div className="library-script-actions">
                <button
                  type="button"
                  className="library-script-btn library-script-btn--edit"
                  onClick={() => startEdit(item)}
                  title="Rename"
                  aria-label="Rename script"
                >
                  <IconPencil />
                  Edit
                </button>
                <button
                  type="button"
                  className="library-script-btn library-script-btn--open"
                  onClick={() => handleOpen(item.id)}
                >
                  <IconExternal />
                  Open
                </button>
                <button
                  type="button"
                  className="library-script-btn library-script-btn--delete"
                  onClick={() => handleDelete(item)}
                  title="Delete"
                  aria-label="Delete script"
                >
                  <IconTrash />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

const LIBRARY_TABS = [
  { id: 'thumbnails', label: 'Thumbnails', icon: <IconFolder /> },
  { id: 'scripts', label: 'Scripts', icon: <IconScript /> },
]

export function Library({ onLogout }) {
  const { user } = useAuthStore()
  const [libraryTab, setLibraryTab] = useState('thumbnails')

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
          <p className="library-subtitle">Your saved thumbnails and scripts</p>
        </header>

        <TabBar
          tabs={LIBRARY_TABS}
          value={libraryTab}
          onChange={setLibraryTab}
          ariaLabel="Library sections"
        />

        <div className="library-content">
          <div
            className={`library-panel ${libraryTab === 'thumbnails' ? 'is-active' : ''}`}
            role="tabpanel"
            aria-labelledby="tab-thumbnails"
          >
            {libraryTab === 'thumbnails' && <ThumbnailsSection />}
          </div>
          <div
            className={`library-panel ${libraryTab === 'scripts' ? 'is-active' : ''}`}
            role="tabpanel"
            aria-labelledby="tab-scripts"
          >
            {libraryTab === 'scripts' && <ScriptsSection />}
          </div>
        </div>
      </main>
    </div>
  )
}
