/**
 * Tiny event bus to open the create-persona dialog from anywhere.
 * Backed by the shared `createEventBus` factory.
 *
 * Usage:
 *   import { openCreatePersonaDialog } from '@/lib/personaModalBus'
 *   <button onClick={openCreatePersonaDialog}>Create persona</button>
 *
 *   useEffect(() => onOpenCreatePersonaDialog(() => setOpen(true)), [])
 */
import { createEventBus } from './createEventBus.js'

const bus = createEventBus('app:open-create-persona-dialog')

export const openCreatePersonaDialog = (detail) => bus.emit(detail)
export const onOpenCreatePersonaDialog = (handler) => bus.on(handler)
