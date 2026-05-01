import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStylesQuery } from '../queries/styles/styleQueries'
import { useStyleStore } from '../stores/styleStore'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { toast } from '../lib/toast'
import { Skeleton, SkeletonGroup } from './ui'
import './StyleSelector.css'

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

function IconStyle() {
  // Graphic-style glyph from src/assets/graphic-style.svg — picture
  // frame with a sparkle, replacing the previous palette silhouette.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.5,5c.83,0,1.5,.67,1.5,1.5s-.67,1.5-1.5,1.5-1.5-.67-1.5-1.5,.67-1.5,1.5-1.5Zm7.32,3.18l-.35-1.42c-.11-.44-.51-.76-.97-.76s-.86,.31-.97,.76l-.35,1.41-1.4,.32c-.45,.1-.77,.5-.77,.96,0,.46,.3,.86,.74,.98l1.43,.39,.36,1.43c.11,.44,.51,.76,.97,.76s.86-.31,.97-.76l.35-1.42,1.42-.35c.44-.11,.76-.51,.76-.97s-.31-.86-.76-.97l-1.42-.35Zm.79-3.3l1.76,.74,.7,1.75c.15,.38,.52,.63,.93,.63s.78-.25,.93-.63l.7-1.74,1.74-.7c.38-.15,.63-.52,.63-.93s-.25-.78-.63-.93l-1.74-.7-.7-1.74c-.15-.38-.52-.63-.93-.63s-.78,.25-.93,.63l-.69,1.73-1.73,.66c-.38,.14-.64,.51-.65,.92,0,.41,.23,.78,.61,.94Zm7.39,4.12v10c0,2.76-2.24,5-5,5H5c-2.76,0-5-2.24-5-5V5C0,2.24,2.24,0,5,0H15c.55,0,1,.45,1,1s-.45,1-1,1H5c-1.65,0-3,1.35-3,3v6.59l.56-.56c1.34-1.34,3.53-1.34,4.88,0l5.58,5.58c.54,.54,1.43,.54,1.97,0l.58-.58c1.34-1.34,3.53-1.34,4.88,0l1.56,1.56V9c0-.55,.45-1,1-1s1,.45,1,1Zm-2.24,11.17l-2.74-2.74c-.56-.56-1.48-.56-2.05,0l-.58,.58c-1.32,1.32-3.48,1.32-4.8,0l-5.58-5.58c-.56-.56-1.48-.56-2.05,0l-1.98,1.98v4.59c0,1.65,1.35,3,3,3h14c1.24,0,2.3-.75,2.76-1.83Z" />
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

export function StyleSelector({ onOpenLibrary, compact, variant = 'default' }) {
  const { data, isPending } = useStylesQuery()
  const { selectedStyleId, selectedStyle, setSelectedStyle, clearSelectedStyle } = useStyleStore()
  const { canUse } = usePlanEntitlements()
  const locked = !canUse('styles')
  const [open, setOpen] = useState(false)
  // Brief shrink-back animation gate — see PersonaSelector for the same pattern.
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

  useEffect(() => {
    const handleClickOutside = (e) => {
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open, popoverRef])

  const handleSelect = (s) => {
    setSelectedStyle(s)
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    setOpen(false)
    if (variant === 'glassCircle') {
      // Animated exit — keep the pill mounted while the shrink-back
      // keyframe plays, then clear the selection so the trigger
      // collapses back to the unselected circle.
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        clearSelectedStyle()
        setClosing(false)
        closeTimerRef.current = null
      }, 220)
      return
    }
    clearSelectedStyle()
  }

  const isGlassCircle = variant === 'glassCircle'

  // Free tier: render the trigger looking identical to the unlocked
  // version — no violet "locked" tint, no lock badge. Click sends the
  // user to the Pro upgrade screen with a brief toast.
  if (locked) {
    const handleLockedClick = () => {
      toast.info('Styles are a Pro feature. Upgrade to unlock.', {
        title: 'Upgrade required',
      })
      if (typeof window !== 'undefined') window.location.hash = 'pro'
    }
    return (
      <div
        ref={ref}
        className={`style-selector ${compact ? 'style-selector--compact' : ''} ${isGlassCircle ? 'style-selector--glass-circle' : ''}`}
      >
        <button
          type="button"
          className={`style-selector-trigger ${isGlassCircle ? 'style-selector-trigger--circle' : ''}`}
          onClick={handleLockedClick}
          aria-label="Styles"
          title="Style — a reusable visual treatment for your thumbnails"
        >
          <span className="style-selector-icon">
            <IconStyle />
          </span>
          {!isGlassCircle && (
            <>
              <span className="style-selector-label">Style</span>
              <span className="style-selector-chevron">
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
      className={`style-selector ${compact ? 'style-selector--compact' : ''} ${isGlassCircle ? 'style-selector--glass-circle' : ''} ${closing ? 'style-selector--closing' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`style-selector-trigger ${isGlassCircle ? 'style-selector-trigger--circle' : ''} ${
          isGlassCircle && selectedStyle ? 'style-selector-trigger--has-selection' : ''
        }`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedStyle ? `Style: ${selectedStyle.name}` : 'Select style'}
        title={selectedStyle ? selectedStyle.name : 'Visual style — reference look for thumbnails'}
      >
        {selectedStyle?.image_url ? (
          <span className="style-selector-trigger-img">
            <img src={selectedStyle.image_url} alt="" />
          </span>
        ) : (
          <span className="style-selector-icon">
            <IconStyle />
          </span>
        )}
        {/* Name shown in pill mode (glassCircle + selection). Same pattern
         * as PersonaSelector — keeps the toolbar pill aesthetic
         * consistent across attach/persona/style. */}
        {isGlassCircle && selectedStyle && (
          <span className="style-selector-pill-name">{selectedStyle.name}</span>
        )}
        {!isGlassCircle && (
          <>
            <span className="style-selector-label">
              {selectedStyle ? selectedStyle.name : 'Style'}
            </span>
            <span className="style-selector-chevron">
              <IconChevronDown />
            </span>
          </>
        )}
      </button>

      {/* One-click reset — same pattern as PersonaSelector. */}
      {selectedStyle && (
        <button
          type="button"
          className={`style-selector-reset ${isGlassCircle ? 'style-selector-reset--circle' : ''}`}
          onClick={handleClear}
          aria-label={`Clear style (${selectedStyle.name})`}
          title="Clear style"
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
            className={`style-selector-dropdown style-selector-dropdown--floating ${isGlassCircle ? 'style-selector-dropdown--glass' : ''}`}
            role="listbox"
            style={popoverStyle}
          >
            <div className="style-selector-header">Styles</div>

            <div className="style-selector-dropdown-inner">
              {isPending && (
                <SkeletonGroup className="style-selector-loading" label="Loading styles">
                  <Skeleton height={36} radius={999} />
                  <Skeleton height={36} radius={999} />
                  <Skeleton height={36} radius={999} />
                </SkeletonGroup>
              )}
              {!isPending && items.length === 0 && (
                <div className="style-selector-empty">No styles yet</div>
              )}
              {!isPending &&
                items.length > 0 &&
                items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`style-selector-option ${s.id === selectedStyleId ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(s)}
                    role="option"
                    aria-selected={s.id === selectedStyleId}
                  >
                    {s.image_url && (
                      <span className="style-selector-option-img">
                        <img src={s.image_url} alt="" loading="lazy" decoding="async" />
                      </span>
                    )}
                    <span className="style-selector-option-name">{s.name}</span>
                    {s.visibility !== 'personal' && (
                      <span className="style-selector-badge">{s.visibility}</span>
                    )}
                  </button>
                ))}
            </div>

            {!isPending && onOpenLibrary && (
              <div className="style-selector-footer">
                <button
                  type="button"
                  className="style-selector-create"
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
