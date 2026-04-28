import { useAnimatedHint } from '../lib/useAnimatedHint'

/**
 * Overlay placeholder for the composer textarea. Rotates through `hints` with
 * a fade/slide transition. Uses the shared `.coach-composer-placeholder` +
 * `.coach-composer-placeholder-text` CSS (defined in CoachChat.css, globally
 * loaded) so Coach / Script / Thumbnail all look identical.
 */
export function AnimatedComposerHint({ hints, paused = false, hidden = false }) {
  const { hint, phase } = useAnimatedHint(hints, { paused: paused || hidden })
  const phaseClass =
    phase === 'exiting' ? ' is-exiting' : phase === 'entering' ? ' is-entering' : ''
  return (
    <span
      className={`coach-composer-placeholder${hidden ? ' is-hidden' : ''}`}
      aria-hidden="true"
    >
      <span className={`coach-composer-placeholder-text${phaseClass}`}>{hint}</span>
    </span>
  )
}
