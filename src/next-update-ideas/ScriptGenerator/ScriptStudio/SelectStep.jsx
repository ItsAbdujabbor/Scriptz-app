import { useState } from 'react'

export function SelectStep({ options, refinedPrompt, onSelect, onBack }) {
  const [selected, setSelected] = useState(null)

  return (
    <div className="script-studio-select">
      {refinedPrompt && (
        <div className="script-studio-refined">
          <span className="script-studio-refined-label">Enhanced prompt</span>
          <p className="script-studio-refined-text">{refinedPrompt}</p>
        </div>
      )}

      <h2 className="script-studio-select-title">Pick a script concept</h2>
      <p className="script-studio-select-sub">
        Choose the direction that fits your vision. We'll expand it into a full script.
      </p>

      <div className="script-studio-options">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className={`script-studio-option ${selected === i ? 'is-selected' : ''}`}
            onClick={() => setSelected(i)}
          >
            <span className="script-studio-option-num">{i + 1}</span>
            <div className="script-studio-option-body">
              <h3 className="script-studio-option-title">{opt.title}</h3>
              {opt.hook_one_line && (
                <p className="script-studio-option-hook">"{opt.hook_one_line}"</p>
              )}
              <p className="script-studio-option-desc">
                {opt.description_2_3_lines || opt.summary || ''}
              </p>
              <div className="script-studio-option-meta">
                {opt.format && <span className="script-studio-option-badge">{opt.format}</span>}
                {opt.emotion_tag && (
                  <span className="script-studio-option-badge script-studio-option-badge--emotion">
                    {opt.emotion_tag}
                  </span>
                )}
                {opt.estimated_length_minutes && (
                  <span className="script-studio-option-badge script-studio-option-badge--length">
                    ~{opt.estimated_length_minutes} min
                  </span>
                )}
              </div>
              {opt.why_fits_channel && (
                <p className="script-studio-option-fit">{opt.why_fits_channel}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="script-studio-select-actions">
        <button type="button" className="dash-btn dash-btn--ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--primary"
          disabled={selected == null}
          onClick={() => onSelect(selected)}
        >
          Generate script
        </button>
      </div>
    </div>
  )
}
