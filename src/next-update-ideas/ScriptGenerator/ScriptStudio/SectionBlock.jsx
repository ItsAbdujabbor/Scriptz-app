import { useState } from 'react'

const MARKER_RE = /\[(B-ROLL|ON-SCREEN TEXT|PAUSE|SFX|CUT)(?::\s*([^\]]*))?\]/gi
const SECTION_COLORS = {
  HOOK: '#a78bfa',
  INTRO: '#818cf8',
  CTA: '#f59e0b',
  END: '#6b7280',
  OUTRO: '#6b7280',
}

function getColor(id) {
  return SECTION_COLORS[id] || '#34d399'
}

function stripMarkers(text) {
  return text
    .replace(MARKER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function renderDirectorText(text) {
  const parts = []
  let last = 0
  let m
  const re = new RegExp(MARKER_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'marker', kind: m[1].toUpperCase(), detail: m[2] || '' })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })

  return parts.map((p, i) =>
    p.type === 'text' ? (
      <span key={i}>{p.value}</span>
    ) : (
      <span
        key={i}
        className={`script-studio-marker script-studio-marker--${p.kind.toLowerCase().replace(/\s/g, '-')}`}
      >
        [{p.kind}
        {p.detail ? `: ${p.detail}` : ''}]
      </span>
    )
  )
}

export function SectionBlock({ section, viewMode, onRewrite, onTextSave, rewriting }) {
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [showInstruction, setShowInstruction] = useState(false)

  const color = getColor(section.id)
  const displayText = viewMode === 'text' ? stripMarkers(section.text) : null

  const handleStartEdit = () => {
    setEditText(section.text)
    setEditMode(true)
  }

  const handleRewrite = () => {
    if (showInstruction && instruction.trim()) {
      onRewrite(section.id, instruction.trim())
      setShowInstruction(false)
      setInstruction('')
    } else {
      onRewrite(section.id, null)
    }
  }

  return (
    <div className={`script-studio-section ${rewriting ? 'is-rewriting' : ''}`}>
      <div className="script-studio-section-head">
        <span className="script-studio-section-badge" style={{ borderColor: color, color }}>
          {section.id.replace(/_/g, ' ')}
        </span>
        {section.title && section.id !== section.title && (
          <span className="script-studio-section-title">{section.title}</span>
        )}
        <div className="script-studio-section-actions">
          {!editMode && (
            <>
              <button
                type="button"
                className="script-studio-section-btn"
                onClick={handleStartEdit}
                disabled={rewriting}
              >
                Edit
              </button>
              <button
                type="button"
                className="script-studio-section-btn script-studio-section-btn--rewrite"
                onClick={() => setShowInstruction((s) => !s)}
                disabled={rewriting}
              >
                {rewriting ? 'Rewriting...' : 'Rewrite'}
              </button>
            </>
          )}
          {editMode && (
            <>
              <button
                type="button"
                className="script-studio-section-btn"
                onClick={() => setEditMode(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="script-studio-section-btn script-studio-section-btn--save"
                onClick={() => {
                  onTextSave?.(section.id, editText)
                  setEditMode(false)
                }}
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {showInstruction && !editMode && (
        <div className="script-studio-section-instruction">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="How should this section change? (optional)"
            className="script-studio-section-instruction-input"
            onKeyDown={(e) => e.key === 'Enter' && handleRewrite()}
          />
          <button
            type="button"
            className="dash-btn dash-btn--primary dash-btn--sm"
            onClick={handleRewrite}
            disabled={rewriting}
          >
            Go
          </button>
        </div>
      )}

      <div className="script-studio-section-body">
        {editMode ? (
          <textarea
            className="script-studio-section-editor"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={Math.max(4, Math.ceil(section.text.length / 80))}
          />
        ) : viewMode === 'text' ? (
          <p className="script-studio-section-text">{displayText}</p>
        ) : (
          <div className="script-studio-section-text script-studio-section-text--director">
            {renderDirectorText(section.text)}
          </div>
        )}
      </div>

      {viewMode === 'director' && section.cues && section.cues.length > 0 && (
        <div className="script-studio-section-cues">
          {section.cues.map((cue, i) => (
            <span key={i} className={`script-studio-cue script-studio-cue--${cue.type}`}>
              {cue.type}: {cue.text || ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
