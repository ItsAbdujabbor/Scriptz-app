/**
 * Tiny event bus to open the create-persona dialog from anywhere.
 *
 * Same pattern as `creditsModalBus.js` — a window custom event is a browser
 * primitive that fires synchronously with zero React assumptions, so it
 * sidesteps stale closures / Suspense / HMR weirdness that bit a previous
 * "render the dialog inline inside the Personas modal" attempt.
 *
 * Usage:
 *   import { openCreatePersonaDialog } from '@/lib/personaModalBus'
 *   <button onClick={openCreatePersonaDialog}>Create persona</button>
 *
 *   useEffect(() => onOpenCreatePersonaDialog(() => setOpen(true)), [])
 */

const EVENT = 'app:open-create-persona-dialog'

export function openCreatePersonaDialog() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENT))
}

export function onOpenCreatePersonaDialog(fn) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
