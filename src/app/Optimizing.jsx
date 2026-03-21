import { useEffect, useState } from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'
import { getOnboardingTranslations } from '../i18n/onboarding'
import './Optimizing.css'

const MESSAGE_KEYS = ['optimizingMsg1', 'optimizingMsg2', 'optimizingMsg3', 'optimizingMsg4']

export function Optimizing({ onComplete }) {
  const [messageIndex, setMessageIndex] = useState(0)
  const preferredLanguage = useOnboardingStore((s) => s.preferredLanguage)
  const t = getOnboardingTranslations(preferredLanguage)

  useEffect(() => {
    const duration = 3200
    const interval = 400
    const steps = MESSAGE_KEYS.length
    let i = 0
    const id = setInterval(() => {
      i += 1
      if (i < steps) setMessageIndex(i)
    }, interval)
    const timeoutId = setTimeout(() => {
      clearInterval(id)
      onComplete?.()
    }, duration)
    return () => {
      clearTimeout(timeoutId)
      clearInterval(id)
    }
  }, [onComplete])

  const message = t[MESSAGE_KEYS[messageIndex]] ?? t.optimizingMsg1

  return (
    <div className="optimizing-page">
      <div className="optimizing-aura" aria-hidden="true" />
      <div className="optimizing-inner">
        <div className="optimizing-card">
          <div className="optimizing-spinner" aria-hidden="true" />
          <h2 className="optimizing-title">{t.optimizingTitle}</h2>
          <p className="optimizing-subtitle">{message}</p>
        </div>
      </div>
    </div>
  )
}
