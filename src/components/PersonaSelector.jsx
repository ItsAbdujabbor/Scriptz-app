import { useState, useRef, useEffect } from 'react'
import { usePersonasQuery } from '../queries/personas/personaQueries'
import { usePersonaStore } from '../stores/personaStore'
import './PersonaSelector.css'

function IconPersona() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 0 0 9 9c0-5-4-9-9-9z" />
      <path d="M12 12a9 9 0 0 0 9 9" />
      <path d="M12 12a9 9 0 0 1-9 9" />
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

export function PersonaSelector({ onOpenLibrary, compact }) {
  const { data, isPending } = usePersonasQuery()
  const { selectedPersonaId, selectedPersona, setSelectedPersona, clearSelectedPersona } = usePersonaStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const items = data?.items ?? []
  const pinnedIds = new Set(data?.pinned_ids ?? [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  const handleSelect = (p) => {
    setSelectedPersona(p)
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    clearSelectedPersona()
    setOpen(false)
  }

  return (
    <div ref={ref} className={`persona-selector ${compact ? 'persona-selector--compact' : ''}`}>
      <button
        type="button"
        className="persona-selector-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedPersona ? `Persona: ${selectedPersona.name}` : 'Select persona'}
        title={selectedPersona ? selectedPersona.name : 'Choose a persona to customize AI output'}
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
        <span className="persona-selector-label">
          {selectedPersona ? selectedPersona.name : 'Persona'}
        </span>
        <span className="persona-selector-chevron">
          <IconChevronDown />
        </span>
      </button>

      {open && (
        <div className="persona-selector-dropdown" role="listbox">
          {isPending && <div className="persona-selector-loading">Loading…</div>}
          {!isPending && items.length === 0 && (
            <div className="persona-selector-empty">
              <p>No personas yet.</p>
              {onOpenLibrary && (
                <button type="button" className="persona-selector-create" onClick={() => { setOpen(false); onOpenLibrary() }}>
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
                  {p.visibility === 'stock' && <span className="persona-selector-badge">Stock</span>}
                  {p.visibility === 'admin' && <span className="persona-selector-badge">Admin</span>}
                </button>
              ))}
              {onOpenLibrary && (
                <button
                  type="button"
                  className="persona-selector-option persona-selector-option--manage"
                  onClick={() => { setOpen(false); onOpenLibrary() }}
                >
                  Manage personas…
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
