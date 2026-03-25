import { useState, useRef } from 'react'
import {
  usePersonasQuery,
  useCreatePersonaFromImagesMutation,
  useUpdatePersonaMutation,
  useDeletePersonaMutation,
  useAddPersonaFavoriteMutation,
  useRemovePersonaFavoriteMutation,
} from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import { TabBar } from '../components/TabBar'
import './PersonasModal.css'

const IMAGE_SLOTS = [
  { key: 'front', label: 'Front', desc: 'Straight-on view of face' },
  { key: 'left', label: 'Left side', desc: 'Left profile of face' },
  { key: 'right', label: 'Right side', desc: 'Right profile of face' },
]

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

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function PersonasModal({ onClose }) {
  const { data, isPending } = usePersonasQuery()
  const createFromImagesMutation = useCreatePersonaFromImagesMutation()
  const updateMutation = useUpdatePersonaMutation()
  const deleteMutation = useDeletePersonaMutation()
  const addFavoriteMutation = useAddPersonaFavoriteMutation()
  const removeFavoriteMutation = useRemovePersonaFavoriteMutation()
  const { selectedPersonaId, setSelectedPersona } = usePersonaStore()

  const [showCreate, setShowCreate] = useState(false)
  const [createImages, setCreateImages] = useState({ front: null, left: null, right: null })
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [personaTab, setPersonaTab] = useState('personal')
  const [viewingPersona, setViewingPersona] = useState(null)
  const fileInputRefs = useRef({ front: null, left: null, right: null })
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])
  const filteredItems = personaTab === 'personal'
    ? items.filter((p) => p.visibility === 'personal')
    : items.filter((p) => p.visibility === 'stock' || p.visibility === 'admin')

  const handleImageSelect = (slot, file) => {
    if (!file?.type?.startsWith('image/')) return
    setCreateImages((prev) => ({ ...prev, [slot]: file }))
    setCreateError('')
  }

  const handleCreateFromImages = async (e) => {
    e.preventDefault()
    const { front, left, right } = createImages
    if (!front || !left || !right) {
      setCreateError('All 3 images are required: front, left side, and right side of the face.')
      return
    }
    setCreateError('')
    const name = createName.trim() || 'My Persona'
    if (!name) {
      setCreateError('Please enter a name for your persona.')
      return
    }
    try {
      await createFromImagesMutation.mutateAsync({
        frontImage: front,
        leftImage: left,
        rightImage: right,
        name,
      })
      setCreateImages({ front: null, left: null, right: null })
      setCreateName('')
      setShowCreate(false)
    } catch (err) {
      setCreateError(err?.message || 'Could not create persona. Please try different images.')
    }
  }

  const clearCreateForm = () => {
    setCreateImages({ front: null, left: null, right: null })
    setCreateName('')
    setCreateError('')
    setShowCreate(false)
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    try {
      await updateMutation.mutateAsync({
        personaId: editingId,
        payload: { name, description: editDesc.trim() || undefined },
      })
      setEditingId(null)
      setEditName('')
      setEditDesc('')
    } catch (_) {}
  }

  const handleDelete = async (persona) => {
    if (persona.visibility !== 'personal') return
    if (!window.confirm(`Delete "${persona.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(persona.id)
      if (selectedPersonaId === persona.id) {
        setSelectedPersona(null)
      }
    } catch (_) {}
  }

  const handleFavorite = async (persona) => {
    const isFav = pinnedIds.has(persona.id)
    try {
      if (isFav) {
        await removeFavoriteMutation.mutateAsync(persona.id)
      } else {
        await addFavoriteMutation.mutateAsync({ persona_id: persona.id, is_pinned: true })
      }
    } catch (_) {}
  }

  const startEdit = (p) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditDesc(p.description || '')
  }

  return (
    <div className="personas-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="personas-modal-title">
      <div className="personas-modal" onClick={(e) => e.stopPropagation()}>
        <div className="personas-modal-header">
          <h2 id="personas-modal-title">Personas</h2>
          <button type="button" className="personas-modal-close" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <p className="personas-modal-intro">
          Personas are your face for thumbnails. Upload 3 face photos to create one persona image. When selected, that image is used in thumbnail generation.
        </p>

        <TabBar
          tabs={[
            { id: 'personal', label: 'Personal' },
            { id: 'stock', label: 'Stock' },
          ]}
          value={personaTab}
          onChange={setPersonaTab}
          ariaLabel="Persona sections"
          variant="modal"
        />

        <div className="personas-modal-actions">
          <button
            type="button"
            className="personas-modal-btn personas-modal-btn--primary"
            onClick={() => setShowCreate(true)}
          >
            <IconPlus />
            Create persona from images
          </button>
        </div>

        {showCreate && (
          <form className="personas-form personas-form--images" onSubmit={handleCreateFromImages}>
            <h3>Create persona from 3 face images</h3>
            <p className="personas-form-hint">
              Upload front view and both side profiles. Your face will be combined into one persona image used in thumbnails.
            </p>
            <div className="personas-image-slots">
              {IMAGE_SLOTS.map(({ key, label, desc }) => (
                <div key={key} className="personas-image-slot">
                  <label className="personas-image-slot-label">{label}</label>
                  <span className="personas-image-slot-desc">{desc}</span>
                  <input
                    ref={(el) => { fileInputRefs.current[key] = el }}
                    type="file"
                    accept="image/*"
                    className="personas-image-input"
                    onChange={(e) => handleImageSelect(key, e.target.files?.[0])}
                  />
                  {createImages[key] ? (
                    <div className="personas-image-preview">
                      <img src={URL.createObjectURL(createImages[key])} alt={label} />
                      <button
                        type="button"
                        className="personas-image-remove"
                        onClick={() => {
                          setCreateImages((p) => ({ ...p, [key]: null }))
                          if (fileInputRefs.current[key]) fileInputRefs.current[key].value = ''
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="personas-image-placeholder"
                      onClick={() => fileInputRefs.current[key]?.click()}
                    >
                      Click to upload
                    </button>
                  )}
                </div>
              ))}
            </div>
            <input
              type="text"
              placeholder="Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={120}
              className="personas-name-input"
              required
            />
            {createError && <p className="personas-form-error">{createError}</p>}
            <div className="personas-form-btns">
              <button
                type="submit"
                disabled={createFromImagesMutation.isPending || !createImages.front || !createImages.left || !createImages.right}
              >
                {createFromImagesMutation.isPending ? 'Creating…' : 'Generate persona'}
              </button>
              <button type="button" onClick={clearCreateForm}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="personas-list">
          {isPending && <div className="personas-list-loading">Loading…</div>}
          {!isPending && filteredItems.length === 0 && !showCreate && (
            <div className="personas-list-empty">
              {personaTab === 'personal' ? 'No personal personas yet. Create one to customize AI output.' : 'No stock personas available.'}
            </div>
          )}
          {!isPending &&
            filteredItems.map((p) => (
              <div
                key={p.id}
                className={`personas-card ${p.id === selectedPersonaId ? 'is-selected' : ''}`}
              >
                {editingId === p.id ? (
                  <form className="personas-edit-form" onSubmit={handleUpdate}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={120}
                      required
                    />
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      maxLength={2000}
                      rows={2}
                    />
                    <div className="personas-edit-btns">
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
                      className="personas-card-view-trigger"
                      onClick={() => setViewingPersona(p)}
                      aria-label={`View ${p.name}`}
                    >
                      {p.image_url && (
                        <div className="personas-card-img">
                          <img src={p.image_url} alt={p.name} />
                        </div>
                      )}
                      <div className="personas-card-main">
                        <h4 className="personas-card-name">{p.name}</h4>
                        {p.description && <p className="personas-card-desc">{p.description}</p>}
                        {p.tags?.length > 0 && (
                          <div className="personas-card-tags">
                            {p.tags.map((t) => (
                              <span key={t} className="personas-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="personas-card-actions">
                      <button
                        type="button"
                        className={`personas-fav ${pinnedIds.has(p.id) ? 'is-pinned' : ''}`}
                        onClick={() => handleFavorite(p)}
                        title={pinnedIds.has(p.id) ? 'Unpin' : 'Pin to top'}
                      >
                        <IconStar />
                      </button>
                      <button
                        type="button"
                        className="personas-select"
                        onClick={() => {
                          setSelectedPersona(p)
                          onClose()
                        }}
                      >
                        {p.id === selectedPersonaId ? 'Selected' : 'Use'}
                      </button>
                      {p.visibility === 'personal' && (
                        <>
                          <button type="button" onClick={() => startEdit(p)}>
                            Edit
                          </button>
                          <button type="button" className="personas-delete" onClick={() => handleDelete(p)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>

        {viewingPersona && (
          <div className="personas-view-overlay" onClick={() => setViewingPersona(null)}>
            <div className="personas-view-detail" onClick={(e) => e.stopPropagation()}>
              <div className="personas-view-header">
                <h3>{viewingPersona.name}</h3>
                <button
                  type="button"
                  className="personas-view-close"
                  onClick={() => setViewingPersona(null)}
                  aria-label="Close"
                >
                  <IconX />
                </button>
              </div>
              {viewingPersona.image_url && (
                <div className="personas-view-img-wrap">
                  <img src={viewingPersona.image_url} alt={viewingPersona.name} />
                </div>
              )}
              {viewingPersona.description && (
                <p className="personas-view-desc">{viewingPersona.description}</p>
              )}
              {viewingPersona.tags?.length > 0 && (
                <div className="personas-view-tags">
                  {viewingPersona.tags.map((t) => (
                    <span key={t} className="personas-tag">{t}</span>
                  ))}
                </div>
              )}
              <div className="personas-view-actions">
                <button
                  type="button"
                  className="personas-select"
                  onClick={() => {
                    setSelectedPersona(viewingPersona)
                    setViewingPersona(null)
                    onClose()
                  }}
                >
                  {viewingPersona.id === selectedPersonaId ? 'Selected' : 'Use this persona'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
