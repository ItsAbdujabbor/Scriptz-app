/**
 * Dialog — single source of truth for centered modal dialogs across the app.
 *
 * Handles the chrome that every modal needs: portal to <body>, frosted
 * backdrop, click-outside-to-close, Escape-to-close, body scroll lock,
 * ARIA roles, and the unified iOS-style pop-in animation.
 *
 * Each consumer dialog (PersonasModal, ConfirmDialog, EditThumbnailDialog,
 * etc.) just passes its own content as children — no boilerplate per dialog.
 *
 * Usage:
 *   <Dialog open={open} onClose={close} size="md" ariaLabelledBy="my-title">
 *     <h2 id="my-title">…</h2>
 *     <p>…</p>
 *   </Dialog>
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './Dialog.css'

export function Dialog({
  open,
  onClose,
  children,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen'
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockScroll = true,
  ariaLabel,
  ariaLabelledBy,
  className = '',
  overlayClassName = '',
}) {
  // Escape closes the dialog.
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, onClose])

  // Lock body scroll while open. Reverts to whatever was there before — so
  // if multiple dialogs ever stack, each one's cleanup restores the prior
  // value rather than blindly clearing it.
  useEffect(() => {
    if (!open || !lockScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, lockScroll])

  if (!open) return null

  const handleOverlayClick = closeOnBackdrop ? () => onClose?.() : undefined

  return createPortal(
    <div
      className={['ui-dialog-overlay', overlayClassName].filter(Boolean).join(' ')}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className={['ui-dialog-panel', `ui-dialog-panel--${size}`, className]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export default Dialog
