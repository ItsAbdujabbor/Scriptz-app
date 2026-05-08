/**
 * BillingDialog — modal wrapper around `<BillingSettingsPanel>`.
 *
 * Always-mounted listener for `app:open-billing-dialog` (fired by the
 * sidebar Billing button, low-balance prompts, etc.). When the event
 * fires we open a fullscreen-feeling Dialog with the same plan +
 * payment + invoices content the legacy `#billing` screen rendered,
 * but as a centred modal that matches the rest of the app's dialog
 * language (Personas / Styles / Edit thumbnail / Credit packs).
 */
import { useEffect, useState } from 'react'

import { Dialog } from './ui'
import { BillingSettingsPanel } from './BillingSettingsPanel'
import { onOpenBillingDialog } from '../lib/billingDialogBus'
import './BillingDialog.css'

function IconClose() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4h16v16l-2-1.5L16 20l-2-1.5L12 20l-2-1.5L8 20l-2-1.5L4 20z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  )
}

function hashIsBilling() {
  if (typeof window === 'undefined') return false
  const h = String(window.location.hash || '').replace(/^#/, '').replace(/^\/+/, '').trim()
  return h === 'billing' || h.startsWith('billing/') || h.startsWith('billing?')
}

export function BillingDialog() {
  const [open, setOpen] = useState(() => hashIsBilling())

  // Bus-driven open (sidebar button, low-balance prompts, etc.).
  useEffect(() => onOpenBillingDialog(() => setOpen(true)), [])

  // Hash-driven open: deep links to `#billing` should still surface the
  // billing UI — but as the centred dialog instead of a full screen.
  useEffect(() => {
    const sync = () => {
      if (hashIsBilling()) setOpen(true)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // When the user closes the dialog while the hash is still `#billing`
  // (deep-link path), strip the hash so re-opening doesn't auto-fire.
  const handleClose = () => {
    setOpen(false)
    if (typeof window !== 'undefined' && hashIsBilling()) {
      window.location.hash = 'thumbnails'
    }
  }

  if (!open) return null

  return (
    <Dialog
      open
      onClose={handleClose}
      size="wide"
      ariaLabelledBy="billing-dialog-title"
      className="billing-dialog"
    >
      <header className="billing-dialog__head">
        <div className="billing-dialog__title-row">
          <span className="billing-dialog__icon" aria-hidden>
            <IconReceipt />
          </span>
          <div>
            <h2 id="billing-dialog-title" className="billing-dialog__title">
              Billing
            </h2>
            <p className="billing-dialog__sub">
              Plan, payment method, and invoice history.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="billing-dialog__close"
          onClick={handleClose}
          aria-label="Close billing"
        >
          <IconClose />
        </button>
      </header>

      <div className="billing-dialog__body">
        <BillingSettingsPanel active={open} onClose={handleClose} />
      </div>
    </Dialog>
  )
}

export default BillingDialog
