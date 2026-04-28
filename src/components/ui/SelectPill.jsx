/**
 * SelectPill — reusable pill-shaped dropdown (trigger + animated menu).
 * Unifies the filter/sort dropdowns used across Optimize and anywhere
 * else we need a compact glass dropdown.
 *
 * Usage:
 *   <SelectPill
 *     value={status}
 *     onChange={setStatus}
 *     options={[{ value: '', label: 'All' }, { value: 'running', label: 'Running' }]}
 *     ariaLabel="Filter by status"
 *   />
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion' // eslint-disable-line no-unused-vars
import './SelectPill.css'

export function SelectPill({
  value,
  onChange,
  options = [],
  ariaLabel,
  placeholder = 'Select…',
  className = '',
  align = 'right', // 'right' | 'left'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value) ?? options[0]

  return (
    <div
      className={`pill-dd ${open ? 'is-open' : ''} pill-dd--align-${align} ${className}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="pill-dd-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="pill-dd-label">{selected?.label || placeholder}</span>
        <svg
          className="pill-dd-chevron"
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
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="pill-dd-menu"
            role="listbox"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {options.map((opt) => (
              <li key={opt.value} role="option" aria-selected={value === opt.value}>
                <button
                  type="button"
                  className={`pill-dd-option ${value === opt.value ? 'is-active' : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && (
                    <svg
                      className="pill-dd-check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SelectPill
