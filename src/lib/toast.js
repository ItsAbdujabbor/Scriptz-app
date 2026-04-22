/**
 * Global toast event bus — error/warning/success/info notifications fired
 * from any point in the app without props-drilling.
 *
 * Mirrors the `app:celebrate` system in `src/lib/celebrate.js` — same shape,
 * same event-bus pattern. The renderer is `<ToastStack />` mounted in
 * `AppShellLayout` next to `<CelebrationOverlay />`.
 *
 * Example:
 *   import { toast } from '@/lib/toast'
 *   toast.error('Could not generate thumbnails.', {
 *     code: 'CONTENT_BLOCKED',
 *     title: 'Content blocked',
 *   })
 */

const EVENT = 'app:toast'

/**
 * Trigger a toast notification.
 *
 * @param {object} opts
 * @param {'error'|'warning'|'success'|'info'} [opts.tone='error']
 * @param {string} [opts.title]            — short headline
 * @param {string} opts.message            — body text (required)
 * @param {string} [opts.code]             — optional error code shown small + monospaced (e.g. 'CONTENT_BLOCKED')
 * @param {number} [opts.duration=6000]    — ms before auto-dismiss; 0 disables auto-dismiss
 * @param {string} [opts.action]           — optional action button label
 * @param {Function} [opts.onAction]       — callback when action button is clicked
 */
export function toast(opts) {
  if (typeof window === 'undefined') return
  if (!opts || !opts.message) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: opts }))
}

export function onToast(fn) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

toast.error = (message, opts = {}) => toast({ ...opts, tone: 'error', message })
toast.warning = (message, opts = {}) => toast({ ...opts, tone: 'warning', message })
toast.success = (message, opts = {}) => toast({ ...opts, tone: 'success', message })
toast.info = (message, opts = {}) => toast({ ...opts, tone: 'info', message })
