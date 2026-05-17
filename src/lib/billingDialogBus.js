/**
 * billingDialogBus — tiny pub/sub for the Billing dialog. Backed by the
 * shared `createEventBus` factory.
 *
 * Any component anywhere can open the Billing dialog by firing
 * `openBillingDialog()` without a prop chain or shared store. The dialog
 * is mounted once at the AuthenticatedRoutes level via `<BillingDialog />`
 * and listens for the open event.
 */
import { createEventBus } from './createEventBus.js'

const bus = createEventBus('app:open-billing-dialog')

export const openBillingDialog = (detail) => bus.emit(detail)
export const onOpenBillingDialog = (handler) => bus.on(handler)
