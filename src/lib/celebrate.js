/**
 * Global "celebration" event bus — a success animation + toast that fires
 * from any point in the app without props-drilling.
 *
 * Example:
 *   import { celebrate } from '@/lib/celebrate'
 *   celebrate({
 *     title: 'Welcome to Creator!',
 *     subtitle: '7,000 credits have been added to your account.',
 *     emoji: '🎉',
 *   })
 *
 * The overlay lives in `AppShellLayout` (`<CelebrationOverlay />`).
 */

const EVENT = 'app:celebrate'

/**
 * Trigger the celebration overlay.
 *
 * @param {object} opts
 * @param {string} [opts.title]     — big line, e.g. "You're Creator!"
 * @param {string} [opts.subtitle]  — small detail line
 * @param {string} [opts.emoji]     — large accent, defaults to 🎉
 * @param {string} [opts.variant]   — "success" | "celebrate" | "thanks"
 * @param {number} [opts.duration]  — ms on screen, default 4200
 * @param {boolean} [opts.confetti] — whether to show confetti, default true
 */
export function celebrate(opts = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: opts }))
}

export function onCelebrate(fn) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
