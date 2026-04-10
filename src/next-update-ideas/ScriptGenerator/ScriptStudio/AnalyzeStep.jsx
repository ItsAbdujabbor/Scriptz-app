import { useState } from 'react'

const TONE_OPTIONS = ['casual', 'professional', 'energetic', 'educational']
const LENGTH_OPTIONS = [
  { label: 'Short (1 min)', value: '1' },
  { label: 'Medium (5 min)', value: '5' },
  { label: 'Long (10+ min)', value: '10' },
]

export function AnalyzeStep({ onSubmit }) {
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('casual')
  const [length, setLength] = useState('5')

  const canSubmit = topic.trim().length >= 3

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(topic.trim(), { tone, length })
  }

  return (
    <form className="script-studio-analyze" onSubmit={handleSubmit}>
      <div className="script-studio-analyze-hero">
        <h2 className="script-studio-analyze-title">What's your video about?</h2>
        <p className="script-studio-analyze-sub">
          Describe your idea and we'll craft 3 unique script concepts for you.
        </p>
      </div>

      <div className="script-studio-analyze-input-wrap">
        <textarea
          className="script-studio-analyze-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. 5 productivity hacks that actually work for remote workers..."
          rows={3}
          maxLength={500}
          autoFocus
        />
        <span className="script-studio-analyze-count">{topic.length}/500</span>
      </div>

      <div className="script-studio-analyze-chips">
        <div className="script-studio-chip-group">
          <label className="script-studio-chip-label">Tone</label>
          <div className="script-studio-chips">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`script-studio-chip ${tone === t ? 'is-active' : ''}`}
                onClick={() => setTone(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="script-studio-chip-group">
          <label className="script-studio-chip-label">Length</label>
          <div className="script-studio-chips">
            {LENGTH_OPTIONS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`script-studio-chip ${length === l.value ? 'is-active' : ''}`}
                onClick={() => setLength(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="script-studio-analyze-submit dash-btn dash-btn--primary"
        disabled={!canSubmit}
      >
        Analyze & generate concepts
      </button>
    </form>
  )
}
