import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePersonasQuery } from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { toast } from '../lib/toast'
import { Skeleton, SkeletonGroup } from './ui'
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
  // User glyph from src/assets/user.svg — fill-based, replaces the
  // previous stroke-based head + shoulders + sparkle composition.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12,12A6,6,0,1,0,6,6,6.006,6.006,0,0,0,12,12ZM12,2A4,4,0,1,1,8,6,4,4,0,0,1,12,2Z" />
      <path d="M12,14a9.01,9.01,0,0,0-9,9,1,1,0,0,0,2,0,7,7,0,0,1,14,0,1,1,0,0,0,2,0A9.01,9.01,0,0,0,12,14Z" />
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

function IconPlus() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
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
  // Briefly true while the glassCircle pill plays its shrink-back
  // animation after the user hits ×. Keeps the pill mounted long enough
  // for the exit keyframe to finish before clearSelectedPersona() runs
  // and the trigger collapses back to the plain circle button.
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
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
    setOpen(false)
    if (variant === 'glassCircle') {
      // Animated exit: keep the pill rendered for the duration of its
      // shrink-back keyframe, then actually clear the selection so the
      // trigger collapses back to the unselected circle.
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        clearSelectedPersona()
        setClosing(false)
        closeTimerRef.current = null
      }, 220)
      return
    }
    clearSelectedPersona()
  }

  const isGlassCircle = variant === 'glassCircle'

  // Free tier: render the trigger looking identical to the unlocked
  // version — no violet "locked" tint, no lock badge. Click sends the
  // user to the Pro upgrade screen with a brief toast.
  if (locked) {
    const handleLockedClick = () => {
      toast.info('Characters are a Pro feature. Upgrade to unlock.', {
        title: 'Upgrade required',
      })
      if (typeof window !== 'undefined') window.location.hash = 'pro'
    }
    return (
      <div
        ref={ref}
        className={`persona-selector ${compact ? 'persona-selector--compact' : ''} ${isGlassCircle ? 'persona-selector--glass-circle' : ''}`}
      >
        <button
          type="button"
          className={`persona-selector-trigger ${isGlassCircle ? 'persona-selector-trigger--circle' : ''}`}
          onClick={handleLockedClick}
          aria-label="Characters"
          title="Character — a reusable on-brand look for your thumbnails"
        >
          <span className="persona-selector-icon">
            <IconPersona />
          </span>
          {!isGlassCircle && (
            <>
              <span className="persona-selector-label">Character</span>
              <span className="persona-selector-chevron">
                <IconChevronDown />
              </span>
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`persona-selector ${compact ? 'persona-selector--compact' : ''} ${isGlassCircle ? 'persona-selector--glass-circle' : ''} ${closing ? 'persona-selector--closing' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`persona-selector-trigger ${isGlassCircle ? 'persona-selector-trigger--circle' : ''} ${
          isGlassCircle && selectedPersona ? 'persona-selector-trigger--has-selection' : ''
        }`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedPersona ? `Character: ${selectedPersona.name}` : 'Select character'}
        title={
          selectedPersona
            ? selectedPersona.name
            : 'Character — a reusable on-brand look for your thumbnails'
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
        {/* Name shown in pill mode (glassCircle + selection) so the
         * trigger expands into the same shape as `.thumb-attach-pill`.
         * Default + non-selected glassCircle keep their existing layout. */}
        {isGlassCircle && selectedPersona && (
          <span className="persona-selector-pill-name">{selectedPersona.name}</span>
        )}
        {!isGlassCircle && (
          <>
            <span className="persona-selector-label">
              {selectedPersona ? selectedPersona.name : 'Character'}
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
          aria-label={`Clear character (${selectedPersona.name})`}
          title="Clear character"
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
            {/* Header — compact label so the picker has a name. */}
            <div className="persona-selector-header">Characters</div>

            {/* Inner scroll area. Lives in its own element so the
             * outer container can keep `overflow: visible` for the
             * speech-bubble tail without losing the scrollable list. */}
            <div className="persona-selector-dropdown-inner">
              {isPending && (
                <SkeletonGroup className="persona-selector-loading" label="Loading characters">
                  <Skeleton height={36} radius={999} />
                  <Skeleton height={36} radius={999} />
                  <Skeleton height={36} radius={999} />
                </SkeletonGroup>
              )}
              {!isPending && items.length === 0 && (
                <div className="persona-selector-empty">No characters yet</div>
              )}
              {!isPending &&
                items.length > 0 &&
                items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`persona-selector-option ${p.id === selectedPersonaId ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(p)}
                    role="option"
                    aria-selected={p.id === selectedPersonaId}
                  >
                    <span className="persona-selector-option-img">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="persona-selector-option-fallback" aria-hidden>
                          <IconPersona />
                        </span>
                      )}
                    </span>
                    <span className="persona-selector-option-name">{p.name}</span>
                    {pinnedIds.has(p.id) && (
                      <span className="persona-selector-pin" aria-hidden>
                        ★
                      </span>
                    )}
                  </button>
                ))}
            </div>

            {!isPending && onOpenLibrary && (
              <div className="persona-selector-footer">
                <button
                  type="button"
                  className="persona-selector-create"
                  onClick={() => {
                    setOpen(false)
                    onOpenLibrary()
                  }}
                >
                  <IconPlus />
                  Create
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
