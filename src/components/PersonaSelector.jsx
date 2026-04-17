import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePersonasQuery } from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import './PersonaSelector.css'

function IconLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function IconPersona() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a9 9 0 0 0 9 9c0-5-4-9-9-9z" />
      <path d="M12 12a9 9 0 0 0 9 9" />
      <path d="M12 12a9 9 0 0 1-9 9" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function PersonaSelector({ onOpenLibrary, compact, variant = 'default' }) {
  const { data, isPending } = usePersonasQuery()
  const { selectedPersonaId, selectedPersona, setSelectedPersona, clearSelectedPersona } =
    usePersonaStore()
  const { canUse } = usePlanEntitlements()
  const locked = !canUse('personas')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const { popoverRef, style: popoverStyle } = useFloatingPosition({
    triggerRef,
    open,
    placement: 'top-start',
    offset: 8,
  })

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Popover is portaled to body, so the trigger wrapper `ref` doesn't
      // contain it. Check both the trigger AND the popover before closing.
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open, popoverRef])

  const handleSelect = (p) => {
    setSelectedPersona(p)
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    clearSelectedPersona()
    setOpen(false)
  }

  const isGlassCircle = variant === 'glassCircle'

  // Locked tier: redirect to pricing instead of opening the dropdown.
  if (locked) {
    return (
      <div
        ref={ref}
        className={`persona-selector persona-selector--locked ${compact ? 'persona-selector--compact' : ''} ${isGlassCircle ? 'persona-selector--glass-circle' : ''}`}
      >
        <button
          type="button"
          className={`persona-selector-trigger persona-selector-trigger--locked ${isGlassCircle ? 'persona-selector-trigger--circle' : ''}`}
          onClick={() => {
            window.location.hash = 'pro'
          }}
          aria-label="Personas — upgrade to Creator to unlock"
          title="Personas are a Creator+ feature. Click to upgrade."
        >
          <span className="persona-selector-icon">
            <IconLock />
          </span>
          {!isGlassCircle && (
            <span className="persona-selector-label persona-selector-label--locked">Creator+</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`persona-selector ${compact ? 'persona-selector--compact' : ''} ${isGlassCircle ? 'persona-selector--glass-circle' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`persona-selector-trigger ${isGlassCircle ? 'persona-selector-trigger--circle' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedPersona ? `Persona: ${selectedPersona.name}` : 'Select persona'}
        title={
          selectedPersona ? selectedPersona.name : 'Persona — guides face & voice in thumbnails'
        }
      >
        {selectedPersona?.image_url ? (
          <span className="persona-selector-trigger-img">
            <img src={selectedPersona.image_url} alt="" />
          </span>
        ) : (
          <span className="persona-selector-icon">
            <IconPersona />
          </span>
        )}
        {!isGlassCircle && (
          <>
            <span className="persona-selector-label">
              {selectedPersona ? selectedPersona.name : 'Persona'}
            </span>
            <span className="persona-selector-chevron">
              <IconChevronDown />
            </span>
          </>
        )}
      </button>

      {/* One-click reset. Sits on top of the trigger so the user can clear
       *  the selection without opening the dropdown. Only rendered when a
       *  persona is selected and the lock overlay isn't active. */}
      {selectedPersona && (
        <button
          type="button"
          className={`persona-selector-reset ${isGlassCircle ? 'persona-selector-reset--circle' : ''}`}
          onClick={handleClear}
          aria-label={`Clear persona (${selectedPersona.name})`}
          title="Clear persona"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={`persona-selector-dropdown persona-selector-dropdown--floating ${isGlassCircle ? 'persona-selector-dropdown--glass' : ''}`}
            role="listbox"
            style={popoverStyle}
          >
            {isPending && <div className="persona-selector-loading">Loading…</div>}
            {!isPending && items.length === 0 && (
              <div className="persona-selector-empty">
                <p>No personas yet.</p>
                {onOpenLibrary && (
                  <button
                    type="button"
                    className="persona-selector-create"
                    onClick={() => {
                      setOpen(false)
                      onOpenLibrary()
                    }}
                  >
                    Create your first persona
                  </button>
                )}
              </div>
            )}
            {!isPending && items.length > 0 && (
              <>
                {selectedPersonaId && (
                  <button
                    type="button"
                    className="persona-selector-option persona-selector-option--clear"
                    onClick={handleClear}
                    role="option"
                  >
                    Clear selection
                  </button>
                )}
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`persona-selector-option ${p.id === selectedPersonaId ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(p)}
                    role="option"
                    aria-selected={p.id === selectedPersonaId}
                  >
                    {p.image_url && (
                      <span className="persona-selector-option-img">
                        <img src={p.image_url} alt="" />
                      </span>
                    )}
                    <span className="persona-selector-option-name">{p.name}</span>
                    {pinnedIds.has(p.id) && <span className="persona-selector-pin">★</span>}
                    {p.visibility === 'stock' && (
                      <span className="persona-selector-badge">Stock</span>
                    )}
                    {p.visibility === 'admin' && (
                      <span className="persona-selector-badge">Official</span>
                    )}
                  </button>
                ))}
                {onOpenLibrary && (
                  <button
                    type="button"
                    className="persona-selector-option persona-selector-option--manage"
                    onClick={() => {
                      setOpen(false)
                      onOpenLibrary()
                    }}
                  >
                    Manage personas…
                  </button>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
