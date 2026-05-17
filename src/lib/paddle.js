/** Paddle.js v2 loader + checkout helpers.
 *
 * Public surface:
 *   - preloadPaddle()                                 → kick off script load early (call on pricing page mount)
 *   - openPaddleCheckout({ transactionId })           → overlay (one-off purchases, credit packs)
 *   - openPaddleInlineCheckout({ transactionId, … })  → inline mount (subscription checkout flow)
 *   - subscribePaddleEvents(fn)                       → global event stream from Paddle.Initialize
 */
let _paddlePromise = null
const _eventListeners = new Set()

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load ' + src))
    document.head.appendChild(s)
  })
}

function paddleEnvironment() {
  const env = (import.meta.env.VITE_PADDLE_ENV || 'sandbox').toLowerCase()
  return env === 'production' ? 'production' : 'sandbox'
}

function paddleDispatch(ev) {
  // checkout.ping.size fires on every iframe resize (dozens per session).
  // Only log named events that we'd actually act on.
  const name = ev?.name
  if (name && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[Paddle]', name, ev)
  }
  for (const fn of _eventListeners) {
    try {
      fn(ev)
    } catch (err) {
      console.error('[Paddle:listener error]', err)
    }
  }
}

/** Subscribe to Paddle Checkout events. Returns an unsubscribe function. */
export function subscribePaddleEvents(fn) {
  _eventListeners.add(fn)
  return () => _eventListeners.delete(fn)
}

export function loadPaddle(clientTokenOverride) {
  if (_paddlePromise) return _paddlePromise
  _paddlePromise = (async () => {
    await loadScript('https://cdn.paddle.com/paddle/v2/paddle.js')
    const Paddle = window.Paddle
    if (!Paddle) throw new Error('Paddle.js failed to initialize')
    const token = clientTokenOverride || import.meta.env.VITE_PADDLE_CLIENT_TOKEN
    if (!token) {
      throw new Error('VITE_PADDLE_CLIENT_TOKEN is not set')
    }
    if (paddleEnvironment() === 'sandbox') {
      Paddle.Environment.set('sandbox')
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        '[Paddle:init] token prefix:',
        String(token).slice(0, 8),
        'env:',
        paddleEnvironment()
      )
    }
    Paddle.Initialize({ token, eventCallback: paddleDispatch })
    return Paddle
  })()
  return _paddlePromise
}

/** Fire-and-forget pre-warm. Call from any surface where the user is one
 *  click away from checkout (the pricing page) so by the time they reach
 *  the checkout screen the script is already in cache and Paddle is
 *  initialised. Safe to call repeatedly — `loadPaddle` is memoised. */
export function preloadPaddle() {
  loadPaddle().catch(() => {
    /* preload errors are tolerable — the real openPaddleCheckout call
       below will surface them with a proper UI state. */
  })
}

export async function openPaddleCheckout({
  transactionId,
  checkoutUrl,
  clientToken,
  onEvent,
} = {}) {
  // Mirror openPaddleInlineCheckout's onEvent plumbing — callers should
  // pass their listener HERE rather than calling subscribePaddleEvents
  // from their own module. paddle.js can end up in a different
  // code-split chunk than the caller, in which case importing
  // subscribePaddleEvents from there returns a function bound to a
  // _different_ `_eventListeners` Set than the one Paddle's eventCallback
  // (paddleDispatch) actually iterates — so the caller's subscriber
  // would silently never fire. Subscribing from inside paddle.js
  // guarantees both sides resolve to the same module instance.
  let unsubscribe = () => {}
  if (typeof onEvent === 'function') {
    unsubscribe = subscribePaddleEvents(onEvent)
  }
  // If backend returned a hosted checkout_url, use it as a fallback.
  try {
    const Paddle = await loadPaddle(clientToken)
    Paddle.Checkout.open({
      transactionId,
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
      },
    })
  } catch (e) {
    unsubscribe()
    if (checkoutUrl) {
      window.location.href = checkoutUrl
      return
    }
    throw e
  }
  // Return a dispose handle so callers can detach the listener
  // (mirrors openPaddleInlineCheckout). Best-effort — if the caller
  // ignores it, the listener stays until checkout.closed comes through.
  return { dispose: unsubscribe }
}

/** Mount Paddle Inline Checkout into the DOM element carrying
 *  `frameTargetClass` (just a class name, not a selector). Paddle locates
 *  that element and renders the checkout iframe inside it.
 *
 *  `onEvent`, if provided, is registered as a one-off subscriber for the
 *  duration of this checkout — call the returned `dispose` to detach. */
export async function openPaddleInlineCheckout({
  transactionId,
  frameTargetClass,
  successUrl,
  clientToken,
  theme = 'dark',
  onEvent,
} = {}) {
  if (!frameTargetClass) {
    throw new Error('openPaddleInlineCheckout: frameTargetClass is required')
  }
  const Paddle = await loadPaddle(clientToken)
  let unsubscribe = () => {}
  if (typeof onEvent === 'function') {
    unsubscribe = subscribePaddleEvents(onEvent)
  }
  // Close any prior in-flight checkout. In React StrictMode dev the
  // CheckoutScreen mounts twice, and the first mount attaches Paddle's
  // iframe to a DOM node that's then removed when React swaps trees. The
  // second open call needs a clean slate so it can attach the iframe to
  // the live DOM node.
  try {
    Paddle.Checkout.close()
  } catch {
    /* nothing to close */
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[Paddle:open] transactionId:', transactionId, 'target:', frameTargetClass)
  }
  Paddle.Checkout.open({
    transactionId,
    settings: {
      displayMode: 'inline',
      theme,
      variant: 'one-page',
      frameTarget: frameTargetClass,
      frameInitialHeight: 416,
      frameStyle: 'width: 100%; min-width: 312px; background-color: transparent; border: none;',
      ...(successUrl ? { successUrl } : {}),
      allowLogout: false,
    },
  })
  return {
    dispose: () => {
      unsubscribe()
      try {
        Paddle.Checkout.close()
      } catch {
        /* checkout may already be closed */
      }
    },
  }
}
