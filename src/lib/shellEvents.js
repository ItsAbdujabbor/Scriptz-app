/**
 * Lightweight event bus for communication between the shared shell (Sidebar)
 * and individual screen components (CoachChat).
 *
 * Only used for the 'newChat' event — triggered when the user clicks "New Chat"
 * in the Sidebar, so CoachChat can reset its internal state (draft, recording, etc).
 */
const listeners = new Map()

export function onShellEvent(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(fn)
  return () => listeners.get(event)?.delete(fn)
}

export function emitShellEvent(event, data) {
  listeners.get(event)?.forEach((fn) => fn(data))
}
