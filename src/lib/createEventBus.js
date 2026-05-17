/**
 * createEventBus — factory for the tiny window-CustomEvent pub/sub buses
 * used to open global modals/dialogs from anywhere without prop chains
 * or a shared store.
 *
 * Why a window event and not a zustand store: a window custom event is
 * a browser primitive — it fires synchronously with zero React
 * assumptions, sidestepping the stale-closure / Suspense / HMR issues
 * that bit earlier store-based attempts (see the original bus comments).
 *
 * The emitter accepts an optional `detail` payload (delivered as
 * `event.detail`); existing call sites that emit with no argument keep
 * working unchanged. `on(handler)` returns an unsubscribe function,
 * perfect as a `useEffect` cleanup.
 *
 * Usage:
 *   const bus = createEventBus('app:open-credits-modal')
 *   export const openCreditsModal = (detail) => bus.emit(detail)
 *   export const onOpenCreditsModal = (handler) => bus.on(handler)
 */
export function createEventBus(eventName) {
  return {
    emit(detail) {
      if (typeof window === 'undefined') return
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
    },
    on(handler) {
      if (typeof window === 'undefined') return () => {}
      window.addEventListener(eventName, handler)
      return () => window.removeEventListener(eventName, handler)
    },
  }
}
