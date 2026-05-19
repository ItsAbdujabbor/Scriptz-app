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
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  usePersonasQuery,
  useCreatePersonaFromImagesMutation,
  useUpdatePersonaMutation,
  useDeletePersonaMutation,
  useAddPersonaFavoriteMutation,
  useRemovePersonaFavoriteMutation,
} from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import { useCostOf } from '../queries/billing/creditsQueries'
import { Dialog } from '../components/ui/Dialog'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { InlineSpinner } from '../components/ui'
import { useObjectURL } from '../lib/useObjectURL'
import { friendlyMessage } from '../lib/aiErrors'
import { PERSONA_NAME_MAX_LENGTH } from '../lib/constants'
import { toast } from '../lib/toast'
import './PersonasModal.css'

/**
 * PersonaGenLoader — card-filling generation animation identical to the
 * thumbnail generator's ThumbnailGenFill. Deep-purple gradient grows
 * left → right, soft white sheen sweeps the filled area, large tabular
 * percentage sits centred over everything. rAF-driven asymptotic curve
 * (fast to ~92 %, slow creep to ~99 %) with per-mount jitter so no two
 * generations feel identical.
 */
const PersonaGenLoader = memo(function PersonaGenLoader({ done = false, onComplete }) {
  const [pct, setPct] = useState(0)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const maxReachedRef = useRef(0)
  // Mirror pct in a ref so the done-effect can read the current value
  // without adding pct to its deps (which would re-run on every frame).
  const pctRef = useRef(0)

  const [jitter] = useState(() => {
    const r = () => Math.random() - 0.5
    return {
      k1: 2.55 * (1 + r() * 0.2),
      k2: 0.45 * (1 + r() * 0.5),
      fuzz: 1 + r() * 0.16,
    }
  })

  // Sync pct → pctRef every render so done-effect always sees latest value.
  useEffect(() => {
    pctRef.current = pct
  })

  // Asymptotic rAF curve — runs until done flips true.
  useEffect(() => {
    maxReachedRef.current = 0
    setPct(0)
    pctRef.current = 0
    startRef.current = performance.now()
    const effectiveDuration = Math.max(2000, 20000 * jitter.fuzz)

    const tick = (now) => {
      const t = (now - startRef.current) / effectiveDuration
      let curve
      if (t <= 1) {
        curve = ((1 - Math.exp(-jitter.k1 * t)) / (1 - Math.exp(-jitter.k1))) * 0.92
      } else {
        curve = 0.92 + 0.07 * (1 - Math.exp(-jitter.k2 * Math.min(1, (t - 1) / 3)))
      }
      const next = Math.max(maxReachedRef.current, curve)
      maxReachedRef.current = next
      setPct(Math.round(next * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [jitter])

  // When the parent signals completion, cancel the curve and easeOut
  // from wherever we are to 100 % over 280 ms, then call onComplete.
  useEffect(() => {
    if (!done) return
    cancelAnimationFrame(rafRef.current)
    const startPct = pctRef.current
    if (startPct >= 100) {
      onComplete?.()
      return
    }
    const startTime = performance.now()
    const duration = 280
    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      const next = Math.round(startPct + (100 - startPct) * eased)
      setPct(next)
      pctRef.current = next
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [done, onComplete])

  return (
    <div
      className="pm-gen-loader"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-busy={!done}
      aria-label="Creating persona"
    >
      <div className="pm-gen-loader__bar" style={{ width: `${pct}%` }}>
        <span className="pm-gen-loader__sheen" aria-hidden="true" />
      </div>
      <div className="pm-gen-loader__pct">
        {pct}
        <span className="pm-gen-loader__pct-sign">%</span>
      </div>
    </div>
  )
})

function SlotImage({ file, alt }) {
  const url = useObjectURL(file)
  return <img src={url} alt={alt} />
}

// Labels for the (up to 3) uploaded photos, in order. Only the first
// is required / used by the generator; the rest are optional context.
const PHOTO_LABELS = ['Front', 'Left', 'Right']

// Persona names are short labels (a nickname for the face) — the cap
// covers everything reasonable while keeping the card grid tidy. The
// counter under the input warns the user as they approach it. Shared
// with CreatePersonaDialog via lib/constants so the two flows can't drift.
const PERSONA_NAME_MAX = PERSONA_NAME_MAX_LENGTH

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

/* ── Single face-photo uploader ───────────────────────────────────── */

/**
 * One drop/click area for the persona's face photos. The user uploads
 * 1–3 images in a single action; the first is the face that's used,
 * any extra are optional left/right context. Replaces the old three
 * separate Front/Left/Right slots — clearer and one upload.
 */
function PhotoUpload({ photos, onAdd, onRemove, inputRef }) {
  const [dragOver, setDragOver] = useState(false)

  const accept = (fileList) => onAdd(fileList)

  return (
    <div
      className={`pm-upload-wrap${dragOver ? ' pm-slot-wrap--dragover' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.currentTarget.contains(e.relatedTarget)) return
        setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        accept(e.dataTransfer?.files)
      }}
    >
      <span className="pm-slot-label">Your face</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="pm-slot-input"
        onChange={(e) => {
          accept(e.target.files)
          e.target.value = ''
        }}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          className="pm-slot pm-slot--empty pm-upload-drop"
          onClick={() => inputRef.current?.click()}
        >
          <span className="pm-slot-empty-icon" aria-hidden>
            <IconPlus size={22} />
          </span>
          <span className="pm-upload-title">
            {dragOver ? 'Drop your photo here' : 'Drop or click to upload your face'}
          </span>
          <span className="pm-upload-hint">
            A clear, front-facing photo works best. You can add up to 3 (front, left, right) — only
            the front is required.
          </span>
        </button>
      ) : (
        <>
          <div className="pm-slots-grid">
            {photos.map((file, i) => (
              <div className="pm-slot-wrap" key={i}>
                <span className="pm-slot-label">{PHOTO_LABELS[i] || `Photo ${i + 1}`}</span>
                <div className="pm-slot pm-slot--filled">
                  <SlotImage file={file} alt={PHOTO_LABELS[i] || `Photo ${i + 1}`} />
                  <button
                    type="button"
                    className="pm-slot-clear"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(i)
                    }}
                    aria-label="Remove photo"
                  >
                    <IconX size={12} />
                  </button>
                </div>
              </div>
            ))}
            {photos.length < 3 && (
              <div className="pm-slot-wrap">
                <span className="pm-slot-label">Add</span>
                <button
                  type="button"
                  className="pm-slot pm-slot--empty"
                  onClick={() => inputRef.current?.click()}
                >
                  <span className="pm-slot-empty-icon" aria-hidden>
                    <IconPlus size={20} />
                  </span>
                  <span className="pm-slot-empty-hint">Add more</span>
                </button>
              </div>
            )}
          </div>
          <span className="pm-upload-hint">
            The first photo is used as your face · {photos.length}/3 added
          </span>
        </>
      )}
    </div>
  )
}

/* ── Buttons ──────────────────────────────────────────────────────── */

/** Lightning bolt for the credit chip — same glyph the send pill
 * uses inside the thumbnail composer. */
function IconZapFilled({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
    </svg>
  )
}

/** Primary pill — exact recipe of the sidebar's New-chat pill: accent
 * gradient body, no border, inset top glaze, diagonal shine sweep on
 * hover, brightness lift, scale on press.
 *
 * Optional `featureKey` mounts a credit chip on the LEFT (⚡ N |
 * label) — same layout as the send pill in the thumbnail composer. */
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
  featureKey,
  count = 1,
}) {
  // useCostOf is always called (even with a no-op key) to satisfy
  // rules-of-hooks — `total` only renders when featureKey is set.
  const { total } = useCostOf(featureKey || 'noop', count)
  const renderCost = !!featureKey && total > 0 && !busy

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
      {renderCost && (
        <span className="pm-pp-cost" aria-hidden>
          <span className="pm-pp-cost-zap">
            <IconZapFilled size={12} />
          </span>
          <span className="pm-pp-cost-num">{total}</span>
        </span>
      )}
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [genDone, setGenDone] = useState(false)
  // One upload area, up to 3 face photos. Index 0 is the face that's
  // actually used; extra photos are optional context. Mapped to the
  // API's front/left/right slots at submit (missing ones reuse the
  // front so the unchanged backend contract still validates).
  const [createPhotos, setCreatePhotos] = useState([])
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  // Delete dialogs — single persona vs bulk-remove. `personaToDelete`
  // holds the persona pending confirmation; `confirmDeleteAll` is just
  // a boolean since the bulk action operates on every visible persona.
  const [personaToDelete, setPersonaToDelete] = useState(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const uploadInputRef = useRef(null)

  const requestClose = () => onClose?.()

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])
  // Admin-curated demo characters first (shown with a "Demo" badge),
  // then the user's own personals. Demo rows are read-only from the
  // user app — rename / delete / favourite are hidden on them.
  const stockItems = items.filter((p) => p.visibility === 'admin' || p.visibility === 'stock')
  const personalItems = items.filter((p) => p.visibility === 'personal')
  const filteredItems = [...stockItems, ...personalItems]

  const addPhotos = useCallback((files) => {
    const imgs = Array.from(files || []).filter((f) => f?.type?.startsWith('image/'))
    if (!imgs.length) return
    setCreatePhotos((prev) => [...prev, ...imgs].slice(0, 3))
    setCreateError('')
  }, [])

  const removePhoto = useCallback((idx) => {
    setCreatePhotos((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const clearCreateForm = useCallback(() => {
    setCreatePhotos([])
    setCreateName('')
    setCreateError('')
    setShowCreate(false)
    setIsGenerating(false)
    setGenDone(false)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createPhotos.length) {
      setCreateError('Add at least one photo of your face.')
      return
    }
    const name = createName.trim() || 'My Persona'
    setCreateError('')
    setIsGenerating(true)
    setGenDone(false)
    try {
      // The generator uses the first (front) photo; left/right are
      // optional. Fill any missing slot with the front so the
      // unchanged 3-file backend contract still validates.
      const front = createPhotos[0]
      const persona = await createMutation.mutateAsync({
        frontImage: front,
        leftImage: createPhotos[1] || front,
        rightImage: createPhotos[2] || front,
        name,
      })
      if (persona) setSelectedPersona(persona)
      // Signal the loader to snap to 100 % — clearCreateForm is called
      // by the loader's onComplete callback after the animation finishes.
      setGenDone(true)
    } catch (err) {
      // Surface the actual backend code + status alongside the
      // friendly message so users (and us in support) can tell the
      // difference between a 403 PLAN_UPGRADE_REQUIRED, a 402
      // INSUFFICIENT_CREDITS, a 500 provider failure, and a network
      // outage. Console-log the raw error too so it's copy-pastable
      // out of devtools for debugging.
      setIsGenerating(false)
      setGenDone(false)
      const friendly = friendlyMessage(err)
      setCreateError(friendly || err?.message || 'Could not create persona.')
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
    } catch (err) {
      // Stay in edit mode so the user keeps their typed name, but tell
      // them the rename didn't take instead of failing silently.
      toast.error(friendlyMessage(err) || 'Could not rename persona. Please try again.', {
        title: 'Rename failed',
        code: err?.code,
      })
    }
  }

  // Single-persona delete is staged through `personaToDelete` so the
  // ConfirmDialog handles the user-facing confirmation, replacing the
  // browser-default `window.confirm`.
  const requestDelete = (persona) => {
    if (persona.visibility !== 'personal') return
    setPersonaToDelete(persona)
  }

  const confirmSingleDelete = async () => {
    const p = personaToDelete
    if (!p) return
    setPersonaToDelete(null)
    try {
      await deleteMutation.mutateAsync(p.id)
      if (selectedPersonaId === p.id) setSelectedPersona(null)
    } catch (_) {
      /* swallow */
    }
  }

  const handleDeleteAll = async () => {
    if (!personalItems.length) return
    setConfirmDeleteAll(false)
    setBulkDeleting(true)
    try {
      // Only personal characters are deletable from the user app —
      // demo (admin) rows stay regardless.
      for (const p of personalItems) {
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

  const createDisabled = createMutation.isPending || !createPhotos.length

  // The empty placeholder + grid only render when the create form is
  // closed. While the form is open, the dialog is dedicated to that
  // single task — no existing personas underneath.
  const isEmpty = !isPending && filteredItems.length === 0 && !showCreate
  const showGrid = !isPending && filteredItems.length > 0 && !showCreate

  // Lazy render: keep `visibleCount` cards in the DOM and grow on
  // scroll-to-end via IntersectionObserver. Persona cards carry a
  // base64 face image (heavy to decode), so even mid-sized libraries
  // benefit from this.
  const PAGE_SIZE = 24
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  )
  const sentinelRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filteredItems.length])

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
    <Dialog
      open
      onClose={requestClose}
      size="lg"
      ariaLabelledBy="personas-modal-title"
      className="pm-modal-card"
    >
      <div className="pm-body">
        {/* Header ── */}
        <div className="pm-header">
          <div className="pm-header-titles">
            <h2 id="personas-modal-title" className="pm-title">
              Your personas
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

        {/* Scroll body — owns the dialog's only scroll surface so the
         * scrollbar lives inside the rounded panel frame, not on the
         * outer chrome. Top + bottom shadow gradients on the parent
         * `.pm-body` overlay this region for a smooth fade. */}
        <div className="pm-scroll" ref={scrollRef}>
          {/* Create CTA + bulk remove */}
          {!showCreate && (
            <div className="pm-actions-row">
              <PrimaryButton onClick={() => setShowCreate(true)} icon={<IconUser size={14} />}>
                Create persona
              </PrimaryButton>
              {showGrid && (
                <button
                  type="button"
                  className="pm-manage-btn"
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={bulkDeleting || deleteMutation.isPending}
                  title="Delete every persona you've created"
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

          {/* Inline create form. The form contents stay rendered while
           * the mutation is in flight so the card retains its natural
           * size; a full-card `<GenerationProgress />` (slot mode) sits
           * on top — same component the thumbnail screen uses — with
           * the accent gradient growing left-to-right and a real
           * tabular percentage centred over the fill. */}
          {showCreate &&
            (isGenerating ? (
              <PersonaGenLoader done={genDone} onComplete={clearCreateForm} />
            ) : (
              <form onSubmit={handleCreate} className="pm-create-form" aria-busy={undefined}>
                <fieldset className="pm-create-fieldset">
                  <PhotoUpload
                    photos={createPhotos}
                    onAdd={addPhotos}
                    onRemove={removePhoto}
                    inputRef={uploadInputRef}
                  />

                  <div className="pm-name-field">
                    <input
                      type="text"
                      className="pm-input pm-name-input"
                      placeholder="Name this persona"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value.slice(0, PERSONA_NAME_MAX))}
                      maxLength={PERSONA_NAME_MAX}
                      required
                    />
                    <span
                      className={`pm-name-counter${createName.length >= PERSONA_NAME_MAX - 5 ? ' pm-name-counter--warn' : ''}`}
                      aria-live="polite"
                    >
                      {createName.length} / {PERSONA_NAME_MAX}
                    </span>
                  </div>

                  {createError && <p className="pm-error-text">{createError}</p>}

                  <div className="pm-form-actions">
                    <button type="button" className="pm-btn-ghost" onClick={clearCreateForm}>
                      Cancel
                    </button>
                    <PrimaryButton
                      type="submit"
                      disabled={createDisabled}
                      featureKey="persona_generate"
                    >
                      Create
                    </PrimaryButton>
                  </div>
                </fieldset>
              </form>
            ))}

          {/* Empty state */}
          {isEmpty && (
            <div className="pm-empty">
              <div className="pm-empty-icon" aria-hidden>
                <IconUser size={32} />
              </div>
              <h3 className="pm-empty-title">No personas yet</h3>
              <p className="pm-empty-body">Upload 3 photos — front, left, right.</p>
            </div>
          )}

          {/* Persona grid — only rendered when the create form is
           * closed. Renders the lazy `visibleItems` slice and grows on
           * scroll via the `.pm-scroll-sentinel` IntersectionObserver
           * below. */}
          {showGrid && (
            <div className="pm-grid">
              {visibleItems.map((p, idx) => {
                const isSelected = p.id === selectedPersonaId
                const isStock = p.visibility === 'admin' || p.visibility === 'stock'
                const isPinned = pinnedIds.has(p.id)
                const isEditing = editingId === p.id && !isStock
                return (
                  <div
                    key={p.id}
                    className={`pm-card${isSelected ? ' pm-card--selected' : ''}${isStock ? ' pm-card--stock' : ''}${isEditing ? ' pm-card--editing' : ''}`}
                    style={{ animationDelay: `${Math.min(idx * 28, 280)}ms` }}
                  >
                    {/* Image + overlays — kept rendered during edit so
                     * the card's silhouette doesn't collapse. The
                     * pick / fav / actions controls hide while
                     * editing so taps on the image don't fight with
                     * the rename form. Stock (demo) personas hide
                     * favourite + rename/delete entirely — they're
                     * read-only from the user app. */}
                    <div className="pm-card-image">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy" />
                      ) : (
                        <div className="pm-card-image-placeholder" aria-hidden>
                          <IconUser size={24} />
                        </div>
                      )}
                      {!isEditing && isSelected ? (
                        <span className="pm-card-badge" aria-hidden>
                          Active
                        </span>
                      ) : !isEditing && isStock ? (
                        <span className="pm-card-badge pm-card-badge--demo" aria-hidden>
                          Demo
                        </span>
                      ) : null}

                      {!isEditing && (
                        <button
                          type="button"
                          className="pm-card-pick"
                          onClick={() => {
                            setSelectedPersona(p)
                            requestClose()
                          }}
                          aria-label={`Use ${p.name}`}
                        />
                      )}

                      {/* Favourite + rename/delete are personal-only —
                       * demo characters are admin-curated and stay
                       * read-only from the user app. */}
                      {!isEditing && !isStock && (
                        <>
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
                              onClick={() => requestDelete(p)}
                              aria-label={`Delete ${p.name}`}
                              title="Delete"
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {isEditing ? (
                      <form onSubmit={handleUpdate} className="pm-card-rename">
                        <input
                          type="text"
                          className="pm-rename-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value.slice(0, PERSONA_NAME_MAX))}
                          maxLength={PERSONA_NAME_MAX}
                          required
                          autoFocus
                          aria-label="New name"
                        />
                        <button
                          type="button"
                          className="pm-rename-btn pm-rename-btn--cancel"
                          onClick={() => setEditingId(null)}
                          disabled={updateMutation.isPending}
                          aria-label="Cancel rename"
                          title="Cancel"
                        >
                          <IconX size={11} />
                        </button>
                        <button
                          type="submit"
                          className="pm-rename-btn pm-rename-btn--save"
                          disabled={updateMutation.isPending || !editName.trim()}
                          aria-label="Save name"
                          title="Save"
                        >
                          <IconCheck />
                        </button>
                      </form>
                    ) : (
                      <h4 className="pm-card-name">{p.name}</h4>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Sentinel for IntersectionObserver — when this enters the
           * viewport of `.pm-scroll`, we grow `visibleCount` by one
           * page. */}
          {showGrid && visibleCount < filteredItems.length && (
            <div ref={sentinelRef} className="pm-scroll-sentinel" aria-hidden />
          )}
        </div>
      </div>

      {/* Single-persona delete confirm. The dialog is rendered as a
       * sibling of the primary modal; both are portalled so the chrome
       * never overlaps. */}
      <ConfirmDialog
        open={!!personaToDelete}
        title={`Delete "${personaToDelete?.name || ''}"?`}
        description="This permanently removes the persona. Any thumbnail prompts referencing it will fall back to the front image."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmSingleDelete}
        onCancel={() => setPersonaToDelete(null)}
      />

      {/* Bulk-remove confirm — wipes everything visible in the grid. */}
      <ConfirmDialog
        open={confirmDeleteAll}
        title={`Delete all ${personalItems.length} persona${personalItems.length === 1 ? '' : 's'}?`}
        description="This permanently removes every persona you've created. Demo personas stay. Cannot be undone."
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </Dialog>
  )
}
