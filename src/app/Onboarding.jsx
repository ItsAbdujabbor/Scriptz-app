import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { LANGUAGES, NICHE_KEYS, getOnboardingTranslations } from '../i18n/onboarding'
import { youtubeApi } from '../api/youtube'
import { getNicheIcon, FORMAT_ICONS, FREQUENCY_ICONS, IconYouTube, IconSkipForward } from './OnboardingIcons'
import './onboarding.css'
import { useSaveUserPreferencesMutation } from '../queries/user/preferencesQueries'
import { useUpdateUserProfileMutation } from '../queries/user/profileQueries'

const TOTAL_STEPS = 6 // language, niche, format, frequency, youtube, done

const LANGUAGE_EMOJIS = ['🌐', '🇪🇸', '🇧🇷', '🇩🇪', '🇫🇷']
const FORMAT_OPTIONS = [
  { value: 'shorts', labelKey: 'formatShorts' },
  { value: 'longform', labelKey: 'formatLongform' },
  { value: 'both', labelKey: 'formatBoth' },
]
const FREQUENCY_OPTIONS = [
  { value: 'daily', labelKey: 'frequencyDaily' },
  { value: 'few_times', labelKey: 'frequencyFewTimes' },
  { value: 'weekly', labelKey: 'frequencyWeekly' },
  { value: 'occasionally', labelKey: 'frequencyOccasionally' },
]

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const [customNiche, setCustomNiche] = useState('')
  const [youtubeConnecting, setYoutubeConnecting] = useState(false)
  const [youtubeConnectError, setYoutubeConnectError] = useState(null)
  const saveUserPreferencesMutation = useSaveUserPreferencesMutation()
  const updateUserProfileMutation = useUpdateUserProfileMutation()

  const {
    preferredLanguage,
    niche,
    videoFormat,
    uploadFrequency,
    setPreferredLanguage,
    setNiche,
    setVideoFormat,
    setUploadFrequency,
    setYouTube,
    completeOnboarding,
    load,
  } = useOnboardingStore()

  const t = getOnboardingTranslations(preferredLanguage)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (niche === 'Other' || (niche && !NICHE_KEYS.includes(niche))) setCustomNiche(niche || '')
  }, [niche])

  const goNext = () => {
    if (step === 1 && (niche === 'Other' ? customNiche : niche)) {
      setNiche(niche === 'Other' ? customNiche : niche)
    }
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1)
    } else {
      finishOnboarding()
    }
  }

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const skipEntireOnboarding = () => {
    finishOnboarding()
  }

  async function finishOnboarding() {
    completeOnboarding()
    const token = await useAuthStore.getState().getValidAccessToken()
    if (token) {
      try {
        const state = useOnboardingStore.getState()
        await Promise.all([
          saveUserPreferencesMutation.mutateAsync({
            preferredLanguage: state.preferredLanguage,
            niche: state.niche,
            videoFormat: state.videoFormat,
            uploadFrequency: state.uploadFrequency,
            youtube: state.youtube,
          }),
          updateUserProfileMutation.mutateAsync({
            niche: state.niche,
            video_format: state.videoFormat,
            upload_frequency: state.uploadFrequency,
            preferred_tone: state.preferredTone || null,
            speaking_style: state.speakingStyle || null,
            preferred_cta_style: state.preferredCtaStyle || null,
            include_personal_stories: state.includePersonalStories,
            use_first_person: state.useFirstPerson,
          }),
        ])

        const cid = state.youtube?.channelId ?? state.youtube?.channel_id
        if (cid) {
          await state.syncChannelToBackend?.(token, cid, {})
        }
      } catch (_) {
        // Save can fail (401, network). Onboarding is still marked complete locally; proceed to app.
      }
    }
    onComplete?.()
  }

  const canContinue = () => {
    if (step === 0) return !!preferredLanguage
    if (step === 1) return (niche && niche !== 'Other') || customNiche.trim()
    if (step === 2) return !!videoFormat
    if (step === 3) return !!uploadFrequency
    return true
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-aura" aria-hidden="true" />

      <div className="onboarding-container">
        <div className="onboarding-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`onboarding-progress-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-card">
          {step > 0 && step < 5 && (
            <div className="onboarding-card-back">
              <button type="button" className="onboarding-back-link" onClick={goBack} aria-label={t.back}>
                ← {t.back}
              </button>
            </div>
          )}
          <div className="onboarding-card-body">
          {/* Step 0: Language */}
          {step === 0 && (
            <>
              <h1 className="onboarding-step-title">{t.chooseLanguage}</h1>
              <p className="onboarding-step-subtitle">{t.chooseLanguageSub}</p>
              <div className="onboarding-options onboarding-options--cards onboarding-options--language">
                {LANGUAGES.map(({ code, label }, i) => (
                  <button
                    key={code}
                    type="button"
                    className={`onboarding-option onboarding-option--card ${preferredLanguage === code ? 'selected' : ''}`}
                    onClick={() => setPreferredLanguage(code)}
                  >
                    <span className="onboarding-option-emoji" aria-hidden>{LANGUAGE_EMOJIS[i] ?? '🌐'}</span>
                    <span className="onboarding-option-label">{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 1: Niche */}
          {step === 1 && (
            <>
              <h1 className="onboarding-step-title">{t.nicheTitle}</h1>
              <p className="onboarding-step-subtitle">{t.nicheSub}</p>
              <div className="onboarding-options onboarding-options--grid onboarding-options--cards onboarding-options--niche">
                {NICHE_KEYS.map((key, i) => {
                  const Icon = getNicheIcon(i)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`onboarding-option onboarding-option--card ${niche === key ? 'selected' : ''}`}
                      onClick={() => {
                        setNiche(key)
                        if (key !== 'Other') setCustomNiche('')
                      }}
                    >
                      <span className="onboarding-option-icon-wrap" aria-hidden><Icon /></span>
                      <span className="onboarding-option-label">{t.niches[i]}</span>
                    </button>
                  )
                })}
              </div>
              {(niche === 'Other' || customNiche) && (
                <div className="onboarding-niche-input">
                  <label htmlFor="ob-niche-custom">{t.orTypeNiche}</label>
                  <input
                    id="ob-niche-custom"
                    type="text"
                    placeholder={t.nichePlaceholder}
                    value={customNiche}
                    onChange={(e) => setCustomNiche(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* Step 2: Format */}
          {step === 2 && (
            <>
              <h1 className="onboarding-step-title">{t.formatTitle}</h1>
              <p className="onboarding-step-subtitle">{t.formatSub}</p>
              <div className="onboarding-options onboarding-options--cards onboarding-options--format">
                {FORMAT_OPTIONS.map(({ value, labelKey }) => {
                  const Icon = FORMAT_ICONS[value]
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`onboarding-option onboarding-option--card ${videoFormat === value ? 'selected' : ''}`}
                      onClick={() => setVideoFormat(value)}
                    >
                      <span className="onboarding-option-icon-wrap" aria-hidden>{Icon && <Icon />}</span>
                      <span className="onboarding-option-label">{t[labelKey]}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Step 3: Frequency */}
          {step === 3 && (
            <>
              <h1 className="onboarding-step-title">{t.frequencyTitle}</h1>
              <p className="onboarding-step-subtitle">{t.frequencySub}</p>
              <div className="onboarding-options onboarding-options--cards onboarding-options--frequency">
                {FREQUENCY_OPTIONS.map(({ value, labelKey }) => {
                  const Icon = FREQUENCY_ICONS[value]
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`onboarding-option onboarding-option--card ${uploadFrequency === value ? 'selected' : ''}`}
                      onClick={() => setUploadFrequency(value)}
                    >
                      <span className="onboarding-option-icon-wrap" aria-hidden>{Icon && <Icon />}</span>
                      <span className="onboarding-option-label">{t[labelKey]}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Step 4: YouTube */}
          {step === 4 && (
            <div className="onboarding-youtube-step">
              <h1 className="onboarding-step-title">{t.youtubeTitle}</h1>
              <p className="onboarding-step-subtitle">{t.youtubeSub}</p>
              <div className="onboarding-youtube-connect-block">
                <div className="onboarding-youtube-connect-card">
                  <span className="onboarding-youtube-connect-icon" aria-hidden>
                    <IconYouTube />
                  </span>
                  <button
                    type="button"
                    className="onboarding-btn onboarding-connect-youtube-btn"
                    onClick={async () => {
                      setYoutubeConnectError(null)
                      setYoutubeConnecting(true)
                      try {
                        const token = await useAuthStore.getState().getValidAccessToken()
                        if (!token) {
                          setYoutubeConnectError('Not signed in. Please refresh and try again.')
                          setYoutubeConnecting(false)
                          return
                        }
                        const url = await youtubeApi.getAuthorizationUrl(token)
                        window.location.href = url
                        return
                      } catch (e) {
                        const msg =
                          e?.message ||
                          (typeof e === 'string' ? e : 'Could not start YouTube connection.')
                        setYoutubeConnectError(msg)
                      }
                      setYoutubeConnecting(false)
                    }}
                    disabled={youtubeConnecting}
                  >
                    {youtubeConnecting ? (
                      <span className="onboarding-connect-youtube-loading">Connecting…</span>
                    ) : (
                      <>
                        <IconYouTube />
                        <span>{t.connectYouTube}</span>
                      </>
                    )}
                  </button>
                  {youtubeConnectError ? (
                    <p className="onboarding-youtube-error" role="alert">
                      {youtubeConnectError}
                    </p>
                  ) : null}
                </div>
                <button type="button" className="onboarding-youtube-skip" onClick={goNext}>
                  <IconSkipForward />
                  <span>{t.skipForNow}</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <>
              <h1 className="onboarding-step-title">{t.allSetTitle}</h1>
              <p className="onboarding-step-subtitle">{t.allSetSub}</p>
            </>
          )}

          </div>

          {/* Actions: always in same place at bottom of card */}
          {step === 5 && (
            <div className="onboarding-card-actions onboarding-card-actions--center">
              <button type="button" className="onboarding-btn onboarding-btn-primary onboarding-btn--pill onboarding-btn--full" onClick={finishOnboarding}>
                {t.getStarted}
              </button>
            </div>
          )}

          {step < 5 && step !== 4 && (
            <div className="onboarding-card-actions">
              <button
                type="button"
                className="onboarding-btn onboarding-btn-primary onboarding-btn--pill"
                onClick={goNext}
                disabled={!canContinue()}
              >
                {t.continue}
              </button>
              <button type="button" className="onboarding-skip onboarding-skip--entire" onClick={skipEntireOnboarding} title={t.skipEntireOnboardingSub}>
                {t.skipEntireOnboarding}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-card-actions">
              <div className="onboarding-actions-spacer" />
              <button type="button" className="onboarding-skip onboarding-skip--entire" onClick={skipEntireOnboarding} title={t.skipEntireOnboardingSub}>
                {t.skipEntireOnboarding}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
