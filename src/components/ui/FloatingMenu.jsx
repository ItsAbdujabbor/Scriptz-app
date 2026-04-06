import { forwardRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal-based floating menu with backdrop-blur glass effect.
 * Closes on outside click and Escape key.
 */
const FloatingMenu = forwardRef(function FloatingMenu(
  { open, style, className = '', triggerRef, onClose, children, ...rest },
  ref
) {
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref?.current?.contains(e.target) || triggerRef?.current?.contains(e.target)) return
      onClose?.()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, ref, triggerRef])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div ref={ref} className={`floating-menu ${className}`} role="menu" style={style} {...rest}>
      {children}
    </div>,
    document.body
  )
})

export default FloatingMenu
