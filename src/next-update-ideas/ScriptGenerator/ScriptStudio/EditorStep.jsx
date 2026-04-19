import { useState, useCallback } from 'react'
import { SectionBlock } from './SectionBlock'
import { useScriptExport } from './useScriptExport'

export function EditorStep({
  script,
  onRewriteSection,
  onSave,
  onBack,
  onStartOver,
  onScriptUpdate,
}) {
  const [viewMode, setViewMode] = useState('director') // director | text
  const [rewritingId, setRewritingId] = useState(null)

  const sections = script?.sections || []
  const title = script?.title || 'Untitled Script'
  const duration = script?.estimated_duration_minutes

  const { exportTxt, exportPdf, exportDocx } = useScriptExport()

  const handleRewrite = useCallback(
    async (sectionId, instruction) => {
      setRewritingId(sectionId)
      try {
        const res = await onRewriteSection(sectionId, instruction, sections)
        if (res) onScriptUpdate(res)
      } catch (_) {}
      setRewritingId(null)
    },
    [onRewriteSection, sections, onScriptUpdate]
  )

  const handleTextSave = useCallback(
    (sectionId, newText) => {
      const updated = {
        ...script,
        sections: sections.map((s) => (s.id === sectionId ? { ...s, text: newText } : s)),
      }
      onScriptUpdate(updated)
    },
    [script, sections, onScriptUpdate]
  )

  const handleSave = useCallback(() => {
    onSave(sections)
  }, [onSave, sections])

  return (
    <div className="script-studio-editor">
      <div className="script-studio-editor-head">
        <div className="script-studio-editor-head-left">
          <h2 className="script-studio-editor-title">{title}</h2>
          {duration && <span className="script-studio-editor-duration">~{duration} min</span>}
        </div>
        <div className="script-studio-editor-head-right">
          <div className="script-studio-view-toggle">
            <button
              type="button"
              className={`script-studio-view-btn ${viewMode === 'director' ? 'is-active' : ''}`}
              onClick={() => setViewMode('director')}
            >
              Director's View
            </button>
            <button
              type="button"
              className={`script-studio-view-btn ${viewMode === 'text' ? 'is-active' : ''}`}
              onClick={() => setViewMode('text')}
            >
              Script Only
            </button>
          </div>
        </div>
      </div>

      <div className="script-studio-sections">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            viewMode={viewMode}
            onRewrite={handleRewrite}
            onTextSave={handleTextSave}
            rewriting={rewritingId === section.id}
          />
        ))}
      </div>

      <div className="script-studio-editor-toolbar">
        <div className="script-studio-editor-toolbar-left">
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onBack}>
            Back to concepts
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onStartOver}>
            Start over
          </button>
        </div>
        <div className="script-studio-editor-toolbar-right">
          <button type="button" className="dash-btn dash-btn--ghost" onClick={handleSave}>
            Save
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--secondary"
            onClick={() => exportTxt(sections, title, viewMode)}
          >
            TXT
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--secondary"
            onClick={() => exportPdf(sections, title, viewMode)}
          >
            PDF
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            onClick={() => exportDocx(sections, title, viewMode)}
          >
            DOCX
          </button>
        </div>
      </div>
    </div>
  )
}
