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
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Dialog.css'

/**
 * Collect tab-reachable elements inside `container`, skipping anything
 * inside a hidden / aria-hidden subtree (those aren't focusable in
 * practice and would create dead stops in the trap).
 */
function getFocusableElements(container) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]'))
}

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
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)

  // Focus trap: keep keyboard focus inside the dialog while it's open,
  // move focus in on open, and restore it to the triggering element on
  // close. Works for every consumer (PersonasModal, StylesModal,
  // SettingsModal, ConfirmDialog, BillingDialog, CreditPacksModal) since
  // they all render their content as children of the panel.
  useEffect(() => {
    if (!open) return

    // Remember whatever had focus so we can restore it on close.
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Move focus into the dialog (first focusable, else the panel itself
    // so screen-reader / keyboard users aren't left on the page behind).
    const focusable = getFocusableElements(dialogRef.current)
    if (focusable.length) {
      focusable[0].focus()
    } else {
      dialogRef.current?.focus()
    }

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return
      const els = getFocusableElements(dialogRef.current)
      if (!els.length) {
        // Nothing focusable — keep focus pinned on the panel.
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialogRef.current?.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to whatever opened the dialog.
      triggerRef.current?.focus?.()
    }
  }, [open])

  // Escape closes the dialog. Guard with dialogRef.current so the listener
  // can't fire onClose during the brief window between React rendering null
  // (open=false) and the useEffect cleanup removing this listener.
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e) => {
      if (e.key === 'Escape' && dialogRef.current) onClose?.()
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
        ref={dialogRef}
        tabIndex={-1}
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
