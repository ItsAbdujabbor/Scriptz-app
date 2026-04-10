import { useRef, useState, useEffect, useCallback } from 'react'
import FloatingMenu from './FloatingMenu'

/**
 * Custom dropdown — pill-shaped trigger + FloatingMenu (glass backdrop + portal).
 *
 * Props:
 *   options: Array<{ value: string; label: string; icon?: React.ReactNode; hint?: string }>
 *   value: string (currently selected value)
 *   onChange: (value) => void
 *   label: string (shown before the value in trigger, e.g. "Tone")
 *   placeholder: string (fallback when value not found)
 *   className: string (optional extra class on trigger)
 *   disabled: boolean
 *   align: 'start' | 'end' (menu alignment relative to trigger — default 'start')
 *   size: 'sm' | 'md' (default 'md')
 *
 * Keyboard:
 *   Enter/Space on trigger → open
 *   Escape → close
 *   ArrowUp/ArrowDown → navigate options (roving focus)
 *   Enter on option → select and close
 */
export function Dropdown({
  options = [],
  value,
  onChange,
  label,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  align = 'start',
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const [focusIndex, setFocusIndex] = useState(-1)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const selected = options.find((o) => o.value === value)
  const selectedLabel = selected?.label || placeholder

  const positionMenu = useCallback(() => {
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const menuWidth = Math.max(rect.width, 180)
    const gap = 6

    // Prefer above (dropdown opens upward like Coach composer pills)
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceAbove > 220 || spaceAbove > spaceBelow

    const style = {
      minWidth: `${menuWidth}px`,
    }
    if (openUp) {
      style.bottom = `${window.innerHeight - rect.top + gap}px`
    } else {
      style.top = `${rect.bottom + gap}px`
    }
    if (align === 'end') {
      style.right = `${window.innerWidth - rect.right}px`
    } else {
      style.left = `${rect.left}px`
    }
    setMenuStyle(style)
  }, [align])

  useEffect(() => {
    if (!open) return
    positionMenu()
    const handleResize = () => positionMenu()
    const handleScroll = () => positionMenu()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, positionMenu])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setFocusIndex(idx >= 0 ? idx : 0)
    } else {
      setFocusIndex(-1)
    }
  }, [open, options, value])

  const handleTriggerKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    }
  }

  const handleMenuKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((i) => (i + 1) % options.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((i) => (i - 1 + options.length) % options.length)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[focusIndex]
      if (opt) {
        onChange?.(opt.value)
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  const handleSelect = (optValue) => {
    onChange?.(optValue)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ui-dropdown-trigger ui-dropdown-trigger--${size} ${open ? 'is-open' : ''} ${className}`.trim()}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label ? <span className="ui-dropdown-trigger-label">{label}</span> : null}
        <span className="ui-dropdown-trigger-value">{selectedLabel}</span>
        <svg
          className="ui-dropdown-trigger-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <FloatingMenu
        ref={menuRef}
        triggerRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        className="ui-dropdown-menu"
        style={menuStyle || undefined}
        onKeyDown={handleMenuKeyDown}
        role="listbox"
      >
        {options.map((opt, i) => {
          const isSelected = opt.value === value
          const isFocused = i === focusIndex
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`ui-dropdown-option ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`}
              onClick={() => handleSelect(opt.value)}
              onMouseEnter={() => setFocusIndex(i)}
            >
              {opt.icon ? <span className="ui-dropdown-option-icon">{opt.icon}</span> : null}
              <span className="ui-dropdown-option-text">
                <span className="ui-dropdown-option-label">{opt.label}</span>
                {opt.hint ? <span className="ui-dropdown-option-hint">{opt.hint}</span> : null}
              </span>
              {isSelected ? (
                <svg
                  className="ui-dropdown-option-check"
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
              ) : null}
            </button>
          )
        })}
      </FloatingMenu>
    </>
  )
}

export default Dropdown
