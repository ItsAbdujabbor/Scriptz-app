export function rafThrottle(fn) {
  let scheduled = false
  let lastArgs = null
  const wrapped = function (...args) {
    lastArgs = args
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      const a = lastArgs
      lastArgs = null
      fn.apply(this, a)
    })
  }
  wrapped.cancel = () => {
    scheduled = false
    lastArgs = null
  }
  return wrapped
}
