import { useEffect, useState } from 'react'

/**
 * Cycles through an array of placeholder hints with a fade/slide transition.
 * Used by Coach, Script, and Thumbnail composers so the empty-state composer
 * feels alive. Pauses while the user is typing.
 *
 * @param {string[]} hints
 * @param {{ paused?: boolean, intervalMs?: number, transitionMs?: number }} [options]
 * @returns {{ hint: string, phase: 'visible' | 'exiting' | 'entering' }}
 */
export function useAnimatedHint(hints, options = {}) {
  const { paused = false, intervalMs = 4000, transitionMs = 400 } = options
  const length = Array.isArray(hints) ? hints.length : 0
  const [index, setIndex] = useState(() => (length > 0 ? Math.floor(Math.random() * length) : 0))
  const [phase, setPhase] = useState('visible')

  useEffect(() => {
    if (paused || length < 2) return
    // STM-05: the interval spawns an inner setTimeout (and that in turn
    // a requestAnimationFrame). `clearInterval` alone does NOT cancel a
    // timeout/rAF already in flight when the component unmounts — that
    // callback then runs `setIndex`/`setPhase` on an unmounted component
    // (React warning + a leaked timer). Track both inner handles and
    // clear them in cleanup.
    let innerTimeout = null
    let innerRaf = null
    const id = setInterval(() => {
      setPhase('exiting')
      innerTimeout = setTimeout(() => {
        innerTimeout = null
        setIndex((prev) => (prev + 1) % length)
        setPhase('entering')
        innerRaf = requestAnimationFrame(() => {
          innerRaf = null
          setPhase('visible')
        })
      }, transitionMs)
    }, intervalMs)
    return () => {
      clearInterval(id)
      if (innerTimeout != null) clearTimeout(innerTimeout)
      if (innerRaf != null) cancelAnimationFrame(innerRaf)
    }
  }, [paused, length, intervalMs, transitionMs])

  return {
    hint: Array.isArray(hints) && length > 0 ? (hints[index % length] ?? '') : '',
    phase,
  }
}
