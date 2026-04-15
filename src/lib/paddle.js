/** Paddle.js v2 loader + inline checkout helpers.
 *
 * Loads https://cdn.paddle.com/paddle/v2/paddle.js once, initializes with the
 * public client token (VITE_PADDLE_CLIENT_TOKEN), and exposes a promise-based
 * `openPaddleCheckout({ transactionId })` helper.
 */
let _paddlePromise = null

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
    Paddle.Initialize({ token })
    return Paddle
  })()
  return _paddlePromise
}

export async function openPaddleCheckout({ transactionId, checkoutUrl, clientToken } = {}) {
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
    if (checkoutUrl) {
      window.location.href = checkoutUrl
      return
    }
    throw e
  }
}
