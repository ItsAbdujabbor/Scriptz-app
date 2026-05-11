/**
 * Hero — landing first-fold.
 *
 * Real JSX (not raw-HTML inject) so the Generate CTA can be a React
 * component (LiquidMetalButton) and the prompt placeholder can run a
 * typewriter cycle (type → hold → erase → next) the same way the
 * production ThumbnailGenerator's empty-state composer does.
 */
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { LiquidMetalButton } from '../../components/LiquidMetalButton'
import { useAnimatedHint } from '../../lib/useAnimatedHint'

const ROW1 = ['/aithumbnails.png', '/landing2.png', '/landing3.png', '/landing4.png']
const ROW2 = ['/landing3.png', '/landing4.png', '/aithumbnails.png', '/landing2.png']

/* 16 thumbs per row (4 unique × 4 cycles) — duplicated so translateX(-50%)
 * wraps without a visible seam. */
function buildSet(seq) {
  return [...seq, ...seq, ...seq, ...seq]
}

/* Rotating hints — same fade/slide animation the production
 * ThumbnailGenerator uses (see src/lib/useAnimatedHint.js). Kept short so
 * each line reads cleanly inside the prompt without ellipsizing. */
const PROMPTS = [
  'A smiling explorer on a misty mountain peak — "I SURVIVED 7 DAYS"',
  'Shocked face next to a huge pile of cash — "I WON $1,000,000?!"',
  'Close-up iPhone 16 on a neon-purple gradient — "WORTH THE HYPE?"',
  'Ripped athlete mid-lift, dramatic red lighting — "30-DAY TRANSFORMATION"',
  'Gaming setup with RGB lights — "$10,000 GAMING ROOM"',
  'Confused face beside a glowing AI brain — "AI JUST CHANGED EVERYTHING"',
]

function Thumb({ src }) {
  return (
    <div className="lin-thumb">
      <img src={src} alt="" loading="lazy" />
    </div>
  )
}

export function Hero() {
  const [userInput, setUserInput] = useState('')

  /* Hint stays visible while the textarea is empty — including when
   * the user has clicked into the field but hasn't typed yet (the
   * caret blinks alongside the cycling hint). Only when actual
   * characters are typed does the hint fade away. */
  const showPlaceholder = userInput.length === 0
  const { hint, phase } = useAnimatedHint(PROMPTS, { paused: !showPlaceholder })
  const phaseClass =
    phase === 'exiting' ? ' is-exiting' : phase === 'entering' ? ' is-entering' : ''

  return (
    <section className="lin-hero" id="home">
      <div className="lin-aura" />

      {/* COPY */}
      <div className="lin-copy">
        <span className="lin-eyebrow">
          <span className="lin-eyebrow-line" />
          Data-Backed AI Thumbnails
        </span>
        <h1 className="lin-h1">
          Make Your Videos
          <br />
          <span className="lin-h1-accent">Impossible to Ignore.</span>
        </h1>
        <p className="lin-sub">
          Generate, edit, and score thumbnails + titles — all in one workspace.
        </p>
      </div>

      {/* STAGE — bottom anchor: scrolling thumbs behind a translucent prompt */}
      <div className="lin-stage">
        <div className="lin-stage-glow" />

        {/* Background marquees */}
        <div className="lin-marquees" aria-hidden="true">
          <div className="lin-marquee">
            <div className="lin-marquee-track">
              {buildSet(ROW1).map((src, i) => (
                <Thumb key={`r1-${i}`} src={src} />
              ))}
            </div>
          </div>
          <div className="lin-marquee lin-marquee--reverse">
            <div className="lin-marquee-track">
              {buildSet(ROW2).map((src, i) => (
                <Thumb key={`r2-${i}`} src={src} />
              ))}
            </div>
          </div>
        </div>

        {/* Prompt overlay with the LiquidMetalButton CTA */}
        <form className="lin-prompt" onSubmit={(e) => e.preventDefault()}>
          <div className="lin-prompt-input-wrap">
            <span
              className={`lin-prompt-hint${showPlaceholder ? '' : ' is-hidden'}`}
              aria-hidden="true"
            >
              <span className={`lin-prompt-hint-text${phaseClass}`}>{hint}</span>
            </span>
            <textarea
              className="lin-prompt-input"
              placeholder=""
              rows={3}
              cols={1}
              aria-label="Describe the thumbnail you want"
              autoComplete="off"
              spellCheck={false}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
          </div>
          <div className="lin-prompt-cta">
            <LiquidMetalButton
              icon={Sparkles}
              label="Generate"
              dark
              width="100%"
              height={48}
              aria-label="Generate"
              onClick={() => {
                window.location.hash = '#signin'
              }}
            />
          </div>
        </form>

        {/* Side fade masks blend marquee edges into the stage */}
        <div className="lin-marquee-fade lin-marquee-fade--l" />
        <div className="lin-marquee-fade lin-marquee-fade--r" />
      </div>
    </section>
  )
}
