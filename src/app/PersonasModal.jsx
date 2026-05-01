/**
 * PersonasModal — character library for the signed-in user.
 *
 * Personas are user-private: every character was created by the user
 * from their own uploaded photos. There's no stock/admin library —
 * each account curates its own.
 *
 * Sections inside the modal:
 *   - Header: title + subtitle + close ✕
 *   - Create CTA + bulk-remove (only when there's at least one persona)
 *   - Inline create form: Front / Left / Right photo slots (with drag
 *     & drop), name input, Cancel / Create
 *   - Empty state placeholder
 *   - Persona grid with rename / delete / favourite controls
 */
import { useRef, useState, useCallback } from 'react'
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
import { InlineSpinner } from '../components/ui'
import { useObjectURL } from '../lib/useObjectURL'
import { friendlyMessage } from '../lib/aiErrors'
import './PersonasModal.css'

function SlotImage({ file, alt }) {
  const url = useObjectURL(file)
  return <img src={url} alt={alt} />
}

const PHOTO_SLOTS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
]

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

/** User glyph from src/assets/user.svg — reused for the empty-state
 * placeholder and the persona-card image fallback so the empty UI
 * reads as the same character motif used everywhere else. */
function IconUser({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12,12A6,6,0,1,0,6,6,6.006,6.006,0,0,0,12,12ZM12,2A4,4,0,1,1,8,6,4,4,0,0,1,12,2Z" />
      <path d="M12,14a9.01,9.01,0,0,0-9,9,1,1,0,0,0,2,0,7,7,0,0,1,14,0,1,1,0,0,0,2,0A9.01,9.01,0,0,0,12,14Z" />
    </svg>
  )
}

function IconStar({ filled }) {
  return (
    <svg
      width="13"
      height="13"
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

/* ── Photo slot with drag-and-drop ────────────────────────────────── */

function PhotoSlot({ slotKey, label, file, onPick, onClear, fileInputRef }) {
  const [dragOver, setDragOver] = useState(false)

  const onDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragOver) setDragOver(true)
  }
  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear when leaving the wrap, not when crossing into a child.
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOver(false)
  }
  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const dropped = e.dataTransfer?.files?.[0]
    if (dropped) onPick(slotKey, dropped)
  }

  return (
    <div
      className={`pm-slot-wrap${dragOver ? ' pm-slot-wrap--dragover' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="pm-slot-label">{label}</span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="pm-slot-input"
        onChange={(e) => onPick(slotKey, e.target.files?.[0])}
      />
      {file ? (
        <div className="pm-slot pm-slot--filled">
          <SlotImage file={file} alt={label} />
          <button
            type="button"
            className="pm-slot-clear"
            onClick={(e) => {
              e.stopPropagation()
              onClear(slotKey)
            }}
            aria-label={`Remove ${label}`}
          >
            <IconX size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pm-slot pm-slot--empty"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="pm-slot-empty-icon" aria-hidden>
            <IconPlus size={20} />
          </span>
          <span className="pm-slot-empty-hint">{dragOver ? 'Drop image' : 'Drop or click'}</span>
        </button>
      )}
    </div>
  )
}

/* ── Buttons ──────────────────────────────────────────────────────── */

/** Primary pill — exact recipe of the sidebar's New-chat pill. Accent
 * gradient body, no border, inset top glaze, diagonal shine sweep on
 * hover, brightness lift, scale on press, slotted icon rotates on
 * hover. The label can be a string or a React node (used to embed the
 * CostHint chip alongside "Create"). */
function PrimaryButton({
  type = 'button',
  onClick,
  disabled,
  busy,
  busyLabel,
  children,
  icon,
  size = 'md',
  fullWidth,
  className = '',
}) {
  const cls = ['pm-pp', size === 'sm' ? 'pm-pp--sm' : '', fullWidth ? 'pm-pp--full' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {icon && (
        <span className="pm-pp-icon" aria-hidden>
          {busy ? <InlineSpinner size={size === 'sm' ? 11 : 13} /> : icon}
        </span>
      )}
      <span className="pm-pp-label">{busy && busyLabel ? busyLabel : children}</span>
    </button>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */

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
  const frontRef = useRef(null)
  const leftRef = useRef(null)
  const rightRef = useRef(null)
  const slotRefs = { front: frontRef, left: leftRef, right: rightRef }

  const requestClose = () => onClose?.()

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])
  const filteredItems = items.filter((p) => p.visibility === 'personal')

  const pickFile = useCallback((slot, file) => {
    if (!file?.type?.startsWith('image/')) return
    setCreateImages((prev) => ({ ...prev, [slot]: file }))
    setCreateError('')
  }, [])

  const clearSlot = useCallback((slot) => {
    setCreateImages((prev) => ({ ...prev, [slot]: null }))
    if (slotRefs[slot]?.current) slotRefs[slot].current.value = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearCreateForm = () => {
    setCreateImages({ front: null, left: null, right: null })
    setCreateName('')
    setCreateError('')
    setShowCreate(false)
    Object.values(slotRefs).forEach((ref) => {
      if (ref.current) ref.current.value = ''
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
      setCreateError(friendlyMessage(err) || 'Could not create character.')
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
      /* swallow */
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
          /* keep going */
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
      /* swallow */
    }
  }

  const createDisabled =
    createMutation.isPending || !createImages.front || !createImages.left || !createImages.right

  const isEmpty = !isPending && filteredItems.length === 0 && !showCreate
  const showGrid = !isPending && filteredItems.length > 0

  return (
    <Dialog open onClose={requestClose} size="lg" ariaLabelledBy="personas-modal-title">
      <div className="pm-body">
        {/* Header ── */}
        <div className="pm-header">
          <div className="pm-header-titles">
            <h2 id="personas-modal-title" className="pm-title">
              Your characters
            </h2>
            <p className="pm-subtitle">
              {showGrid
                ? `${filteredItems.length} saved · private to you`
                : 'Reusable faces for your thumbnails'}
            </p>
          </div>
          <button type="button" className="pm-icon-btn" onClick={requestClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>

        {/* Create CTA + bulk remove */}
        {!showCreate && (
          <div className="pm-actions-row">
            <PrimaryButton onClick={() => setShowCreate(true)} icon={<IconUser size={14} />}>
              Create character
            </PrimaryButton>
            {showGrid && (
              <button
                type="button"
                className="pm-manage-btn"
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
            <div className="pm-slots-grid">
              {PHOTO_SLOTS.map(({ key, label }) => (
                <PhotoSlot
                  key={key}
                  slotKey={key}
                  label={label}
                  file={createImages[key]}
                  onPick={pickFile}
                  onClear={clearSlot}
                  fileInputRef={slotRefs[key]}
                />
              ))}
            </div>

            <div className="pm-name-field">
              <input
                type="text"
                className="pm-input pm-name-input"
                placeholder="Name this character"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={120}
                required
              />
            </div>

            {createError && <p className="pm-error-text">{createError}</p>}

            <div className="pm-form-actions">
              <button
                type="button"
                className="pm-btn-ghost"
                onClick={clearCreateForm}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
              <PrimaryButton
                type="submit"
                disabled={createDisabled}
                busy={createMutation.isPending}
                busyLabel="Creating…"
                icon={<IconPlus size={13} />}
              >
                <span className="pm-pp-label-with-cost">
                  Create
                  <CostHint featureKey="persona_generate" />
                </span>
              </PrimaryButton>
            </div>
          </form>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="pm-empty">
            <div className="pm-empty-icon" aria-hidden>
              <IconUser size={32} />
            </div>
            <h3 className="pm-empty-title">No characters yet</h3>
            <p className="pm-empty-body">Upload 3 photos — front, left, right.</p>
          </div>
        )}

        {/* Persona grid */}
        {showGrid && (
          <div className="pm-grid">
            {filteredItems.map((p, idx) => {
              const isSelected = p.id === selectedPersonaId
              const isPinned = pinnedIds.has(p.id)
              const isEditing = editingId === p.id
              return (
                <div
                  key={p.id}
                  className={`pm-card${isSelected ? ' pm-card--selected' : ''}`}
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
                          className="pm-btn-ghost"
                          disabled={updateMutation.isPending}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="pm-btn-ghost"
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
                              <IconUser size={24} />
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
                        className={`pm-card-fav${isPinned ? ' pm-card-fav--on' : ''}`}
                        onClick={(e) => handleFavorite(p, e)}
                        title={isPinned ? 'Unpin' : 'Pin to top'}
                        aria-label={isPinned ? 'Unpin' : 'Pin to top'}
                      >
                        <IconStar filled={isPinned} />
                      </button>

                      <div className="pm-card-actions">
                        <button
                          type="button"
                          className="pm-card-action"
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
                          className="pm-card-action pm-card-action--danger"
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
