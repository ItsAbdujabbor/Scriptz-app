/**
 * CreatePersonaDialog — 3-image persona flow rendered inside the shared
 * <Dialog> primitive so it inherits the same portal, backdrop, entrance
 * motion, and close-X as every other modal in the app. Triggered by
 * `openCreatePersonaDialog()` from any button.
 */
import { useEffect, useRef, useState } from 'react'
import { useCreatePersonaFromImagesMutation } from '../queries/personas/personaQueries'
import { onOpenCreatePersonaDialog } from '../lib/personaModalBus'
import { Dialog } from './ui/Dialog'
import { InlineSpinner } from './ui'

const SLOTS = [
  { key: 'front', label: 'Front' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
]

export function CreatePersonaDialog() {
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState({ front: null, left: null, right: null })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const fileRefs = useRef({ front: null, left: null, right: null })
  const mutation = useCreatePersonaFromImagesMutation()

  const close = () => {
    setOpen(false)
    setImages({ front: null, left: null, right: null })
    setName('')
    setError('')
  }

  // Subscribe to the global open-event.
  useEffect(() => {
    return onOpenCreatePersonaDialog(() => setOpen(true))
  }, [])

  function pickFile(slot, file) {
    if (!file?.type?.startsWith('image/')) return
    setImages((p) => ({ ...p, [slot]: file }))
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    if (!images.front || !images.left || !images.right) {
      setError('All 3 photos are required.')
      return
    }
    setError('')
    try {
      await mutation.mutateAsync({
        frontImage: images.front,
        leftImage: images.left,
        rightImage: images.right,
        name: (name || 'My Character').trim() || 'My Character',
      })
      close()
    } catch (err) {
      setError(err?.message || 'Could not create character.')
    }
  }

  return (
    <Dialog open={open} onClose={close} size="md" ariaLabel="Create character">
      <form
        onSubmit={submit}
        style={{
          padding: 24,
          color: '#fff',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 8,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>
              Create character
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              border: 'none',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Image slots */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}
        >
          {SLOTS.map(({ key, label }) => {
            const file = images[key]
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.62)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textAlign: 'center',
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
                      borderRadius: 12,
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
                      onClick={() => {
                        setImages((p) => ({ ...p, [key]: null }))
                        if (fileRefs.current[key]) fileRefs.current[key].value = ''
                      }}
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 10px',
                        border: 'none',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.7)',
                        color: '#fff',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRefs.current[key]?.click()}
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.18)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(167,139,250,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
                    }}
                  >
                    Click to upload
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Name */}
        <input
          type="text"
          placeholder="Character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          style={{
            display: 'block',
            width: '100%',
            marginTop: 16,
            padding: '11px 16px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            fontSize: 14,
            fontFamily: 'inherit',
            textAlign: 'center',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <p style={{ marginTop: 10, marginBottom: 0, color: '#fca5a5', fontSize: 13 }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={close}
            disabled={mutation.isPending}
            style={{
              padding: '7px 16px',
              height: 32,
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              opacity: mutation.isPending ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !images.front || !images.left || !images.right}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              height: 32,
              border: 'none',
              borderRadius: 999,
              background: 'var(--accent-gradient)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px rgba(124,58,237,0.32)',
              opacity:
                mutation.isPending || !images.front || !images.left || !images.right ? 0.55 : 1,
            }}
          >
            {mutation.isPending ? (
              <span className="sk-btn-pending">
                <InlineSpinner size={12} />
                Creating…
              </span>
            ) : (
              'Create'
            )}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 7px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.28)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <svg viewBox="0 0 24 24" width={10} height={10} fill="currentColor" aria-hidden>
                <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
              </svg>
              45
            </span>
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export default CreatePersonaDialog
