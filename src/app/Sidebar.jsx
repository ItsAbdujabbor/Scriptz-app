import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import './Sidebar.css'
import '../components/ui/ui.css'
import { useSidebarStore } from '../stores/sidebarStore'
import { useThumbnailChatActivityStore } from '../stores/thumbnailChatActivityStore'
import { useShallow } from 'zustand/react/shallow'
import { emitShellEvent } from '../lib/shellEvents'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { SidebarButton, ConfirmDialog } from '../components/ui'
import { useCreditsQuery, useSubscriptionQuery } from '../queries/billing/creditsQueries'
import {
  useModelTierStateQuery,
  useSetModelTierMutation,
} from '../queries/modelTier/modelTierQueries'
import { openCreditsModal } from '../lib/creditsModalBus'
// Coach + Scripts chats are retired; the sidebar only surfaces Thumbnail
// conversations. These stubs keep the merge/render code below that still
// references the old mutation types working without any network calls.
const prefetchCoachConversation = () => {}
const useDeleteCoachConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
})
const useUpdateCoachConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
})
const prefetchScriptConversation = () => {}
const useDeleteScriptConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
})
const useUpdateScriptConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
})
import {
  prefetchThumbnailConversationCache,
  useThumbnailConversationsQuery,
  useDeleteThumbnailConversationMutation,
  useUpdateThumbnailConversationMutation,
} from '../queries/thumbnails/thumbnailQueries'
import logoSrc from '../assets/logo.jpg'

const IconDashboard = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)
const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
)
const IconBilling = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 15h4" />
  </svg>
)
const IconABTest = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20 L7.5 9 L11 20" />
    <path d="M5 16 h5.2" />
    <path d="M14 9 h3.5 a2.5 2.5 0 0 1 0 5 H14 z" />
    <path d="M14 14 h3.8 a2.5 2.5 0 0 1 0 5 H14 z" />
  </svg>
)
const IconFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
)
const IconPro = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
)
const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** Hide sidebar — panel + inward chevron (common in ChatGPT-style shells) */
const IconPanelCollapse = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.25" />
    <line x1="9.5" y1="5" x2="9.5" y2="19" />
    <path d="M15.5 10l-3 2 3 2" />
  </svg>
)

/** Show sidebar — mirror of collapse for the collapsed rail */
const IconPanelExpand = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="5" width="16" height="14" rx="2.25" />
    <line x1="14.5" y1="5" x2="14.5" y2="19" />
    <path d="M8.5 10l3 2-3 2" />
  </svg>
)

const IconCloseMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
)
const IconMessage = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const IconDots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)
const IconEdit = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L7 21l-4 1 1-4L16.5 3.5Z" />
  </svg>
)
const IconTrash = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)
const IconCheck = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 13 4 4L19 7" />
  </svg>
)
const IconX = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
)

const ScriptzMark = () => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
      <linearGradient
        id="scriptzMarkGradient"
        x1="6"
        y1="5"
        x2="26"
        y2="27"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#c4b5fd" />
        <stop offset="0.55" stopColor="#8b5cf6" />
        <stop offset="1" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="26" height="26" rx="9" fill="url(#scriptzMarkGradient)" />
    <path
      d="M20.4 10.6h-6.2c-1.7 0-2.8.87-2.8 2.18 0 1.3.96 1.83 2.62 2.17l2.22.46c1.07.22 1.56.48 1.56 1.08 0 .66-.6 1.08-1.67 1.08h-5.34"
      stroke="white"
      strokeWidth="2.15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="22.75" cy="11.25" r="1.6" fill="rgba(255,255,255,0.92)" />
  </svg>
)

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)
const IconCpu = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </svg>
)
const IconLogOut = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)
const IconUsage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20V10" />
    <path d="M18 20V4" />
    <path d="M6 20v-4" />
  </svg>
)
const IconNotifications = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)
const IconHelp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
)
const IconLogout = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

function getCoachConversationIdFromHash() {
  const hash = (typeof window !== 'undefined' && window.location.hash) || ''
  const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
  const [route, search = ''] = normalized.split('?')
  if (route !== 'coach') return null
  const params = new URLSearchParams(search)
  const rawId = params.get('id')
  return rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
}

function goToCoachConversation(conversationId = null) {
  window.location.hash = conversationId ? `#coach?id=${conversationId}` : '#coach'
}

function goToScriptConversation(conversationId = null) {
  window.location.hash = conversationId ? `#coach/scripts?id=${conversationId}` : '#coach/scripts'
}

function goToThumbnailConversation(conversationId = null) {
  window.location.hash = conversationId ? `#thumbnails?id=${conversationId}` : '#thumbnails'
}

function goToPro() {
  if (typeof window !== 'undefined') window.location.hash = 'pro'
}

// One-liner marketing blurb for the per-tier info popover. Kept short
// (no credit cost — that's shown elsewhere in the billing UI).
const MODEL_INFO = {
  'SRX-1': 'Our fastest model — quick drafts and idea exploration.',
  'SRX-2': 'A balanced everyday model — crisp detail, strong prompt fidelity.',
  'SRX-3': 'Our most powerful model — top clarity for hero thumbnails.',
}
const MODEL_TAG = { 'SRX-1': 'Lite', 'SRX-2': 'Pro', 'SRX-3': 'Ultra' }
// Display order in the account panel — Ultra on top, Lite at the bottom.
const MODEL_ORDER = { 'SRX-3': 0, 'SRX-2': 1, 'SRX-1': 2 }

// Single row in the model-tier picker. Owns its own hover state so the
// info popover can open on hover, and it portals the popover to <body>
// so the expanded panel's `overflow: hidden` can't clip it.
function ModelTierRow({
  tier,
  isActive,
  isLocked,
  tag,
  info,
  pinned,
  isBusy,
  onPick,
  onTogglePin,
}) {
  const infoBtnRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const open = !!(info && (pinned || hovered))
  const { popoverRef, style } = useFloatingPosition({
    triggerRef: infoBtnRef,
    open,
    placement: 'top-end',
    offset: 8,
    padding: 12,
  })

  return (
    <div
      className={[
        'sidebar-account-model__row',
        isActive ? 'sidebar-account-model__row--active' : '',
        isLocked ? 'sidebar-account-model__row--locked' : '',
        open ? 'sidebar-account-model__row--info-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={isActive}
        className="sidebar-account-model__row-main"
        onClick={onPick}
        disabled={isBusy}
      >
        <span className="sidebar-account-model__code">{tier.code}</span>
        <span className="sidebar-account-model__tag-sm">{tag}</span>
        <span className="sidebar-account-model__row-right" aria-hidden>
          {isLocked ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : isActive ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
        </span>
      </button>

      {info ? (
        <button
          ref={infoBtnRef}
          type="button"
          className="sidebar-account-model__info-btn"
          aria-label={`About ${tier.code} ${tag}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <circle cx="12" cy="8" r="0.6" fill="currentColor" />
          </svg>
        </button>
      ) : null}

      {info && open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="sidebar-account-model-info-pop"
              style={style}
              role="tooltip"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              {info}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

const IconScript = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
)

const IconThumbnail = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

const HistoryItem = memo(function HistoryItem({
  conversation,
  type,
  isActive,
  isEditing,
  editingTitle,
  setEditingTitle,
  submitConversationRename,
  cancelRenamingConversation,
  updateMutation,
  closeMobile,
  openHistoryMenu,
  isPending = false,
  isUnread = false,
}) {
  const queryClient = useQueryClient()
  const conversationId = conversation?.id
  const prefetchThread = useCallback(() => {
    if (conversationId == null) return
    if (type === 'thumbnail') void prefetchThumbnailConversationCache(queryClient, conversationId)
    else if (type === 'script') void prefetchScriptConversation(queryClient, conversationId)
    else void prefetchCoachConversation(queryClient, conversationId)
  }, [queryClient, conversationId, type])

  if (isEditing) {
    return (
      <div
        className={`sidebar-history-row sidebar-history-row--editing ${isActive ? 'is-active' : ''}`}
        role="listitem"
      >
        <form
          className="sidebar-history-edit-form"
          onSubmit={(e) => {
            e.preventDefault()
            submitConversationRename(conversation.id)
          }}
        >
          <input
            autoFocus
            className="sidebar-history-title-input"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelRenamingConversation()
            }}
          />
          <button
            type="submit"
            className="sidebar-history-edit-action"
            aria-label="Save title"
            disabled={updateMutation.isPending || !editingTitle.trim()}
          >
            <IconCheck />
          </button>
          <button
            type="button"
            className="sidebar-history-edit-action"
            aria-label="Cancel editing"
            onClick={cancelRenamingConversation}
          >
            <IconX />
          </button>
        </form>
      </div>
    )
  }

  const isThumbnail = type === 'thumbnail'
  const isScript = type === 'script'

  const rowClassName = [
    'sidebar-history-row',
    isActive ? 'is-active' : '',
    isPending ? 'is-pending' : '',
    isUnread && !isActive ? 'is-unread' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const displayTitle =
    conversation.title ||
    (isThumbnail ? 'Untitled thumbnails' : isScript ? 'Untitled script' : 'Untitled chat')

  const handleRowClick = () => {
    closeMobile()
    if (isThumbnail) goToThumbnailConversation(conversation.id)
    else if (isScript) goToScriptConversation(conversation.id)
    else goToCoachConversation(conversation.id)
  }

  const handleMenuClick = (e) => {
    // Stop the click from bubbling up to the row (which would navigate).
    e.stopPropagation()
    openHistoryMenu(conversation.id, type, e)
  }

  // Single-piece row: the outer container is itself the clickable
  // surface (div role=button), and the 3-dot menu is a child span
  // inside that same surface — not a sibling button. Result: the
  // selected background covers the whole row as one solid pill, with
  // the 3-dot sitting visibly *inside* it rather than next to it.
  return (
    <div
      role="button"
      tabIndex={0}
      className={rowClassName}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleRowClick()
        }
      }}
      onPointerEnter={prefetchThread}
      onFocus={prefetchThread}
      aria-current={isActive ? 'true' : undefined}
    >
      <span
        className={`sidebar-history-row__icon ${isThumbnail ? 'icon-thumbnail' : isScript ? 'icon-script' : 'icon-coach'}`}
        aria-hidden="true"
      >
        {isThumbnail ? <IconThumbnail /> : isScript ? <IconScript /> : <IconMessage />}
      </span>

      <span className="sidebar-history-row__title">{displayTitle}</span>

      {isPending ? (
        <span
          className="sidebar-history-row__status sidebar-history-row__status--pending"
          aria-label="Generating"
          title="Generating…"
        />
      ) : isUnread && !isActive ? (
        <span
          className="sidebar-history-row__status sidebar-history-row__status--unread"
          aria-label="New result ready"
          title="New result ready"
        />
      ) : null}

      <span
        role="button"
        tabIndex={0}
        className="sidebar-history-row__menu"
        aria-label={`Open actions for ${displayTitle}`}
        onClick={handleMenuClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleMenuClick(e)
          }
        }}
      >
        <IconDots />
      </span>
    </div>
  )
})

export function Sidebar({
  user,
  onOpenSettings,
  onLogout,
  currentScreen = 'dashboard',
  activeTab = 'coach',
  activeConversationId = null,
  activeScriptConversationId = null,
  activeThumbnailConversationId = null,
  onNewChat,
}) {
  const { collapsed, mobileOpen } = useSidebarStore(
    useShallow((state) => ({
      collapsed: state.collapsed,
      mobileOpen: state.mobileOpen,
    }))
  )
  // Account menu open state — owned locally for zero cross-component coupling.
  // (Previously lived in sidebarStore but a stale zustand closure could leave
  // subscribers un-rerendered; this is guaranteed to trigger a re-render.)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const toggleAccountDialog = () =>
    setAccountDialogOpen((o) => {
      if (o) {
        setModelTierOpen(false) // closing panel → reset nested model picker
        setOpenModelInfo(null) // and any pinned info popover
      }
      return !o
    })
  // Pinned info popover — click the (i) on a tier to keep its blurb open.
  // `null` means "follow hover only". Only one tier's info is open at a time.
  const [openModelInfo, setOpenModelInfo] = useState(null)
  // Nested collapsible inside the account panel — model-tier picker.
  // Closed by default, remembers its state while the panel stays open.
  const [modelTierOpen, setModelTierOpen] = useState(false)
  const { data: tierState } = useModelTierStateQuery()
  const setTierMutation = useSetModelTierMutation()
  const modelTiers =
    tierState?.tiers && tierState.tiers.length
      ? tierState.tiers
      : [
          { code: 'SRX-1', label: 'Lite', locked: false },
          { code: 'SRX-2', label: 'Pro', locked: false },
          { code: 'SRX-3', label: 'Ultra', locked: false },
        ]
  const currentTier = tierState?.selected || 'SRX-1'
  // Press feedback for the New Chat liquid-glass pill (mirrors SidebarButton).
  const [newChatPressing, setNewChatPressing] = useState(false)

  // History search + pagination
  const [historySearchOpen, setHistorySearchOpen] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyVisibleCount, setHistoryVisibleCount] = useState(50)
  const historySearchInputRef = useRef(null)
  useEffect(() => {
    if (historySearchOpen) {
      requestAnimationFrame(() => historySearchInputRef.current?.focus())
    }
  }, [historySearchOpen])
  // Subscription + credits state drive the sidebar plan label, credits count,
  // and Go Pro visibility.
  const { data: subscription } = useSubscriptionQuery()
  const { data: creditsData } = useCreditsQuery()
  const activeStatuses = ['active', 'trialing', 'past_due']
  const hasActivePlan = !!(subscription && activeStatuses.includes(subscription.status))
  const planLabel = (() => {
    if (!hasActivePlan) return 'Free'
    const name = subscription.plan_name || subscription.tier || 'Pro'
    const period =
      subscription.billing_period === 'year'
        ? ' · Annual'
        : subscription.billing_period === 'month'
          ? ''
          : ''
    const trialTag = subscription.is_trial ? ' · Trial' : ''
    return `${name[0].toUpperCase()}${name.slice(1)}${period}${trialTag}`
  })()
  const totalCredits = creditsData
    ? Number(creditsData.subscription_credits || 0) + Number(creditsData.permanent_credits || 0)
    : null
  const creditsLabel = (() => {
    if (totalCredits == null) return '—'
    if (totalCredits >= 10_000) {
      const k = totalCredits / 1000
      return `${k % 1 === 0 ? k : k.toFixed(1)}K`
    }
    return totalCredits.toLocaleString('en-US')
  })()
  // Store actions are stable refs — read once from getState() to avoid extra subscriptions
  const [{ setCollapsed, toggleCollapsed, setMobileOpen, closeMobile }] = useState(() =>
    useSidebarStore.getState()
  )
  const accountMenuPortalRef = useRef(null)
  const userBlockRef = useRef(null)
  const historyMenuRef = useRef(null)
  const [historyMenu, setHistoryMenu] = useState({ conversationId: null, type: null, x: 0, y: 0 })
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingConversationType, setEditingConversationType] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteChatDialogOpen, setDeleteChatDialogOpen] = useState(false)
  const [deleteChatConversationId, setDeleteChatConversationId] = useState(null)
  const [deleteChatConversationType, setDeleteChatConversationType] = useState(null)
  const prevCollapsedRef = useRef(collapsed)
  const [railExpandFade, setRailExpandFade] = useState(false)
  const [railCollapseSettle, setRailCollapseSettle] = useState(false)

  useEffect(() => {
    const wasCollapsed = prevCollapsedRef.current
    prevCollapsedRef.current = collapsed

    if (collapsed && !wasCollapsed) {
      setRailCollapseSettle(true) // eslint-disable-line react-hooks/set-state-in-effect -- intentional
      setRailExpandFade(false)
      const id = window.setTimeout(() => setRailCollapseSettle(false), 420)
      return () => window.clearTimeout(id)
    }

    if (!collapsed && wasCollapsed) {
      setRailCollapseSettle(false)
      setRailExpandFade(true)
      const id = window.setTimeout(() => setRailExpandFade(false), 420)
      return () => window.clearTimeout(id)
    }
  }, [collapsed])

  // Handler for the nested model-tier picker in the expanded account panel.
  // Locked tiers send the user to the paywall; unlocked tiers mutate
  // immediately (optimistic state lives in the hook).
  const handlePickTier = (t) => {
    if (t.code === currentTier) return
    if (t.locked) {
      setAccountDialogOpen(false)
      closeMobile()
      goToPro()
      return
    }
    setTierMutation.mutate(t.code)
  }

  /* Coach + Scripts chat tabs are hidden for now — only Thumbnails is exposed to
   * users. We skip the two extra queries to avoid needless network traffic and
   * only render thumbnail conversations in the history list below. */
  const coachConversationsQuery = { data: { items: [] }, isFetched: true }
  const scriptConversationsQuery = { data: { items: [] }, isFetched: true }
  const thumbnailConversationsQuery = useThumbnailConversationsQuery({ limit: 50 })
  // Pending generations + unread dots are a local concern — sourced from a
  // persisted zustand store so reload / tab switch preserves the state.
  const pendingConvs = useThumbnailChatActivityStore((s) => s.pending)
  const lastSeenAt = useThumbnailChatActivityStore((s) => s.lastSeenAt)
  const updateCoachMutation = useUpdateCoachConversationMutation()
  const deleteCoachMutation = useDeleteCoachConversationMutation()
  const updateScriptMutation = useUpdateScriptConversationMutation()
  const deleteScriptMutation = useDeleteScriptConversationMutation()
  const updateThumbnailMutation = useUpdateThumbnailConversationMutation()
  const deleteThumbnailMutation = useDeleteThumbnailConversationMutation()

  const coachItems = useMemo(
    () => coachConversationsQuery.data?.items || [],
    [coachConversationsQuery.data]
  )
  const scriptItems = useMemo(
    () => scriptConversationsQuery.data?.items || [],
    [scriptConversationsQuery.data]
  )
  const thumbnailItems = useMemo(
    () => thumbnailConversationsQuery.data?.items || [],
    [thumbnailConversationsQuery.data]
  )

  const mergedHistoryItems = useMemo(() => {
    const dateCache = new Map()
    const parseDate = (str) => {
      if (!str) return 0
      let v = dateCache.get(str)
      if (v === undefined) {
        v = new Date(str).getTime()
        dateCache.set(str, v)
      }
      return v
    }
    const withType = [
      ...coachItems.map((c) => ({
        ...c,
        _type: 'coach',
        _sortTs: parseDate(c.last_message_at || c.created_at),
      })),
      ...scriptItems.map((c) => ({
        ...c,
        _type: 'script',
        _sortTs: parseDate(c.last_message_at || c.created_at),
      })),
      ...thumbnailItems.map((c) => ({
        ...c,
        _type: 'thumbnail',
        _sortTs: parseDate(c.last_message_at || c.created_at),
      })),
    ]
    withType.sort((a, b) => b._sortTs - a._sortTs)
    return withType
  }, [coachItems, scriptItems, thumbnailItems])

  const allHistoryFetched =
    coachConversationsQuery.isFetched &&
    scriptConversationsQuery.isFetched &&
    thumbnailConversationsQuery.isFetched

  /** Empty + still waiting on at least one list — show skeleton. As soon as we have rows, show them (partial OK). */
  const isHistoryLoading = mergedHistoryItems.length === 0 && !allHistoryFetched

  // Close the inline account panel on Escape + outside click.
  useEffect(() => {
    if (!accountDialogOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setAccountDialogOpen(false)
    }
    const onDocClick = (e) => {
      const trigger = userBlockRef.current
      const panel = accountMenuPortalRef.current
      if (trigger?.contains(e.target) || panel?.contains(e.target)) return
      setAccountDialogOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDocClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [accountDialogOpen])

  useEffect(() => {
    if (!historyMenu.conversationId) return
    const handleClickOutside = (e) => {
      if (historyMenuRef.current?.contains(e.target)) return
      setHistoryMenu({ conversationId: null, type: null, x: 0, y: 0 })
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [historyMenu.conversationId])

  const openSettingsTo = (section) => {
    setAccountDialogOpen(false)
    closeMobile()
    onOpenSettings?.(section)
  }
  const handleNewChat = () => {
    closeMobile()
    setHistoryMenu({ conversationId: null, type: null, x: 0, y: 0 })
    setEditingConversationId(null)
    setEditingConversationType(null)
    setEditingTitle('')
    // Always land on Thumbnails first — Coach + Scripts are reachable
    // from the top tab bar inside the screen.
    goToThumbnailConversation(null)
    // Force a state reset even when the hash didn't change (user was
    // already on #thumbnails). `onNewChat` is the inline parent
    // callback; emitShellEvent is the global bus so any mounted Coach
    // screen also clears its draft / recording / messages.
    onNewChat?.()
    emitShellEvent('newChat')
  }

  const openHistoryMenu = (conversationId, type, event) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 184
    const menuHeight = 120
    setHistoryMenu({
      conversationId,
      type,
      x: Math.min(window.innerWidth - menuWidth - 12, rect.right + 8),
      y: Math.min(window.innerHeight - menuHeight - 12, Math.max(16, rect.top - 6)),
    })
  }

  const startRenamingConversation = (conversation, type) => {
    setHistoryMenu({ conversationId: null, type: null, x: 0, y: 0 })
    setEditingConversationId(conversation.id)
    setEditingConversationType(type)
    setEditingTitle(conversation.title || '')
  }

  const cancelRenamingConversation = () => {
    setEditingConversationId(null)
    setEditingConversationType(null)
    setEditingTitle('')
  }

  const submitConversationRename = async (conversationId) => {
    const nextTitle = editingTitle.trim()
    if (!nextTitle) return
    const type = editingConversationType
    const mutation =
      type === 'thumbnail'
        ? updateThumbnailMutation
        : type === 'script'
          ? updateScriptMutation
          : updateCoachMutation
    try {
      await mutation.mutateAsync({
        conversationId,
        payload: { title: nextTitle },
      })
      cancelRenamingConversation()
    } catch (error) {
      console.error('Failed to rename conversation', error)
    }
  }

  const openDeleteChatDialog = (conversationId, type) => {
    setHistoryMenu({ conversationId: null, type: null, x: 0, y: 0 })
    setDeleteChatConversationId(conversationId)
    setDeleteChatConversationType(type)
    setDeleteChatDialogOpen(true)
  }

  const closeDeleteChatDialog = useCallback(() => {
    setDeleteChatDialogOpen(false)
    setDeleteChatConversationId(null)
    setDeleteChatConversationType(null)
  }, [])

  /* Escape key for delete dialog is handled by ConfirmDialog component */

  const confirmDeleteConversation = async () => {
    const conversationId = deleteChatConversationId
    const type = deleteChatConversationType
    if (!conversationId) return
    closeDeleteChatDialog()
    const mutation =
      type === 'thumbnail'
        ? deleteThumbnailMutation
        : type === 'script'
          ? deleteScriptMutation
          : deleteCoachMutation
    try {
      await mutation.mutateAsync(conversationId)
      const isSelected =
        (type === 'thumbnail' &&
          Number(activeThumbnailConversationId) === Number(conversationId)) ||
        (type === 'script' && Number(activeScriptConversationId) === Number(conversationId)) ||
        (type === 'coach' &&
          Number(activeConversationId ?? getCoachConversationIdFromHash()) ===
            Number(conversationId))
      if (isSelected) handleNewChat()
    } catch (error) {
      console.error('Failed to delete conversation', error)
    }
  }

  const userInitial = (user?.email?.[0] || 'U').toUpperCase()

  // Expanded account panel. Lives inline with the collapsed email row — when
  // `accountDialogOpen` is true the row + panel animate open together as one
  // tall glass card. Contains: account actions (Account / Personas / Styles),
  // a nested collapsible "AI Model" section with the three SRX pills, and a
  // Log out pill pinned at the bottom.
  const activeTierLabel =
    modelTiers.find((t) => t.code === currentTier)?.label ||
    { 'SRX-1': 'Lite', 'SRX-2': 'Pro', 'SRX-3': 'Ultra' }[currentTier] ||
    'Lite'
  const accountPanel = (
    <div
      ref={accountMenuPortalRef}
      className={`sidebar-account-panel ${accountDialogOpen ? 'sidebar-account-panel--open' : ''}`}
      role="region"
      aria-hidden={!accountDialogOpen}
      aria-label="Account menu"
    >
      <div className="sidebar-account-panel__list">
        <button
          type="button"
          className="sidebar-account-item"
          onClick={() => openSettingsTo('account')}
        >
          <span className="sidebar-account-item-icon" aria-hidden>
            <IconSettings />
          </span>
          <span className="sidebar-account-item-label">Account</span>
        </button>
        {/* Nested collapsible — AI Model picker */}
        <div
          className={`sidebar-account-model ${modelTierOpen ? 'sidebar-account-model--open' : ''}`}
        >
          <button
            type="button"
            className="sidebar-account-item sidebar-account-model__toggle"
            onClick={() => setModelTierOpen((o) => !o)}
            aria-expanded={modelTierOpen}
            aria-controls="sidebar-account-model-pills"
          >
            <span className="sidebar-account-item-icon" aria-hidden>
              <IconCpu />
            </span>
            <span className="sidebar-account-item-label">AI Model</span>
            <span className="sidebar-account-model__tag">{activeTierLabel}</span>
            <span className="sidebar-account-model__chevron" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>

          <div
            id="sidebar-account-model-pills"
            className="sidebar-account-model__rows"
            role="radiogroup"
            aria-label="AI model tier"
          >
            {[...modelTiers]
              .sort((a, b) => (MODEL_ORDER[a.code] ?? 99) - (MODEL_ORDER[b.code] ?? 99))
              .map((t) => {
                const isActive = t.code === currentTier
                const isLocked = !!t.locked
                const tag = t.label || MODEL_TAG[t.code] || t.code
                const info = MODEL_INFO[t.code] || ''
                const pinned = openModelInfo === t.code
                const isBusy = setTierMutation.isPending && setTierMutation.variables === t.code
                return (
                  <ModelTierRow
                    key={t.code}
                    tier={t}
                    isActive={isActive}
                    isLocked={isLocked}
                    tag={tag}
                    info={info}
                    pinned={pinned}
                    isBusy={isBusy}
                    onPick={() => handlePickTier(t)}
                    onTogglePin={() => setOpenModelInfo(pinned ? null : t.code)}
                  />
                )
              })}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="sidebar-account-logout"
        onClick={async () => {
          setAccountDialogOpen(false)
          closeMobile()
          try {
            await onLogout?.()
          } catch {
            /* ignore — upstream already surfaces errors */
          }
        }}
      >
        <span className="sidebar-account-item-icon" aria-hidden>
          <IconLogOut />
        </span>
        <span className="sidebar-account-item-label">Log out</span>
      </button>
    </div>
  )

  return (
    <>
      <button
        type="button"
        className={`sidebar-open-btn ${mobileOpen ? 'sidebar-open-btn--hidden' : ''}`}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-hidden={mobileOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        aria-hidden={!mobileOpen}
        onClick={closeMobile}
      />

      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        role="navigation"
      >
        <div
          className={`sidebar-rail-stack${railExpandFade ? ' sidebar-rail-stack--expand-fade' : ''}${railCollapseSettle ? ' sidebar-rail-stack--collapse-settle' : ''}`}
        >
          <div className="sidebar-rail-card sidebar-rail-card--top">
            <header className="sidebar-header" role="region" aria-label="Sidebar header">
              <div className="sidebar-header-inner">
                <button
                  type="button"
                  className="sidebar-logo-avatar-btn"
                  onClick={() => {
                    setCollapsed(false)
                    closeMobile()
                  }}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <span className="sidebar-logo-avatar" aria-hidden>
                    <img src={logoSrc} alt="" className="sidebar-logo-img" />
                  </span>
                  <span className="sidebar-expand-icon" aria-hidden>
                    <IconPanelExpand />
                  </span>
                </button>
                <a
                  href="#dashboard"
                  className="sidebar-brand"
                  onClick={(e) => {
                    e.preventDefault()
                    closeMobile()
                  }}
                  aria-label="Scriptz AI Home"
                >
                  Scriptz AI
                </a>
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-expanded={!collapsed}
                >
                  <span className="sidebar-toggle-icon" aria-hidden>
                    <IconPanelCollapse />
                  </span>
                </button>
                <button
                  type="button"
                  className="sidebar-mobile-close-btn"
                  onClick={closeMobile}
                  aria-label="Close menu"
                >
                  <IconCloseMenu />
                </button>
              </div>
            </header>

            {/* Liquid-glass pill: New Chat — pinned to the top of the rail */}
            <button
              type="button"
              className={`sidebar-new-chat-pill ${collapsed ? 'sidebar-new-chat-pill--collapsed' : ''} ${newChatPressing ? 'is-pressing' : ''}`}
              onPointerDown={() => {
                setNewChatPressing(false)
                requestAnimationFrame(() => setNewChatPressing(true))
              }}
              onAnimationEnd={() => setNewChatPressing(false)}
              onClick={handleNewChat}
              aria-label="New chat"
              title="New chat"
            >
              <span className="sidebar-new-chat-pill-glow" aria-hidden />
              <span className="sidebar-new-chat-pill-icon" aria-hidden>
                <IconPlus />
              </span>
              {!collapsed && <span className="sidebar-new-chat-pill-label">New chat</span>}
            </button>

            <nav className="sidebar-nav sidebar-nav--primary" aria-label="Main navigation">
              <SidebarButton
                href="#dashboard"
                icon={<IconDashboard />}
                label="Dashboard"
                active={currentScreen === 'dashboard'}
                collapsed={collapsed}
                onClick={(e) => {
                  e.preventDefault()
                  closeMobile()
                  window.location.hash = 'dashboard'
                }}
              />

              <SidebarButton
                href="#optimize"
                icon={<IconChart />}
                label="Optimize"
                active={currentScreen === 'optimize'}
                collapsed={collapsed}
                onClick={(e) => {
                  e.preventDefault()
                  closeMobile()
                  window.location.hash = 'optimize'
                }}
              />

              <SidebarButton
                href="#ab-testing"
                icon={<IconABTest />}
                label="A/B Testing"
                active={currentScreen === 'ab-testing'}
                collapsed={collapsed}
                onClick={(e) => {
                  e.preventDefault()
                  closeMobile()
                  window.location.hash = 'ab-testing'
                }}
              />

              {/* Templates — next update
              <SidebarButton
                href="#templates"
                icon={<IconFolder />}
                label="Templates"
                active={currentScreen === 'templates'}
                collapsed={collapsed}
                onClick={(e) => {
                  e.preventDefault()
                  closeMobile()
                  window.location.hash = 'templates'
                }}
              /> */}

              {!hasActivePlan && (
                <button
                  type="button"
                  className={`sidebar-upgrade-pro ${currentScreen === 'pro' ? 'active' : ''} ${collapsed ? 'sidebar-upgrade-pro--collapsed' : ''}`}
                  onClick={() => {
                    closeMobile()
                    window.location.hash = 'pro'
                  }}
                  title="Go Pro"
                  aria-label="Go Pro"
                >
                  <span className="sidebar-upgrade-pro-icon" aria-hidden>
                    <IconPro />
                  </span>
                  <span className="sidebar-upgrade-pro-label">Go Pro</span>
                </button>
              )}
            </nav>
          </div>

          <div className="sidebar-rail-card sidebar-rail-card--bottom">
            <nav className="sidebar-nav sidebar-nav--history" aria-label="Chat history">
              <div className="sidebar-divider" aria-hidden />

              <div
                className={`sidebar-history-header ${historySearchOpen ? 'is-searching' : ''}`}
                style={{ position: 'relative' }}
              >
                <span className="sidebar-section-label">History</span>
                <button
                  type="button"
                  className="sidebar-history-search-btn"
                  onClick={() => setHistorySearchOpen(true)}
                  aria-label="Search chats"
                  title="Search chats"
                  style={{
                    opacity: historySearchOpen ? 0 : 1,
                    pointerEvents: historySearchOpen ? 'none' : 'auto',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </button>
                <div className="sidebar-history-search-wrap">
                  <div className="sidebar-history-search-field">
                    <input
                      ref={historySearchInputRef}
                      className="sidebar-history-search-input"
                      type="text"
                      placeholder="Search chats…"
                      value={historySearchQuery}
                      onChange={(e) => {
                        setHistorySearchQuery(e.target.value)
                        setHistoryVisibleCount(50)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setHistorySearchOpen(false)
                          setHistorySearchQuery('')
                        }
                      }}
                      aria-label="Search chats"
                    />
                  </div>
                  <button
                    type="button"
                    className="sidebar-history-search-close"
                    onClick={() => {
                      setHistorySearchOpen(false)
                      setHistorySearchQuery('')
                      setHistoryVisibleCount(50)
                    }}
                    aria-label="Close search"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="sidebar-history-list" role="list">
                {isHistoryLoading && (
                  <div
                    className="sidebar-history-skeleton sk-group"
                    role="status"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="sidebar-history-row sidebar-history-row--skeleton">
                        <span
                          className="sk"
                          style={{
                            width: `${60 + ((i * 13) % 30)}%`,
                            height: 14,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    ))}
                    <span className="sk-sr-only">Loading chat history</span>
                  </div>
                )}

                {!isHistoryLoading &&
                  (() => {
                    const q = historySearchQuery.trim().toLowerCase()
                    const filtered = q
                      ? mergedHistoryItems.filter((c) => (c.title || '').toLowerCase().includes(q))
                      : mergedHistoryItems
                    const visible = filtered.slice(0, historyVisibleCount)
                    const hasMore = filtered.length > historyVisibleCount

                    if (filtered.length === 0) {
                      return (
                        <div className="sidebar-history-empty">
                          <span className="sidebar-history-empty-icon" aria-hidden>
                            <IconFolder />
                          </span>
                          <span className="sidebar-history-empty-text">
                            {q ? 'No matches' : 'No chats yet'}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <>
                        {visible.map((conversation) => {
                          const isScript = conversation._type === 'script'
                          const isThumbnail = conversation._type === 'thumbnail'
                          const type = isThumbnail ? 'thumbnail' : isScript ? 'script' : 'coach'
                          const isActive = isThumbnail
                            ? currentScreen === 'coach' &&
                              activeTab === 'thumbnails' &&
                              Number(activeThumbnailConversationId) === Number(conversation.id)
                            : isScript
                              ? currentScreen === 'coach' &&
                                activeTab === 'scripts' &&
                                Number(activeScriptConversationId) === Number(conversation.id)
                              : currentScreen === 'coach' &&
                                activeTab === 'coach' &&
                                Number(activeConversationId ?? getCoachConversationIdFromHash()) ===
                                  Number(conversation.id)
                          const isEditing =
                            editingConversationId === conversation.id &&
                            editingConversationType === type
                          const updateMutation = isThumbnail
                            ? updateThumbnailMutation
                            : isScript
                              ? updateScriptMutation
                              : updateCoachMutation
                          const convKey = String(conversation.id)
                          const isPending = isThumbnail && Boolean(pendingConvs[convKey])
                          // Unread: last_message_at is newer than the local
                          // "last seen" stamp and we're not actively generating
                          // (a spinner wins over a dot).
                          let isUnread = false
                          if (isThumbnail && !isPending) {
                            const lastTs = conversation.last_message_at
                              ? Date.parse(conversation.last_message_at)
                              : 0
                            const seenTs = lastSeenAt[convKey] || 0
                            isUnread = Number.isFinite(lastTs) && lastTs > seenTs
                          }
                          return (
                            <HistoryItem
                              key={`${type}-${conversation.id}`}
                              conversation={conversation}
                              type={type}
                              isActive={isActive}
                              isEditing={isEditing}
                              editingTitle={editingTitle}
                              setEditingTitle={setEditingTitle}
                              submitConversationRename={submitConversationRename}
                              cancelRenamingConversation={cancelRenamingConversation}
                              updateMutation={updateMutation}
                              closeMobile={closeMobile}
                              openHistoryMenu={openHistoryMenu}
                              isPending={isPending}
                              isUnread={isUnread}
                            />
                          )
                        })}
                        {hasMore && (
                          <button
                            type="button"
                            className="sidebar-history-load-more"
                            onClick={() => setHistoryVisibleCount((n) => n + 50)}
                          >
                            Load 50 more ({filtered.length - historyVisibleCount} left)
                          </button>
                        )}
                      </>
                    )
                  })()}
              </div>
            </nav>

            <div className="sidebar-account-wrap">
              <button
                ref={userBlockRef}
                type="button"
                className={`sidebar-account-btn ${accountDialogOpen ? 'sidebar-account-btn--open' : ''}`}
                onClick={toggleAccountDialog}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={accountDialogOpen}
                title={collapsed && user?.email ? user.email : 'Account menu'}
              >
                <span className="sidebar-account-avatar">{userInitial}</span>
                <span className="sidebar-account-info">
                  <span className="sidebar-account-email">{user?.email || 'User'}</span>
                  <span className="sidebar-account-subline">
                    <span
                      className={`sidebar-account-plan ${hasActivePlan ? 'sidebar-account-plan--active' : ''} ${subscription?.is_trial ? 'sidebar-account-plan--trial' : ''}`}
                    >
                      {planLabel}
                    </span>
                    <button
                      type="button"
                      className="sidebar-account-credits"
                      onClick={(e) => {
                        e.stopPropagation()
                        openCreditsModal()
                      }}
                      aria-label={`${totalCredits ?? '—'} credits — buy more`}
                      title="Buy more credits"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                      <span className="sidebar-account-credits-num">{creditsLabel}</span>
                    </button>
                  </span>
                </span>
                <span className="sidebar-account-chevron" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>

              {accountPanel}
            </div>
          </div>
        </div>
      </aside>

      <div
        ref={historyMenuRef}
        className={`sidebar-portal-menu ${historyMenu.conversationId ? 'visible' : ''}`}
        style={{ top: `${historyMenu.y}px`, left: `${historyMenu.x}px` }}
        role="menu"
        aria-hidden={!historyMenu.conversationId}
      >
        {historyMenu.conversationId && historyMenu.type ? (
          <>
            <button
              type="button"
              className="floating-menu__item"
              onClick={() => {
                const items =
                  historyMenu.type === 'thumbnail'
                    ? thumbnailItems
                    : historyMenu.type === 'script'
                      ? scriptItems
                      : coachItems
                const conversation = items.find((item) => item.id === historyMenu.conversationId)
                if (conversation) startRenamingConversation(conversation, historyMenu.type)
              }}
            >
              <span className="floating-menu__icon">
                <IconEdit />
              </span>
              Rename
            </button>
            <button
              type="button"
              className="floating-menu__item floating-menu__item--danger"
              onClick={() => openDeleteChatDialog(historyMenu.conversationId, historyMenu.type)}
            >
              <span className="floating-menu__icon">
                <IconTrash />
              </span>
              Delete
            </button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteChatDialogOpen}
        title="Delete chat"
        description="Delete this chat permanently? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDeleteConversation}
        onCancel={closeDeleteChatDialog}
      />
    </>
  )
}
