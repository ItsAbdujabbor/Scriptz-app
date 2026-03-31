import { useState, useRef, useEffect } from 'react'
import { useStylesQuery } from '../queries/styles/styleQueries'
import { useStyleStore } from '../stores/styleStore'
import './StyleSelector.css'

function IconStyle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function StyleSelector({ onOpenLibrary, compact, variant = 'default' }) {
  const { data, isPending } = useStylesQuery()
  const { selectedStyleId, selectedStyle, setSelectedStyle, clearSelectedStyle } = useStyleStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const items = data?.items ?? []

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  const handleSelect = (s) => {
    setSelectedStyle(s)
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    clearSelectedStyle()
    setOpen(false)
  }

  const isGlassCircle = variant === 'glassCircle'

  return (
    <div
      ref={ref}
      className={`style-selector ${compact ? 'style-selector--compact' : ''} ${isGlassCircle ? 'style-selector--glass-circle' : ''}`}
    >
      <button
        type="button"
        className={`style-selector-trigger ${isGlassCircle ? 'style-selector-trigger--circle' : ''}`}
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

      {open && (
        <div className={`style-selector-dropdown ${isGlassCircle ? 'style-selector-dropdown--glass' : ''}`} role="listbox">
          {isPending && <div className="style-selector-loading">Loading…</div>}
          {!isPending && items.length === 0 && (
            <div className="style-selector-empty">
              <p>No styles yet.</p>
              {onOpenLibrary && (
                <button type="button" className="style-selector-create" onClick={() => { setOpen(false); onOpenLibrary() }}>
                  Create your first style
                </button>
              )}
            </div>
          )}
          {!isPending && items.length > 0 && (
            <>
              {selectedStyleId && (
                <button
                  type="button"
                  className="style-selector-option style-selector-option--clear"
                  onClick={handleClear}
                  role="option"
                >
                  Clear selection
                </button>
              )}
              {items.map((s) => (
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
                      <img src={s.image_url} alt="" />
                    </span>
                  )}
                  <span className="style-selector-option-name">{s.name}</span>
                  {s.visibility !== 'personal' && (
                    <span className="style-selector-badge">{s.visibility}</span>
                  )}
                </button>
              ))}
              {onOpenLibrary && (
                <button
                  type="button"
                  className="style-selector-option style-selector-option--manage"
                  onClick={() => { setOpen(false); onOpenLibrary() }}
                  role="option"
                >
                  Manage styles
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
