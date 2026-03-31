import { useState, useEffect } from 'react'
import { getFrequencyLabel } from '../i18n/onboarding'
import './SettingsModal.css'
import { useSaveUserPreferencesMutation } from '../queries/user/preferencesQueries'
import { useUpdateUserProfileMutation } from '../queries/user/profileQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'

const THEME_KEY = 'scriptz_theme'

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'personalization', label: 'Personalization' },
  { id: 'billing', label: 'Billing' },
  { id: 'help', label: 'Help' },
]

const FREQUENCY_OPTIONS = [
  { value: 'daily', labelKey: 'daily' },
  { value: 'few_times', labelKey: 'few_times' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'occasionally', labelKey: 'occasionally' },
]

const TONE_OPTIONS = [
  { value: '', label: 'Select tone…' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'educational', label: 'Educational' },
]
const STYLE_OPTIONS = [
  { value: '', label: 'Select style…' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'formal', label: 'Formal' },
  { value: 'humorous', label: 'Humorous' },
  { value: 'direct', label: 'Direct' },
]
const CTA_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'direct', label: 'Direct' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'soft', label: 'Soft' },
]

function formatSubCount(n) {
  if (n == null || n === '') return null
  const num = typeof n === 'number' ? n : parseInt(String(n).replace(/\D/g, ''), 10)
  if (isNaN(num)) return String(n)
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

export function SettingsModal({
  open,
  onClose,
  initialSection = 'account',
  user,
  authLoading,
  changePassword,
  deleteData,
  deleteAccount,
  clearLocalData,
  youtube,
  youtubeChannels,
  youtubeLoading,
  youtubeOAuthError,
  setYoutubeOAuthError,
  onConnectYouTube,
  onDisconnectYouTube,
  onSwitchChannel,
  niche,
  videoFormat,
  uploadFrequency,
  preferredLanguage,
  setPreferredLanguage,
  getValidAccessToken,
  syncToBackend,
  setNiche,
  setVideoFormat,
  setUploadFrequency,
  preferredTone,
  speakingStyle,
  preferredCtaStyle,
  includePersonalStories,
  useFirstPerson,
  setPreferredTone,
  setSpeakingStyle,
  setPreferredCtaStyle,
  setIncludePersonalStories,
  setUseFirstPerson,
  onLogout,
  /** When true, password is not required to delete (e.g. Google / Supabase session). */
  accountDeletePasswordOptional = false,
}) {
  const [activeSection, setActiveSection] = useState(initialSection)

  const saveUserPreferencesMutation = useSaveUserPreferencesMutation()
  const updateUserProfileMutation = useUpdateUserProfileMutation()
  const userProfileQuery = useUserProfileQuery()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [deleteDataSuccess, setDeleteDataSuccess] = useState(false)
  const [deleteDataError, setDeleteDataError] = useState('')
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [deleteDataDialogOpen, setDeleteDataDialogOpen] = useState(false)
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false)
  const [deleteDataDialogConfirm, setDeleteDataDialogConfirm] = useState(false)
  const [deleteAccountDialogConfirm, setDeleteAccountDialogConfirm] = useState(false)
  const [deleteAccountDialogPassword, setDeleteAccountDialogPassword] = useState('')
  const [passwordSectionExpanded, setPasswordSectionExpanded] = useState(false)

  const [profileNiche, setProfileNiche] = useState(niche ?? '')
  const [profileFormat, setProfileFormat] = useState(videoFormat ?? '')
  const [profileFrequency, setProfileFrequency] = useState(uploadFrequency ?? '')
  const [personalizationSyncing, setPersonalizationSyncing] = useState(false)
  const [personalizationSaveSuccess, setPersonalizationSaveSuccess] = useState(false)
  const [personalizationSaveError, setPersonalizationSaveError] = useState('')
  const [personalizationTone, setPersonalizationTone] = useState(preferredTone ?? '')
  const [personalizationStyle, setPersonalizationStyle] = useState(speakingStyle ?? '')
  const [personalizationCta, setPersonalizationCta] = useState(preferredCtaStyle ?? '')
  const [personalizationIncludeStories, setPersonalizationIncludeStories] = useState(includePersonalStories !== false)
  const [personalizationUseFirstPerson, setPersonalizationUseFirstPerson] = useState(useFirstPerson !== false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [lastSavedPersonalization, setLastSavedPersonalization] = useState(null)

  const [theme, setThemeState] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return (v === 'light' || v === 'dark') ? v : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (_) {}
  }, [theme])

  useEffect(() => {
    if (open) {
      const n = niche ?? ''
      const f = uploadFrequency ?? ''
      const t = preferredTone ?? ''
      const s = speakingStyle ?? ''
      const c = preferredCtaStyle ?? ''
      const inc = includePersonalStories !== false
      const first = useFirstPerson !== false
      const bg = userProfileQuery.data?.background ?? ''
      setProfileNiche(n)
      setProfileFormat(videoFormat ?? '')
      setProfileFrequency(f)
      setPersonalizationTone(t)
      setPersonalizationStyle(s)
      setPersonalizationCta(c)
      setPersonalizationIncludeStories(inc)
      setPersonalizationUseFirstPerson(first)
      setCustomPrompt(bg)
      setLastSavedPersonalization({ niche: n, frequency: f, tone: t, style: s, cta: c, includeStories: inc, useFirstPerson: first, customPrompt: bg })
    }
  }, [open, niche, videoFormat, uploadFrequency, preferredTone, speakingStyle, preferredCtaStyle, includePersonalStories, useFirstPerson, userProfileQuery.data?.background])

  useEffect(() => {
    if (open) setActiveSection(initialSection)
  }, [open, initialSection])

  useEffect(() => {
    if (passwordError || passwordSuccess) setPasswordSectionExpanded(true)
  }, [passwordError, passwordSuccess])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    const result = changePassword ? await changePassword(currentPassword, newPassword) : { ok: false }
    if (result?.ok) {
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setPasswordError(result?.error || 'Failed to change password.')
    }
  }

  const handleDeleteData = async (e) => {
    e.preventDefault()
    setDeleteDataError('')
    setDeleteDataSuccess(false)
    if (!deleteDataDialogConfirm) {
      setDeleteDataError('Please confirm that you understand this action.')
      return
    }
    const result = deleteData ? await deleteData() : { ok: false }
    if (result?.ok) {
      clearLocalData?.()
      setDeleteDataSuccess(true)
      setDeleteDataDialogOpen(false)
      setDeleteDataDialogConfirm(false)
    } else {
      setDeleteDataError(result?.error || 'Failed to delete data.')
    }
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    setDeleteAccountError('')
    if (!accountDeletePasswordOptional && !deleteAccountDialogPassword?.trim()) {
      setDeleteAccountError('Please enter your password to confirm.')
      return
    }
    if (!deleteAccountDialogConfirm) {
      setDeleteAccountError('Please confirm that you understand this action cannot be undone.')
      return
    }
    const pwd = deleteAccountDialogPassword?.trim() || ''
    const result = deleteAccount ? await deleteAccount(pwd) : { ok: false }
    if (result?.ok) {
      setDeleteAccountDialogOpen(false)
      setDeleteAccountDialogConfirm(false)
      setDeleteAccountDialogPassword('')
      onClose?.()
      onLogout?.()
    } else {
      setDeleteAccountError(result?.error || 'Failed to delete account.')
    }
  }

  const openDeleteDataDialog = () => {
    setDeleteDataError('')
    setDeleteDataDialogConfirm(false)
    setDeleteDataDialogOpen(true)
  }

  const openDeleteAccountDialog = () => {
    setDeleteAccountError('')
    setDeleteAccountDialogConfirm(false)
    setDeleteAccountDialogPassword('')
    setDeleteAccountDialogOpen(true)
  }

  const handleSavePersonalization = async (e) => {
    e.preventDefault()
    setPersonalizationSaveError('')
    setPersonalizationSaveSuccess(false)
    setPersonalizationSyncing(true)
    try {
      setNiche?.(profileNiche.trim())
      setVideoFormat?.(profileFormat || '')
      setUploadFrequency?.(profileFrequency || '')
      setPreferredTone?.(personalizationTone)
      setSpeakingStyle?.(personalizationStyle)
      setPreferredCtaStyle?.(personalizationCta)
      setIncludePersonalStories?.(personalizationIncludeStories)
      setUseFirstPerson?.(personalizationUseFirstPerson)

      await Promise.all([
        saveUserPreferencesMutation.mutateAsync({
          preferredLanguage: preferredLanguage || 'en',
          niche: profileNiche.trim(),
          videoFormat: profileFormat || '',
          uploadFrequency: profileFrequency || '',
          youtube,
        }),
        updateUserProfileMutation.mutateAsync({
          niche: profileNiche.trim(),
          video_format: profileFormat || '',
          upload_frequency: profileFrequency || '',
          preferred_tone: personalizationTone || null,
          speaking_style: personalizationStyle || null,
          preferred_cta_style: personalizationCta || null,
          include_personal_stories: personalizationIncludeStories,
          use_first_person: personalizationUseFirstPerson,
          background: customPrompt.trim() || null,
        }),
      ])

      setPersonalizationSaveSuccess(true)
      setLastSavedPersonalization({
        niche: profileNiche.trim(),
        frequency: profileFrequency || '',
        tone: personalizationTone || '',
        style: personalizationStyle || '',
        cta: personalizationCta || '',
        includeStories: personalizationIncludeStories,
        useFirstPerson: personalizationUseFirstPerson,
        customPrompt: customPrompt.trim() || '',
      })
    } catch (err) {
      setPersonalizationSaveError(err?.message || 'Failed to save. Try again.')
    }
    setPersonalizationSyncing(false)
  }

  const hasPersonalizationChanges = lastSavedPersonalization
    ? (
        profileNiche.trim() !== lastSavedPersonalization.niche ||
        (profileFrequency || '') !== lastSavedPersonalization.frequency ||
        (personalizationTone || '') !== lastSavedPersonalization.tone ||
        (personalizationStyle || '') !== lastSavedPersonalization.style ||
        (personalizationCta || '') !== lastSavedPersonalization.cta ||
        personalizationIncludeStories !== lastSavedPersonalization.includeStories ||
        personalizationUseFirstPerson !== lastSavedPersonalization.useFirstPerson ||
        (customPrompt.trim() || '') !== lastSavedPersonalization.customPrompt
      )
    : true

  if (!open) return null

  return (
    <div
      className={`settings-modal-backdrop ${open ? 'visible' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-hidden={!open}
      role="presentation"
    >
      <div
        className="settings-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-modal-header">
          <h2 id="settings-modal-title" className="settings-modal-title">Settings</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="settings-modal-body">
          <nav className="settings-modal-sidebar" aria-label="Settings sections">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-modal-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                aria-current={activeSection === section.id ? 'true' : undefined}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="settings-modal-content">
            {/* ——— Account ——— */}
            <div className={`settings-modal-panel ${activeSection === 'account' ? 'active' : ''}`} role="tabpanel" aria-hidden={activeSection !== 'account'}>
              <h3 className="settings-panel-heading">Account</h3>
              <p className="settings-panel-desc">Email, YouTube, and security.</p>

              <div className="settings-block">
                <p className="settings-account-email"><strong>Email</strong> <span>{user?.email || '—'}</span></p>
              </div>

              <h4 className="settings-subheading">YouTube</h4>
              {youtubeOAuthError && (
                <div className="settings-message settings-message--error">
                  {youtubeOAuthError}
                  {setYoutubeOAuthError && <button type="button" className="settings-inline-dismiss" onClick={() => setYoutubeOAuthError(null)} aria-label="Dismiss">×</button>}
                </div>
              )}
              {!youtube?.connected ? (
                <div className="settings-youtube-connect-block">
                  <p className="settings-youtube-connect-desc">Connect your YouTube channel to unlock personalized insights and script generation.</p>
                  <button type="button" className="settings-btn settings-btn-primary" onClick={onConnectYouTube} disabled={youtubeLoading}>
                    {youtubeLoading ? 'Connecting…' : 'Connect YouTube Channel'}
                  </button>
                </div>
              ) : (
                <div className="settings-youtube-channels-list">
                  {((youtubeChannels && youtubeChannels.length > 0) ? youtubeChannels : [{
                    channel_id: youtube?.channelId || youtube?.channel_id,
                    channel_title: youtube?.channelName || youtube?.channel_title,
                    profile_image: youtube?.avatar,
                    avatar: youtube?.avatar,
                    subscriber_count: youtube?.subscriberCount ?? youtube?.subscriber_count,
                    subscriberCount: youtube?.subscriberCount ?? youtube?.subscriber_count,
                    video_count: youtube?.videoCount ?? youtube?.video_count,
                    videoCount: youtube?.videoCount ?? youtube?.video_count,
                  }]).map((c) => {
                    const cid = c.channel_id || c.channelId
                    const isActive = (youtube?.channelId || youtube?.channel_id) === cid
                    const channelName = c.channel_title || c.channelName || 'Channel'
                    const avatarUrl = c.profile_image || c.avatar || c.thumbnail_url || (isActive && youtube?.avatar) || (isActive && youtube?.profile_image)
                    return (
                      <div key={cid || 'current'} className={`settings-youtube-channel-card ${isActive ? 'active' : ''}`}>
                        <div className="settings-youtube-channel-avatar">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="settings-youtube-channel-avatar-initial">{(channelName)[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="settings-youtube-channel-info">
                          <strong>{c.channel_title || c.channelName || 'Channel'}</strong>
                          <span>
                            {formatSubCount(c.subscriber_count ?? c.subscriberCount) != null ? `${formatSubCount(c.subscriber_count ?? c.subscriberCount)} subscribers` : 'Connected'}
                            {(c.video_count ?? c.videoCount) != null && ` · ${c.video_count ?? c.videoCount} videos`}
                          </span>
                        </div>
                        <div className="settings-youtube-channel-actions">
                          {isActive ? (
                            <>
                              <span className="settings-youtube-badge">Active</span>
                              <button type="button" className="settings-btn settings-btn-ghost" onClick={onDisconnectYouTube} disabled={youtubeLoading} title="Disconnect">
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button type="button" className="settings-btn settings-btn-ghost" onClick={() => onSwitchChannel?.(cid)} disabled={youtubeLoading}>
                              Switch
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="settings-collapsible settings-password-section">
                <button
                  type="button"
                  className={`settings-collapsible-header ${passwordSectionExpanded ? 'expanded' : ''}`}
                  onClick={() => setPasswordSectionExpanded((v) => !v)}
                  aria-expanded={passwordSectionExpanded}
                  aria-controls="password-form-content"
                >
                  <span className="settings-collapsible-title">Change password</span>
                  <span className="settings-collapsible-chevron" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </span>
                </button>
                <div id="password-form-content" className={`settings-collapsible-content ${passwordSectionExpanded ? 'expanded' : ''}`} aria-hidden={!passwordSectionExpanded}>
                  {passwordSuccess && <p className="settings-message settings-message--success">Password updated successfully.</p>}
                  {passwordError && <p className="settings-message settings-message--error">{passwordError}</p>}
                  <form onSubmit={handleChangePassword} className="settings-form settings-password-form">
                    <div className="settings-password-fields">
                      <label>Current password</label>
                      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" required disabled={authLoading} />
                      <label>New password</label>
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required disabled={authLoading} />
                      <label>Confirm new password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" minLength={8} required disabled={authLoading} />
                    </div>
                    <button type="submit" className="settings-btn settings-btn-primary settings-password-submit" disabled={authLoading}>{authLoading ? 'Updating…' : 'Update password'}</button>
                  </form>
                </div>
              </div>

              <div className="settings-danger-zone">
                <h4 className="settings-danger-title">Danger zone</h4>
                {deleteDataSuccess && <p className="settings-message settings-message--success">Data deleted.</p>}
                <div className="settings-danger-block">
                  <p className="settings-danger-desc">Clear preferences and stored data. Your account will remain, but all personalization and stored data will be removed.</p>
                  <button type="button" className="settings-btn settings-btn-secondary" onClick={openDeleteDataDialog} disabled={authLoading}>
                    Delete my data
                  </button>
                </div>
                <div className="settings-danger-block">
                  <p className="settings-danger-desc">Permanently delete your account. This action cannot be undone. All data will be lost.</p>
                  <button type="button" className="settings-btn settings-btn-danger" onClick={openDeleteAccountDialog} disabled={authLoading}>
                    Delete account
                  </button>
                </div>
              </div>

              {/* Delete data confirmation dialog */}
              {deleteDataDialogOpen && (
                <div className="settings-confirm-dialog-backdrop" onClick={() => setDeleteDataDialogOpen(false)} role="presentation">
                  <div className="settings-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-data-dialog-title">
                    <h3 id="delete-data-dialog-title" className="settings-confirm-dialog-title">Delete my data</h3>
                    <p className="settings-confirm-dialog-desc">This will clear your preferences, niche, tone, and other stored data. Your account will remain. This cannot be undone.</p>
                    {deleteDataError && <p className="settings-message settings-message--error">{deleteDataError}</p>}
                    <form onSubmit={handleDeleteData} className="settings-form">
                      <label className="settings-confirm-checkbox">
                        <input type="checkbox" checked={deleteDataDialogConfirm} onChange={(e) => setDeleteDataDialogConfirm(e.target.checked)} disabled={authLoading} />
                        <span className="settings-confirm-checkbox-box" aria-hidden />
                        <span className="settings-confirm-checkbox-text">I understand that my data will be permanently deleted</span>
                      </label>
                      <div className="settings-confirm-dialog-actions">
                        <button type="button" className="settings-btn settings-btn-ghost" onClick={() => setDeleteDataDialogOpen(false)}>Cancel</button>
                        <button type="submit" className="settings-btn settings-btn-danger" disabled={authLoading || !deleteDataDialogConfirm}>Delete my data</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Delete account confirmation dialog */}
              {deleteAccountDialogOpen && (
                <div className="settings-confirm-dialog-backdrop" onClick={() => setDeleteAccountDialogOpen(false)} role="presentation">
                  <div className="settings-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-account-dialog-title">
                    <h3 id="delete-account-dialog-title" className="settings-confirm-dialog-title">Delete account</h3>
                    <p className="settings-confirm-dialog-desc">This will permanently delete your account and all associated data. This action cannot be undone.</p>
                    {deleteAccountError && <p className="settings-message settings-message--error">{deleteAccountError}</p>}
                    <form onSubmit={handleDeleteAccount} className="settings-form">
                      <label>
                        {accountDeletePasswordOptional
                          ? 'Password (optional if you sign in with Google)'
                          : 'Enter your password to confirm'}
                      </label>
                      <input type="password" value={deleteAccountDialogPassword} onChange={(e) => setDeleteAccountDialogPassword(e.target.value)} placeholder={accountDeletePasswordOptional ? 'Leave blank if you use Google' : 'Your password'} disabled={authLoading} autoComplete="current-password" className="settings-confirm-password-input" />
                      <label className="settings-confirm-checkbox">
                        <input type="checkbox" checked={deleteAccountDialogConfirm} onChange={(e) => setDeleteAccountDialogConfirm(e.target.checked)} disabled={authLoading} />
                        <span className="settings-confirm-checkbox-box" aria-hidden />
                        <span className="settings-confirm-checkbox-text">I understand this action is permanent and cannot be undone</span>
                      </label>
                      <div className="settings-confirm-dialog-actions">
                        <button type="button" className="settings-btn settings-btn-ghost" onClick={() => setDeleteAccountDialogOpen(false)}>Cancel</button>
                        <button type="submit" className="settings-btn settings-btn-danger" disabled={authLoading || (!accountDeletePasswordOptional && !deleteAccountDialogPassword?.trim()) || !deleteAccountDialogConfirm}>Delete account</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>

            {/* ——— Personalization (profile + tone, style, CTA, script voice) ——— */}
            <div className={`settings-modal-panel ${activeSection === 'personalization' ? 'active' : ''}`} role="tabpanel" aria-hidden={activeSection !== 'personalization'}>
              <h3 className="settings-panel-heading">Personalization</h3>
              <p className="settings-panel-desc">Customize how the AI writes your scripts and responds.</p>
              {personalizationSaveSuccess && <p className="settings-message settings-message--success">Saved.</p>}
              {personalizationSaveError && <p className="settings-message settings-message--error">{personalizationSaveError}</p>}
              {personalizationSyncing && <p className="settings-message settings-message--success">Saving…</p>}
              <form onSubmit={handleSavePersonalization} className="settings-form settings-personalization-form">
                <section className="settings-personalization-section">
                  <h4 className="settings-personalization-section-title">Profile</h4>
                  <p className="settings-personalization-section-desc">Basic info about your channel.</p>
                  <div className="settings-form-row-2">
                    <div className="settings-form-group">
                      <label htmlFor="personalization-niche">Niche</label>
                      <input id="personalization-niche" type="text" className="settings-input" value={profileNiche} onChange={(e) => setProfileNiche(e.target.value)} placeholder="e.g. Education, Tech, Lifestyle" />
                    </div>
                    <div className="settings-form-group">
                      <label htmlFor="personalization-frequency">Upload frequency</label>
                      <select id="personalization-frequency" className="settings-select" value={profileFrequency} onChange={(e) => setProfileFrequency(e.target.value)}>
                        <option value="">Select frequency</option>
                        {FREQUENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{getFrequencyLabel(preferredLanguage || 'en', opt.value)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section className="settings-personalization-section">
                  <h4 className="settings-personalization-section-title">Voice</h4>
                  <p className="settings-personalization-section-desc">Tone, style, and call-to-action for your scripts.</p>
                  <div className="settings-form-row-3">
                    <div className="settings-form-group">
                      <label htmlFor="personalization-tone">Tone</label>
                      <select id="personalization-tone" className="settings-select" value={personalizationTone} onChange={(e) => setPersonalizationTone(e.target.value)}>
                        {TONE_OPTIONS.map((opt) => <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    <div className="settings-form-group">
                      <label htmlFor="personalization-style">Style</label>
                      <select id="personalization-style" className="settings-select" value={personalizationStyle} onChange={(e) => setPersonalizationStyle(e.target.value)}>
                        {STYLE_OPTIONS.map((opt) => <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    <div className="settings-form-group">
                      <label htmlFor="personalization-cta">CTA style</label>
                      <select id="personalization-cta" className="settings-select" value={personalizationCta} onChange={(e) => setPersonalizationCta(e.target.value)}>
                        {CTA_OPTIONS.map((opt) => <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </div>
                </section>

                <section className="settings-personalization-section">
                  <h4 className="settings-personalization-section-title">Custom AI instructions</h4>
                  <p className="settings-personalization-section-desc">Extra rules the AI will follow. Be specific for best results.</p>
                  <div className="settings-form-group">
                    <textarea
                      id="personalization-custom-prompt"
                      className="settings-textarea"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g. Always use British spelling. Avoid jargon. Keep sentences short. Reference my expertise in marketing when relevant."
                      rows={3}
                    />
                  </div>
                </section>

                <section className="settings-personalization-section settings-script-voice-section">
                  <h4 className="settings-personalization-section-title">Script voice preferences</h4>
                  <p className="settings-personalization-section-desc">Control how personal and direct your scripts sound.</p>
                  <div className="settings-script-voice-options">
                    <label className={`settings-script-voice-option ${personalizationIncludeStories ? 'is-on' : ''}`}>
                      <input type="checkbox" checked={personalizationIncludeStories} onChange={(e) => setPersonalizationIncludeStories(e.target.checked)} className="settings-script-voice-input" />
                      <span className="settings-script-voice-icon" aria-hidden>📖</span>
                      <div className="settings-script-voice-body">
                        <span className="settings-script-voice-title">Personal anecdotes</span>
                        <span className="settings-script-voice-desc">Include real-life stories and examples in your scripts to build connection with viewers</span>
                        <span className="settings-script-voice-example">e.g. &quot;Last week I tried this and here&apos;s what happened…&quot;</span>
                      </div>
                      <div className="settings-script-voice-toggle-wrap">
                        <span className="settings-script-voice-status">{personalizationIncludeStories ? 'On' : 'Off'}</span>
                        <span className="settings-script-voice-slider" />
                      </div>
                    </label>
                    <label className={`settings-script-voice-option ${personalizationUseFirstPerson ? 'is-on' : ''}`}>
                      <input type="checkbox" checked={personalizationUseFirstPerson} onChange={(e) => setPersonalizationUseFirstPerson(e.target.checked)} className="settings-script-voice-input" />
                      <span className="settings-script-voice-icon" aria-hidden>✍️</span>
                      <div className="settings-script-voice-body">
                        <span className="settings-script-voice-title">First person (&quot;I&quot;)</span>
                        <span className="settings-script-voice-desc">Use &quot;I&quot; and &quot;my&quot; instead of third person for a more personal, direct tone</span>
                        <span className="settings-script-voice-example">e.g. &quot;I recommend…&quot; instead of &quot;The creator recommends…&quot;</span>
                      </div>
                      <div className="settings-script-voice-toggle-wrap">
                        <span className="settings-script-voice-status">{personalizationUseFirstPerson ? 'On' : 'Off'}</span>
                        <span className="settings-script-voice-slider" />
                      </div>
                    </label>
                  </div>
                </section>

                <button type="submit" className="settings-btn settings-btn-primary" disabled={personalizationSyncing || !hasPersonalizationChanges}>{personalizationSyncing ? 'Saving…' : 'Save'}</button>
              </form>
            </div>

            {/* ——— Billing ——— */}
            <div className={`settings-modal-panel ${activeSection === 'billing' ? 'active' : ''}`} role="tabpanel" aria-hidden={activeSection !== 'billing'}>
              <h3 className="settings-panel-heading">Billing</h3>
              <p className="settings-panel-desc">Plan and payment.</p>
              <p className="settings-coming-soon">Coming soon</p>
            </div>

            {/* ——— Help ——— */}
            <div className={`settings-modal-panel ${activeSection === 'help' ? 'active' : ''}`} role="tabpanel" aria-hidden={activeSection !== 'help'}>
              <h3 className="settings-panel-heading">Help</h3>
              <p className="settings-panel-desc">Resources, support, and legal.</p>
              <div className="settings-help-section">
                <h4 className="settings-help-section-title">Resources</h4>
                <div className="settings-help-links">
                  <a href="#help" className="settings-help-link">Help center</a>
                  <a href="mailto:support@scriptz.ai" className="settings-help-link">Contact support</a>
                  <a href="https://scriptz.ai/docs" target="_blank" rel="noopener noreferrer" className="settings-help-link">Documentation</a>
                </div>
              </div>
              <div className="settings-help-section">
                <h4 className="settings-help-section-title">Legal</h4>
                <div className="settings-help-links">
                  <a href="#privacy" className="settings-help-link">Privacy policy</a>
                  <a href="#terms" className="settings-help-link">Terms of service</a>
                </div>
              </div>
              <div className="settings-help-faq">
                <h4 className="settings-help-section-title">FAQ</h4>
                <div className="settings-help-faq-item">
                  <strong>How do I connect my YouTube channel?</strong>
                  <p>Go to Account → YouTube and click &quot;Connect YouTube Channel&quot;. You&apos;ll be redirected to authorize Scriptz to access your channel data.</p>
                </div>
                <div className="settings-help-faq-item">
                  <strong>What does the AI Coach use my data for?</strong>
                  <p>Your profile, niche, and preferences help the AI generate personalized scripts and advice tailored to your channel and style.</p>
                </div>
                <div className="settings-help-faq-item">
                  <strong>Can I use multiple YouTube channels?</strong>
                  <p>Yes. Connect your first channel, then connect additional channels from the same Google account. Switch between them in Account → YouTube.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
