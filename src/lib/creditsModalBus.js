/**
 * Tiny event bus to open the credit-packs modal from anywhere in the app.
 *
 * Why an event bus and not a store?
 *   The zustand-store approach is reactive (subscribers re-render on change)
 *   but depends on correct selector equality + React reconciliation. We hit a
 *   situation where the store updated but the subscribed `AppShellLayout`
 *   didn't re-render (likely HMR-stale closure). A window custom event is a
 *   browser primitive — fires synchronously, zero React assumptions.
 *
 * Usage:
 *   // Trigger from anywhere (no React needed):
 *   import { openCreditsModal } from '@/lib/creditsModalBus'
 *   <button onClick={openCreditsModal}>Buy credits</button>
 *
 *   // Listen (inside a component):
 *   useEffect(() => onOpenCreditsModal(() => setOpen(true)), [])
 */

const EVENT = 'app:open-credits-modal'

export function openCreditsModal() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Subscribe to open requests. Returns an unsubscribe function — perfect for
 * `useEffect`'s cleanup return value.
 *
 *   useEffect(() => onOpenCreditsModal(handle), [handle])
 */
export function onOpenCreditsModal(fn) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
