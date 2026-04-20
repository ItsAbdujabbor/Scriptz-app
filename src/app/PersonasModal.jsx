/**
 * PersonasModal — character-look manager rendered inside the shared
 * <Dialog> primitive so it inherits the same portal, backdrop, entrance
 * motion, and close-X as every other modal in the app.
 *
 * Personas are **user-private**: every character you see in this modal
 * was created by the signed-in user from their own uploaded photos.
 * There's no stock/admin library — each account curates its own.
 *
 * Embeds CostHint inside the Generate button (same chip style as the
 * coach send button).
 */
import { useRef, useState } from 'react'
import {
  usePersonasQuery,
  useCreatePersonaFromImagesMutation,
  useUpdatePersonaMutation,
  useDeletePersonaMutation,
  useAddPersonaFavoriteMutation,
  useRemovePersonaFavoriteMutation,
} from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import { CostHint } from '../components/CostHint'
import { Dialog } from '../components/ui/Dialog'
import { PrimaryPill } from '../components/ui/PrimaryPill'
import { InlineSpinner } from '../components/ui'
import './PersonasModal.css'

const PHOTO_SLOTS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
]

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

function IconStar({ filled }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

function IconUsers() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function PersonasModal({ onClose }) {
  const { data, isPending } = usePersonasQuery()
  const createMutation = useCreatePersonaFromImagesMutation()
  const updateMutation = useUpdatePersonaMutation()
  const deleteMutation = useDeletePersonaMutation()
  const addFavoriteMutation = useAddPersonaFavoriteMutation()
  const removeFavoriteMutation = useRemovePersonaFavoriteMutation()
  const { selectedPersonaId, setSelectedPersona } = usePersonaStore()

  const [showCreate, setShowCreate] = useState(false)
  const [createImages, setCreateImages] = useState({ front: null, left: null, right: null })
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const fileRefs = useRef({ front: null, left: null, right: null })

  const requestClose = () => onClose?.()

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])
  // User-only: keep personal items the signed-in user created. Any legacy
  // admin/stock rows returned by the API are hidden so creators see a clean
  // "my characters" library.
  const filteredItems = items.filter((p) => p.visibility === 'personal')

  const pickFile = (slot, file) => {
    if (!file?.type?.startsWith('image/')) return
    setCreateImages((prev) => ({ ...prev, [slot]: file }))
    setCreateError('')
  }

  const clearCreateForm = () => {
    setCreateImages({ front: null, left: null, right: null })
    setCreateName('')
    setCreateError('')
    setShowCreate(false)
    Object.values(fileRefs.current).forEach((el) => {
      if (el) el.value = ''
    })
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createImages.front || !createImages.left || !createImages.right) {
      setCreateError('All 3 photos are required.')
      return
    }
    const name = createName.trim() || 'My Character'
    setCreateError('')
    try {
      const persona = await createMutation.mutateAsync({
        frontImage: createImages.front,
        leftImage: createImages.left,
        rightImage: createImages.right,
        name,
      })
      if (persona) setSelectedPersona(persona)
      clearCreateForm()
    } catch (err) {
      setCreateError(err?.message || 'Could not create character.')
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    try {
      await updateMutation.mutateAsync({ personaId: editingId, payload: { name } })
      setEditingId(null)
      setEditName('')
    } catch (_) {
      /* stay in edit mode on error */
    }
  }

  const handleDelete = async (persona) => {
    if (persona.visibility !== 'personal') return
    if (!window.confirm(`Delete "${persona.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(persona.id)
      if (selectedPersonaId === persona.id) setSelectedPersona(null)
    } catch (_) {
      /* swallow — row stays */
    }
  }

  const handleDeleteAll = async () => {
    if (!filteredItems.length) return
    if (
      !window.confirm(
        `Delete all ${filteredItems.length} character${filteredItems.length === 1 ? '' : 's'}? This cannot be undone.`
      )
    )
      return
    setBulkDeleting(true)
    try {
      for (const p of filteredItems) {
        try {
          await deleteMutation.mutateAsync(p.id)
        } catch (_) {
          /* continue deleting the rest */
        }
      }
      setSelectedPersona(null)
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleFavorite = async (persona, e) => {
    e.stopPropagation()
    const isFav = pinnedIds.has(persona.id)
    try {
      if (isFav) await removeFavoriteMutation.mutateAsync(persona.id)
      else await addFavoriteMutation.mutateAsync({ persona_id: persona.id, is_pinned: true })
    } catch (_) {
      /* ignore — badge stays in prior state */
    }
  }

  const createDisabled =
    createMutation.isPending || !createImages.front || !createImages.left || !createImages.right

  const isEmpty = !isPending && filteredItems.length === 0 && !showCreate
  const showGrid = !isPending && filteredItems.length > 0

  return (
    <Dialog open onClose={requestClose} size="lg" ariaLabelledBy="personas-modal-title">
      <div className="pm-body">
        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-spacer" />
          <div className="pm-header-titles">
            <h2 id="personas-modal-title" className="pm-title">
              Characters
            </h2>
            <p className="pm-subtitle">
              {showGrid
                ? `${filteredItems.length} character${filteredItems.length === 1 ? '' : 's'} · only you can see these`
                : 'Upload 3 photos to create a reusable character look'}
            </p>
          </div>
          <button
            type="button"
            className="pm-press pm-icon-btn"
            onClick={requestClose}
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {/* Create CTA + manage row */}
        {!showCreate && (
          <div className="pm-actions-row">
            <PrimaryPill
              onClick={() => setShowCreate(true)}
              label="Create character"
              icon={<IconPlus size={14} />}
              size="md"
            />
            {showGrid && (
              <button
                type="button"
                className="pm-press pm-manage-btn"
                onClick={handleDeleteAll}
                disabled={bulkDeleting || deleteMutation.isPending}
                title="Delete every character you've created"
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
          <form onSubmit={handleCreate} className="pm-create-form">
            <p className="pm-rights-notice">
              Upload photos <strong>you own or have rights to</strong> — typically photos of
              yourself. This tool is for original and authorized content creation; impersonating
              another person is not permitted.
            </p>
            <div className="pm-slots-grid">
              {PHOTO_SLOTS.map(({ key, label }) => {
                const file = createImages[key]
                return (
                  <div key={key} className="pm-slot-wrap">
                    <span className="pm-slot-label">{label}</span>
                    <input
                      ref={(el) => {
                        fileRefs.current[key] = el
                      }}
                      type="file"
                      accept="image/*"
                      className="pm-slot-input"
                      onChange={(e) => pickFile(key, e.target.files?.[0])}
                    />
                    {file ? (
                      <div className="pm-slot-preview">
                        <img src={URL.createObjectURL(file)} alt={label} />
                        <button
                          type="button"
                          className="pm-press pm-slot-clear"
                          onClick={() => {
                            setCreateImages((prev) => ({ ...prev, [key]: null }))
                            if (fileRefs.current[key]) fileRefs.current[key].value = ''
                          }}
                          aria-label={`Remove ${label}`}
                        >
                          <IconX size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="pm-slot pm-slot-empty"
                        onClick={() => fileRefs.current[key]?.click()}
                      >
                        <IconPlus size={22} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <input
              type="text"
              className="pm-input pm-name-input"
              placeholder="Name this character"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={120}
              required
            />

            {createError && <p className="pm-error-text">{createError}</p>}

            <div className="pm-form-actions">
              <PrimaryPill
                onClick={clearCreateForm}
                label="Cancel"
                variant="ghost"
                size="md"
                type="button"
              />
              <PrimaryPill
                type="submit"
                onClick={() => {}}
                disabled={createDisabled}
                busy={createMutation.isPending}
                label={
                  <span className="pm-generate-label">
                    Generate
                    <CostHint featureKey="persona_generate" />
                  </span>
                }
                busyLabel="Generating…"
                size="md"
              />
            </div>
          </form>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="pm-empty">
            <div className="pm-empty-icon" aria-hidden>
              <IconUsers />
            </div>
            <h3 className="pm-empty-title">No characters yet</h3>
            <p className="pm-empty-body">
              Create your first character by uploading 3 photos of yourself — front, left, and
              right. Only you will see it.
            </p>
          </div>
        )}

        {/* Persona grid — fixed-size cards */}
        {showGrid && (
          <div className="pm-grid">
            {filteredItems.map((p, idx) => {
              const isSelected = p.id === selectedPersonaId
              const isPinned = pinnedIds.has(p.id)
              const isEditing = editingId === p.id
              return (
                <div
                  key={p.id}
                  className={`pm-card pm-card--fixed ${isSelected ? 'pm-card--selected' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 28, 280)}ms` }}
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} className="pm-edit-form">
                      <input
                        type="text"
                        className="pm-input pm-edit-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={120}
                        required
                        autoFocus
                      />
                      <div className="pm-edit-actions">
                        <button
                          type="submit"
                          className="pm-press pm-btn-save"
                          disabled={updateMutation.isPending}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="pm-press pm-btn-ghost"
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
                        className="pm-card-pick"
                        onClick={() => {
                          setSelectedPersona(p)
                          requestClose()
                        }}
                        aria-label={`Use ${p.name}`}
                      >
                        <div className="pm-card-image">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} loading="lazy" />
                          ) : (
                            <div className="pm-card-image-placeholder" aria-hidden>
                              <IconUsers />
                            </div>
                          )}
                          {isSelected && (
                            <span className="pm-card-badge" aria-hidden>
                              Active
                            </span>
                          )}
                        </div>
                        <h4 className="pm-card-name">{p.name}</h4>
                      </button>

                      <button
                        type="button"
                        className={`pm-press pm-card-fav ${isPinned ? 'pm-card-fav--on' : ''}`}
                        onClick={(e) => handleFavorite(p, e)}
                        title={isPinned ? 'Unpin' : 'Pin to top'}
                        aria-label={isPinned ? 'Unpin' : 'Pin to top'}
                      >
                        <IconStar filled={isPinned} />
                      </button>

                      <div className="pm-card-actions">
                        <button
                          type="button"
                          className="pm-press pm-card-action"
                          onClick={() => {
                            setEditingId(p.id)
                            setEditName(p.name)
                          }}
                          aria-label={`Rename ${p.name}`}
                          title="Rename"
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="pm-press pm-card-action pm-card-action--danger"
                          onClick={() => handleDelete(p)}
                          aria-label={`Delete ${p.name}`}
                          title="Delete"
                        >
                          <IconTrash />
                        </button>
                      </div>
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
