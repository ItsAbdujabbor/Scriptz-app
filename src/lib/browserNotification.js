/**
 * Browser notification helper for terminal job events.
 *
 * Shown only when the tab is hidden — the in-app UI is the right
 * surface when the user is actively watching the loader. Keeps copy
 * short and friendly; never alarms the user mid-failure.
 *
 * Permission model: lazy. We don't prompt at app load — too pushy.
 * Instead, the first time we genuinely have something to notify about
 * AND the tab is hidden AND permission hasn't been decided yet, we
 * ask. If the user declines, future notifications silently no-op
 * (we never re-prompt).
 */

const ICON_URL = '/favicon.ico'

let _permissionRequestInFlight = null

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

async function ensurePermission() {
  if (!notificationsSupported()) return 'denied'
  // Cached permission state — fast path that avoids the Notification
  // API throwing on repeated requestPermission calls.
  const current = window.Notification.permission
  if (current === 'granted' || current === 'denied') return current

  // Coalesce concurrent requests so multiple terminal events arriving
  // while the prompt is open don't race.
  if (_permissionRequestInFlight) return _permissionRequestInFlight
  _permissionRequestInFlight = window.Notification.requestPermission()
    .then((result) => result)
    .catch(() => 'denied')
    .finally(() => {
      _permissionRequestInFlight = null
    })
  return _permissionRequestInFlight
}

/**
 * Show a notification when a thumbnail job finishes (or fails) while
 * the tab isn't visible. Returns immediately; permission prompts and
 * actual notification creation are async.
 *
 * @param {object} opts
 * @param {boolean} opts.success — true on done, false on failed
 * @param {string}  opts.message — short body text (worker's status_message)
 */
export async function showJobDoneNotification({ success, message }) {
  if (!notificationsSupported()) return
  // Belt-and-suspenders: callers should already have checked, but
  // double-check so we never pop a desktop popup over an active tab.
  if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
    return
  }
  const permission = await ensurePermission()
  if (permission !== 'granted') return

  const title = success ? 'Your thumbnail is ready ✨' : "Couldn't generate this one"
  const body =
    (message || (success ? 'Open the tab to see it.' : 'Open the tab for details.'))
      .toString()
      .slice(0, 200)

  try {
    const note = new window.Notification(title, {
      body,
      icon: ICON_URL,
      // ``tag`` collapses repeat notifications: a flurry of done events
      // for sequential generations replaces the previous popup rather
      // than stacking. Different tag for done vs failed so one doesn't
      // overwrite the other inadvertently.
      tag: success ? 'thumbnail-done' : 'thumbnail-failed',
      // Keep notifications dismissable; don't require interaction.
      requireInteraction: false,
      silent: false,
    })
    // Clicking the notification focuses the tab — that's the only
    // useful action when the tab is hidden.
    note.onclick = () => {
      try {
        window.focus()
        note.close()
      } catch {
        /* best-effort */
      }
    }
  } catch {
    // Older browsers throw on certain option combinations; silent
    // no-op is the right behaviour for a notification helper.
  }
}
