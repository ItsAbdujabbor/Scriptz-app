import { useEffect, useState } from 'react'
import './PostSignupSplash.css'

export function PostSignupSplash({ onComplete }) {
  const [phase, setPhase] = useState('creating') // 'creating' | 'welcome'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('welcome'), 1200)
    return () => clearTimeout(t1)
  }, [])

  useEffect(() => {
    const duration = 2800
    const t = setTimeout(() => {
      onComplete?.()
    }, duration)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div className="splash-page">
      <div className="splash-aura" aria-hidden="true" />
      <div className="splash-inner">
        <div className="splash-spinner" aria-hidden="true" />
        <h1 className="splash-title">
          {phase === 'creating' ? 'Creating your account…' : 'Welcome to Scriptz'}
        </h1>
        <p className="splash-subtitle">
          {phase === 'creating'
            ? 'Setting up your creator workspace.'
            : 'Taking you to onboarding…'}
        </p>
      </div>
    </div>
  )
}
