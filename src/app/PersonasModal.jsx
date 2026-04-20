/**
 * PersonasModal — character-look manager rendered inside the shared
 * <Dialog> primitive so it inherits the same portal, backdrop, entrance
 * motion, and close-X as every other modal in the app.
 *
 * Uses SegmentedTabs for pill-shaped tabs and embeds CostHint inside the
 * Generate button (same chip style as the coach send button).
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
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { Dialog } from '../components/ui/Dialog'
import { InlineSpinner } from '../components/ui'
import './PersonasModal.css'

const PRIMARY_GRADIENT = 'var(--accent-gradient)'

const PHOTO_SLOTS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
]

function IconX() {
  return (
    <svg
      width="18"
      height="18"
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
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
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
  const [personaTab, setPersonaTab] = useState('personal')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const fileRefs = useRef({ front: null, left: null, right: null })

  const requestClose = () => onClose?.()

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])
  const personalItems = items.filter((p) => p.visibility === 'personal')
  const stockItems = items.filter((p) => p.visibility === 'stock' || p.visibility === 'admin')
  const filteredItems = personaTab === 'personal' ? personalItems : stockItems

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
    } catch (_) {}
  }

  const handleDelete = async (persona) => {
    if (persona.visibility !== 'personal') return
    if (!window.confirm(`Delete "${persona.name}"?`)) return
    try {
      await deleteMutation.mutateAsync(persona.id)
      if (selectedPersonaId === persona.id) setSelectedPersona(null)
    } catch (_) {}
  }

  const handleFavorite = async (persona, e) => {
    e.stopPropagation()
    const isFav = pinnedIds.has(persona.id)
    try {
      if (isFav) await removeFavoriteMutation.mutateAsync(persona.id)
      else await addFavoriteMutation.mutateAsync({ persona_id: persona.id, is_pinned: true })
    } catch (_) {}
  }

  const createDisabled =
    createMutation.isPending || !createImages.front || !createImages.left || !createImages.right

  return (
    <Dialog open onClose={requestClose} size="md" ariaLabelledBy="personas-modal-title">
      <div
        style={{
          padding: 20,
          color: '#fff',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      >
        {/* Header — centered title, close on the right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 36px',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span />
          <h2
            id="personas-modal-title"
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.95)',
              letterSpacing: '-0.01em',
            }}
          >
            Character looks
          </h2>
          <button
            type="button"
            className="pm-press"
            onClick={requestClose}
            aria-label="Close"
            style={closeBtn}
          >
            <IconX />
          </button>
        </div>

        {/* Centered pill tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <SegmentedTabs
            value={personaTab}
            onChange={setPersonaTab}
            options={[
              { value: 'personal', label: 'Personal' },
              { value: 'stock', label: 'Stock' },
            ]}
            ariaLabel="Character sections"
          />
        </div>

        {/* Centered Create pill — no cost chip here */}
        {personaTab === 'personal' && !showCreate && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <button
              type="button"
              className="pm-press"
              onClick={() => setShowCreate(true)}
              style={createPillBtn}
            >
              <IconPlus />
              Create character
            </button>
          </div>
        )}

        {/* Inline create form */}
        {showCreate && personaTab === 'personal' && (
          <form
            onSubmit={handleCreate}
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.22)',
            }}
          >
            <p
              style={{
                margin: '0 0 12px',
                padding: '8px 10px',
                fontSize: 11.5,
                lineHeight: 1.45,
                color: 'rgba(229, 229, 231, 0.72)',
                background: 'rgba(167, 139, 250, 0.08)',
                border: '1px solid rgba(167, 139, 250, 0.22)',
                borderRadius: 10,
              }}
            >
              Upload photos <strong>you own or have rights to</strong> — typically photos of
              yourself. This tool is for original and authorized content creation; impersonating
              another person is not permitted.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginBottom: 12,
              }}
            >
              {PHOTO_SLOTS.map(({ key, label }) => {
                const file = createImages[key]
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.75)',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {label}
                    </span>
                    <input
                      ref={(el) => {
                        fileRefs.current[key] = el
                      }}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => pickFile(key, e.target.files?.[0])}
                    />
                    {file ? (
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '1 / 1',
                          borderRadius: 14,
                          overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#0c0c10',
                        }}
                      >
                        <img
                          src={URL.createObjectURL(file)}
                          alt={label}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                        <button
                          type="button"
                          className="pm-press"
                          onClick={() => {
                            setCreateImages((prev) => ({ ...prev, [key]: null }))
                            if (fileRefs.current[key]) fileRefs.current[key].value = ''
                          }}
                          aria-label={`Remove ${label}`}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 22,
                            height: 22,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: 'none',
                            borderRadius: 999,
                            background: 'rgba(0,0,0,0.72)',
                            color: '#fff',
                            cursor: 'pointer',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                          }}
                        >
                          <IconX />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="pm-slot"
                        onClick={() => fileRefs.current[key]?.click()}
                        style={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          borderRadius: 14,
                          border: '1px dashed rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.02)',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: 20,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <input
              type="text"
              className="pm-input"
              placeholder="Name this character"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={120}
              required
              style={pillInput}
            />

            {createError && <p style={errorStyle}>{createError}</p>}

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 4,
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                className="pm-press"
                onClick={clearCreateForm}
                style={ghostPill}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="pm-press"
                disabled={createDisabled}
                style={generatePill(createDisabled)}
              >
                {createMutation.isPending ? (
                  <span className="sk-btn-pending">
                    <InlineSpinner size={12} />
                    Generating…
                  </span>
                ) : (
                  'Generate'
                )}
                <CostHint featureKey="persona_generate" />
              </button>
            </div>
          </form>
        )}

        {/* Persona grid */}
        {!isPending && filteredItems.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {filteredItems.map((p, idx) => {
              const isSelected = p.id === selectedPersonaId
              const isPinned = pinnedIds.has(p.id)
              const isEditing = editingId === p.id && p.visibility === 'personal'
              return (
                <div
                  key={p.id}
                  className="pm-card"
                  style={{
                    background: isSelected ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${
                      isSelected ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'
                    }`,
                    borderRadius: 14,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    position: 'relative',
                    animationDelay: `${Math.min(idx * 24, 200)}ms`,
                  }}
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} style={{ padding: 10 }}>
                      <input
                        type="text"
                        className="pm-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={120}
                        required
                        style={{ ...pillInput, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="submit"
                          className="pm-press"
                          disabled={updateMutation.isPending}
                          style={savePill}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="pm-press"
                          onClick={() => setEditingId(null)}
                          style={smallGhostPill}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPersona(p)
                          requestClose()
                        }}
                        aria-label={`Select ${p.name}`}
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
                        <div
                          style={{
                            aspectRatio: '1 / 1',
                            overflow: 'hidden',
                            background: 'rgba(0,0,0,0.3)',
                          }}
                        >
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : null}
                        </div>
                        <h4
                          style={{
                            margin: 0,
                            padding: '8px 10px 10px',
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.9)',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.name}
                        </h4>
                      </button>

                      <button
                        type="button"
                        className="pm-fav pm-press"
                        onClick={(e) => handleFavorite(p, e)}
                        title={isPinned ? 'Unpin' : 'Pin'}
                        aria-label={isPinned ? 'Unpin' : 'Pin'}
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 24,
                          height: 24,
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          borderRadius: 999,
                          background: 'rgba(0,0,0,0.55)',
                          color: isPinned ? '#fbbf24' : 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          backdropFilter: 'blur(6px)',
                          WebkitBackdropFilter: 'blur(6px)',
                        }}
                      >
                        <IconStar filled={isPinned} />
                      </button>

                      {p.visibility === 'personal' && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            padding: '0 8px 8px',
                            justifyContent: 'center',
                          }}
                        >
                          <button
                            type="button"
                            className="pm-press"
                            onClick={() => {
                              setEditingId(p.id)
                              setEditName(p.name)
                            }}
                            style={smallGhostPill}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="pm-press"
                            onClick={() => handleDelete(p)}
                            style={smallDangerPill}
                          >
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
        )}
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
  color: 'rgba(255,255,255,0.75)',
  borderRadius: 999,
  cursor: 'pointer',
  justifySelf: 'end',
  fontFamily: 'inherit',
}

const createPillBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 18px',
  border: 'none',
  borderRadius: 999,
  background: PRIMARY_GRADIENT,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px rgba(124,58,237,0.32)',
}

const pillInput = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s ease, background 0.15s ease',
}

const errorStyle = {
  margin: '8px 0 0',
  fontSize: 12,
  color: '#fca5a5',
  textAlign: 'center',
}

const generatePill = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 18px',
  border: 'none',
  borderRadius: 999,
  background: PRIMARY_GRADIENT,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
  opacity: disabled ? 0.55 : 1,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px rgba(124,58,237,0.32)',
})

const ghostPill = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '9px 18px',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const savePill = {
  flex: 1,
  padding: '7px 14px',
  borderRadius: 999,
  border: 'none',
  background: 'rgba(139, 92, 246, 0.55)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const smallGhostPill = {
  flex: 1,
  padding: '6px 12px',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 999,
  background: 'transparent',
  color: 'rgba(255,255,255,0.78)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const smallDangerPill = {
  flex: 1,
  padding: '6px 12px',
  border: '1px solid rgba(239,68,68,0.32)',
  borderRadius: 999,
  background: 'transparent',
  color: '#f87171',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
