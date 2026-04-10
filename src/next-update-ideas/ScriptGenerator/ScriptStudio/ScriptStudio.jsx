import { useState, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { scriptFlowApi } from '../../api/scriptFlow'
import { AnalyzeStep } from './AnalyzeStep'
import { SelectStep } from './SelectStep'
import { EditorStep } from './EditorStep'
import './ScriptStudio.css'

/**
 * ScriptStudio — 3-step wizard for script generation.
 * Step 1 (analyze): User enters topic → AI enhances prompt → 3 concepts returned
 * Step 2 (select): User picks a concept
 * Step 3 (editor): Full script with sectional editing, view toggle, export
 */
export function ScriptStudio({ channelId }) {
  const getToken = useAuthStore((s) => s.getValidAccessToken)

  const [step, setStep] = useState('analyze') // analyze | select | editor
  const [sessionId, setSessionId] = useState(null)
  const [refinedPrompt, setRefinedPrompt] = useState(null)
  const [options, setOptions] = useState([])
  const [fullScript, setFullScript] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState(null)

  const handleAnalyze = useCallback(
    async (message, contextChips) => {
      setError(null)
      setLoading(true)
      setLoadingLabel('Analyzing your idea...')
      try {
        const token = await getToken()
        if (!token) throw new Error('Not authenticated')
        const res = await scriptFlowApi.submit(token, {
          message,
          analyze_youtube: !!channelId,
          context_chips: contextChips || null,
          channel_id: channelId || null,
        })
        if (res.error) throw new Error(res.error)
        setSessionId(res.session_id)
        setRefinedPrompt(res.refined_prompt || null)
        setOptions(res.script_options || [])
        setStep('select')
      } catch (e) {
        setError(e.message || 'Failed to analyze. Try again.')
      } finally {
        setLoading(false)
        setLoadingLabel('')
      }
    },
    [getToken, channelId]
  )

  const handleSelect = useCallback(
    async (optionIndex) => {
      setError(null)
      setLoading(true)
      setLoadingLabel('Generating your script...')
      try {
        const token = await getToken()
        if (!token) throw new Error('Not authenticated')
        const res = await scriptFlowApi.selectOption(token, {
          session_id: sessionId,
          option_index: optionIndex,
        })
        setFullScript(res)
        setStep('editor')
      } catch (e) {
        setError(e.message || 'Failed to generate script.')
      } finally {
        setLoading(false)
        setLoadingLabel('')
      }
    },
    [getToken, sessionId]
  )

  const handleRewriteSection = useCallback(
    async (sectionId, instruction, currentSections) => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const res = await scriptFlowApi.rewriteSection(token, {
        session_id: sessionId,
        section_id: sectionId,
        instruction: instruction || null,
        current_sections: currentSections || null,
      })
      setFullScript(res)
      return res
    },
    [getToken, sessionId]
  )

  const handleSave = useCallback(
    async (sections) => {
      const token = await getToken()
      if (!token) return
      try {
        await scriptFlowApi.saveScript(token, sessionId, { sections })
      } catch (_) {}
    },
    [getToken, sessionId]
  )

  const handleBack = useCallback(() => {
    if (step === 'select') {
      setStep('analyze')
      setOptions([])
      setRefinedPrompt(null)
      setSessionId(null)
    } else if (step === 'editor') {
      setStep('select')
      setFullScript(null)
    }
  }, [step])

  const handleStartOver = useCallback(() => {
    setStep('analyze')
    setSessionId(null)
    setRefinedPrompt(null)
    setOptions([])
    setFullScript(null)
    setError(null)
  }, [])

  return (
    <div className="script-studio">
      {/* Progress bar */}
      <div className="script-studio-progress">
        {['analyze', 'select', 'editor'].map((s, i) => (
          <div
            key={s}
            className={`script-studio-progress-step ${step === s ? 'is-active' : ''} ${['analyze', 'select', 'editor'].indexOf(step) > i ? 'is-done' : ''}`}
          >
            <span className="script-studio-progress-num">{i + 1}</span>
            <span className="script-studio-progress-label">
              {s === 'analyze' ? 'Analyze' : s === 'select' ? 'Select' : 'Edit & Export'}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="script-studio-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="script-studio-error-dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <div className="script-studio-loading">
          <div className="script-studio-spinner" />
          <span>{loadingLabel}</span>
        </div>
      )}

      {!loading && step === 'analyze' && <AnalyzeStep onSubmit={handleAnalyze} />}

      {!loading && step === 'select' && (
        <SelectStep
          options={options}
          refinedPrompt={refinedPrompt}
          onSelect={handleSelect}
          onBack={handleBack}
        />
      )}

      {!loading && step === 'editor' && fullScript && (
        <EditorStep
          script={fullScript}
          sessionId={sessionId}
          onRewriteSection={handleRewriteSection}
          onSave={handleSave}
          onBack={handleBack}
          onStartOver={handleStartOver}
          onScriptUpdate={setFullScript}
        />
      )}
    </div>
  )
}
