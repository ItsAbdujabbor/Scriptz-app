/**
 * billingDialogBus — tiny pub/sub for the Billing dialog.
 *
 * Mirrors the credits-modal bus so any component anywhere in the app
 * can open the Billing dialog by firing `openBillingDialog()` without
 * needing a prop chain or shared store. The dialog is mounted once at
 * the AuthenticatedRoutes level via `<BillingDialog />` and listens
 * for the open event.
 */

const EVENT = 'app:open-billing-dialog'

export function openBillingDialog() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENT))
}

export function onOpenBillingDialog(handler) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
