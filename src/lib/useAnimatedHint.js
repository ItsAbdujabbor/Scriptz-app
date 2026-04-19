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
    const id = setInterval(() => {
      setPhase('exiting')
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % length)
        setPhase('entering')
        requestAnimationFrame(() => setPhase('visible'))
      }, transitionMs)
    }, intervalMs)
    return () => clearInterval(id)
  }, [paused, length, intervalMs, transitionMs])

  return {
    hint: Array.isArray(hints) && length > 0 ? (hints[index % length] ?? '') : '',
    phase,
  }
}
