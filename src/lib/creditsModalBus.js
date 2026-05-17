/**
 * Tiny event bus to open the credit-packs modal from anywhere in the app.
 * Backed by the shared `createEventBus` factory so all the global modal
 * buses share one implementation.
 *
 * Usage:
 *   import { openCreditsModal } from '@/lib/creditsModalBus'
 *   <button onClick={openCreditsModal}>Buy credits</button>
 *
 *   useEffect(() => onOpenCreditsModal(() => setOpen(true)), [])
 */
import { createEventBus } from './createEventBus.js'

const bus = createEventBus('app:open-credits-modal')

export const openCreditsModal = (detail) => bus.emit(detail)
export const onOpenCreditsModal = (handler) => bus.on(handler)
