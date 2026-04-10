import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import './Sidebar.css'
import '../components/ui/ui.css'
import { useSidebarStore } from '../stores/sidebarStore'
import { useShallow } from 'zustand/react/shallow'
import {
  SidebarButton,
  SidebarDropdown,
  ConfirmDialog,
  FloatingMenu,
  LiquidGlass,
} from '../components/ui'
import {
  prefetchCoachConversation,
  useCoachConversationsQuery,
  useDeleteCoachConversationMutation,
  useUpdateCoachConversationMutation,
} from '../queries/coach/coachQueries'
// Script queries — next update (moved to src/next-update-ideas/ScriptGenerator)
// import { prefetchScriptConversation, useScriptConversationsQuery, useDeleteScriptConversationMutation, useUpdateScriptConversationMutation } from '../queries/scripts/scriptQueries'
const useScriptConversationsQuery = () => ({ data: null, isFetched: true }) // next update stub
const prefetchScriptConversation = () => {} // next update stub
const useDeleteScriptConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
}) // next update stub
const useUpdateScriptConversationMutation = () => ({
  mutateAsync: async () => {},
  isPending: false,
}) // next update stub
import {
  prefetchThumbnailConversationCache,
  useThumbnailConversationsQuery,
  useDeleteThumbnailConversationMutation,
  useUpdateThumbnailConversationMutation,
} from '../queries/thumbnails/thumbnailQueries'
import {
  coachPrefill,
  hashWithPrefill,
  scriptPrefill,
  thumbPrefill,
} from '../lib/dashboardActionPayload'
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
const IconWrench = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
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
const IconPersonalization = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3a9 9 0 0 0 9 9c0-5-4-9-9-9z" />
    <path d="M12 12a9 9 0 0 0 9 9" />
    <path d="M12 12a9 9 0 0 1-9 9" />
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
const TOOLKIT_ITEMS = [
  // { label: 'Script Generator', id: 'script-generator' }, // next update
  { label: 'Thumbnail Generator', id: 'thumbnail-generator' },
  { label: 'Rate Thumbnails', id: 'thumbnail-rate' },
  { label: 'Title Generator', id: 'title-generator' },
]

function getToolkitHash(toolId) {
  switch (toolId) {
    case 'script-generator':
      return `#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: null, pillar: 'Next video', score: null }))}`
    case 'thumbnail-generator':
      return `#${hashWithPrefill('coach/thumbnails', thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null }))}`
    case 'thumbnail-rate':
      return '#coach/thumbnails?view=analyze'
    case 'title-generator':
      return `#${hashWithPrefill(
        'coach',
        coachPrefill(
          'Titles',
          null,
          'Generate 10 YouTube title ideas I can test. Mix curiosity, specificity, and clear benefits; add a one-line rationale per title.'
        )
      )}`
    default:
      return '#dashboard'
  }
}

function navigateToHashHref(href) {
  const raw = String(href || '').replace(/^#/, '')
  if (!raw) return
  window.location.hash = raw
}

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
  window.location.hash = conversationId
    ? `#coach/thumbnails?id=${conversationId}`
    : '#coach/thumbnails'
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
      <div className={`sidebar-history-item ${isActive ? 'active' : ''}`} role="listitem">
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

  return (
    <div className={`sidebar-history-item ${isActive ? 'active' : ''}`} role="listitem">
      <button
        type="button"
        className="sidebar-history-item-main"
        onPointerEnter={prefetchThread}
        onFocus={prefetchThread}
        onClick={() => {
          closeMobile()
          if (isThumbnail) goToThumbnailConversation(conversation.id)
          else if (isScript) goToScriptConversation(conversation.id)
          else goToCoachConversation(conversation.id)
        }}
      >
        <span
          className={`sidebar-history-item-icon ${isThumbnail ? 'icon-thumbnail' : isScript ? 'icon-script' : 'icon-coach'}`}
        >
          {isThumbnail ? <IconThumbnail /> : isScript ? <IconScript /> : <IconMessage />}
        </span>
        <span className="sidebar-history-item-title">
          {conversation.title ||
            (isThumbnail ? 'Untitled thumbnails' : isScript ? 'Untitled script' : 'Untitled chat')}
        </span>
      </button>
      <button
        type="button"
        className="sidebar-history-item-menu"
        aria-label={`Open actions for ${conversation.title || (isScript ? 'script' : 'chat')}`}
        onClick={(e) => openHistoryMenu(conversation.id, type, e)}
      >
        <IconDots />
      </button>
    </div>
  )
})

export function Sidebar({
  user,
  onOpenSettings,
  onOpenPersonas,
  onLogout,
  currentScreen = 'dashboard',
  activeTab = 'coach',
  activeConversationId = null,
  activeScriptConversationId = null,
  activeThumbnailConversationId = null,
  onNewChat,
}) {
  const { collapsed, mobileOpen, toolsExpanded, accountDialogOpen } = useSidebarStore(
    useShallow((state) => ({
      collapsed: state.collapsed,
      mobileOpen: state.mobileOpen,
      toolsExpanded: state.toolsExpanded,
      accountDialogOpen: state.accountDialogOpen,
    }))
  )
  // Store actions are stable refs — read once from getState() to avoid extra subscriptions
  const [
    {
      setCollapsed,
      toggleCollapsed,
      setMobileOpen,
      closeMobile,
      toggleToolsExpanded,
      toggleAccountDialog,
      setAccountDialogOpen,
    },
  ] = useState(() => useSidebarStore.getState())
  const accountMenuPortalRef = useRef(null)
  const userBlockRef = useRef(null)
  const [accountFlyoutPos, setAccountFlyoutPos] = useState({ top: 0, left: 0, width: 260 })
  const historyMenuRef = useRef(null)
  const [historyMenu, setHistoryMenu] = useState({ conversationId: null, type: null, x: 0, y: 0 })
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingConversationType, setEditingConversationType] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteChatDialogOpen, setDeleteChatDialogOpen] = useState(false)
  const [deleteChatConversationId, setDeleteChatConversationId] = useState(null)
  const [deleteChatConversationType, setDeleteChatConversationType] = useState(null)
  const [toolkitFlyoutOpen, setToolkitFlyoutOpen] = useState(false)
  const [narrowNavLayout, setNarrowNavLayout] = useState(false)
  const toolkitTriggerRef = useRef(null)
  const toolkitFlyoutRef = useRef(null)
  const [toolkitFlyoutPos, setToolkitFlyoutPos] = useState({ top: 0, left: 0 })
  const prevCollapsedRef = useRef(collapsed)
  const [railExpandFade, setRailExpandFade] = useState(false)
  const [railCollapseSettle, setRailCollapseSettle] = useState(false)

  useEffect(() => {
    const wasCollapsed = prevCollapsedRef.current
    prevCollapsedRef.current = collapsed

    if (collapsed && !wasCollapsed) {
      setRailCollapseSettle(true)
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

  /* Omit is_active filter so history matches Script/Thumbnail lists (show all conversations). */
  const coachConversationsQuery = useCoachConversationsQuery({ limit: 50 })
  const scriptConversationsQuery = useScriptConversationsQuery({ limit: 50 })
  const thumbnailConversationsQuery = useThumbnailConversationsQuery({ limit: 50 })
  const updateCoachMutation = useUpdateCoachConversationMutation()
  const deleteCoachMutation = useDeleteCoachConversationMutation()
  const updateScriptMutation = useUpdateScriptConversationMutation()
  const deleteScriptMutation = useDeleteScriptConversationMutation()
  const updateThumbnailMutation = useUpdateThumbnailConversationMutation()
  const deleteThumbnailMutation = useDeleteThumbnailConversationMutation()

  const isScriptsTab = currentScreen === 'coach' && activeTab === 'scripts'
  const isThumbnailsTab = currentScreen === 'coach' && activeTab === 'thumbnails'
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

  const isNewChatActive =
    currentScreen === 'coach' &&
    ((activeTab === 'coach' && !(activeConversationId ?? getCoachConversationIdFromHash())) ||
      (activeTab === 'scripts' &&
        (activeScriptConversationId == null || activeScriptConversationId === '')) ||
      (activeTab === 'thumbnails' &&
        (activeThumbnailConversationId == null || activeThumbnailConversationId === '')))

  /* Outside-click and Escape for account menu are handled by FloatingMenu component */

  // Close toolkit flyout when account dialog opens (avoids two menus open)
  useEffect(() => {
    if (accountDialogOpen) setToolkitFlyoutOpen(false) // eslint-disable-line react-hooks/set-state-in-effect -- intentional
  }, [accountDialogOpen])

  useLayoutEffect(() => {
    if (!accountDialogOpen) return
    const measure = () => {
      const trigger = userBlockRef.current
      const menu = accountMenuPortalRef.current
      if (!trigger || !menu) return
      const tr = trigger.getBoundingClientRect()
      const mw = Math.min(260, window.innerWidth - 16)
      const mh = menu.offsetHeight
      let left = tr.left
      if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8)
      else left = Math.max(8, left)
      let top = tr.top - mh - 10
      if (top < 8) top = tr.bottom + 10
      if (top + mh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - mh - 8)
      setAccountFlyoutPos({ top, left, width: mw })
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => measure())
    if (accountMenuPortalRef.current) ro.observe(accountMenuPortalRef.current)
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [accountDialogOpen, collapsed, user?.email])

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
  const handleOpenPersonas = () => {
    setAccountDialogOpen(false)
    closeMobile()
    onOpenPersonas?.()
  }
  const handleLogoutClick = () => {
    setAccountDialogOpen(false)
    closeMobile()
    onLogout?.()
  }

  const handleNewChat = () => {
    closeMobile()
    setHistoryMenu({ conversationId: null, type: null, x: 0, y: 0 })
    setEditingConversationId(null)
    setEditingConversationType(null)
    setEditingTitle('')
    onNewChat?.()
    if (isThumbnailsTab) goToThumbnailConversation(null)
    else if (isScriptsTab) goToScriptConversation(null)
    else goToCoachConversation(null)
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

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const update = () => setNarrowNavLayout(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const toolkitRailCollapsed = collapsed && !narrowNavLayout
  const toolkitMenuOpen = toolsExpanded || (toolkitRailCollapsed && toolkitFlyoutOpen)

  useLayoutEffect(() => {
    if (!toolkitFlyoutOpen || !toolkitRailCollapsed) return
    const measure = () => {
      const el = toolkitTriggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 10
      const flyoutW = 248
      const flyoutMaxH = 340
      let left = r.right + gap
      if (left + flyoutW > window.innerWidth - 8) {
        left = Math.max(8, r.left - flyoutW - gap)
      }
      const top = Math.min(Math.max(8, r.top - 4), Math.max(8, window.innerHeight - flyoutMaxH - 8))
      setToolkitFlyoutPos({ top, left })
    }
    measure()
    window.addEventListener('resize', measure, { passive: true })
    return () => window.removeEventListener('resize', measure)
  }, [toolkitFlyoutOpen, toolkitRailCollapsed])

  // Close toolkit flyout when rail expands or layout narrows
  useEffect(() => {
    if (!toolkitRailCollapsed) setToolkitFlyoutOpen(false) // eslint-disable-line react-hooks/set-state-in-effect -- intentional
  }, [toolkitRailCollapsed])
  useEffect(() => {
    if (narrowNavLayout) setToolkitFlyoutOpen(false) // eslint-disable-line react-hooks/set-state-in-effect -- intentional
  }, [narrowNavLayout])

  /* Outside-click and Escape for toolkit flyout are handled by FloatingMenu component */

  const handleToolkitTriggerClick = () => {
    setAccountDialogOpen(false)
    if (toolkitRailCollapsed) {
      setToolkitFlyoutOpen((o) => !o)
    } else {
      toggleToolsExpanded()
    }
  }

  const onToolkitItemNavigate = (href) => {
    closeMobile()
    setToolkitFlyoutOpen(false)
    navigateToHashHref(href)
  }

  const toolkitFlyoutPortal = (
    <FloatingMenu
      ref={toolkitFlyoutRef}
      open={toolkitRailCollapsed && toolkitFlyoutOpen}
      style={{ top: toolkitFlyoutPos.top, left: toolkitFlyoutPos.left }}
      triggerRef={toolkitTriggerRef}
      onClose={() => setToolkitFlyoutOpen(false)}
      aria-label="Toolkit"
    >
      {TOOLKIT_ITEMS.map(({ id, label }) => {
        const href = getToolkitHash(id)
        return (
          <a
            key={id}
            href={href}
            className="floating-menu__item"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault()
              onToolkitItemNavigate(href)
            }}
          >
            {label}
          </a>
        )
      })}
    </FloatingMenu>
  )

  const accountMenuPortal = (
    <FloatingMenu
      ref={accountMenuPortalRef}
      open={accountDialogOpen}
      style={{
        top: accountFlyoutPos.top,
        left: accountFlyoutPos.left,
        width: accountFlyoutPos.width,
      }}
      triggerRef={userBlockRef}
      onClose={() => setAccountDialogOpen(false)}
      aria-label="Account menu"
    >
      <button
        type="button"
        className="floating-menu__item"
        role="menuitem"
        onClick={() => openSettingsTo('account')}
      >
        <span className="floating-menu__icon">
          <IconSettings />
        </span>
        Settings
      </button>
      <button
        type="button"
        className="floating-menu__item"
        role="menuitem"
        onClick={() => openSettingsTo('personalization')}
      >
        <span className="floating-menu__icon">
          <IconPersonalization />
        </span>
        Personalization
      </button>
      <button
        type="button"
        className="floating-menu__item"
        role="menuitem"
        onClick={handleOpenPersonas}
      >
        <span className="floating-menu__icon">
          <IconPersonalization />
        </span>
        Personas
      </button>
      <button
        type="button"
        className="floating-menu__item"
        role="menuitem"
        onClick={() => openSettingsTo('billing')}
      >
        <span className="floating-menu__icon">
          <IconUser />
        </span>
        Billing
      </button>
      <button
        type="button"
        className="floating-menu__item"
        role="menuitem"
        onClick={() => openSettingsTo('help')}
      >
        <span className="floating-menu__icon">
          <IconHelp />
        </span>
        Help
      </button>
      <div className="floating-menu__divider" />
      <button
        type="button"
        className="floating-menu__item floating-menu__item--danger"
        onClick={handleLogoutClick}
      >
        <span className="floating-menu__icon">
          <IconLogout />
        </span>
        Log out
      </button>
      <div className="floating-menu__footer">
        <span className="floating-menu__footer-text">{user?.email || 'User'}</span>
        <span className="floating-menu__footer-sub">Free</span>
      </div>
    </FloatingMenu>
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

            <nav className="sidebar-nav sidebar-nav--primary" aria-label="Main navigation">
              <span className="sidebar-section-label">Main</span>

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
                href="#coach"
                icon={<IconPlus />}
                label="New Chat"
                active={isNewChatActive}
                collapsed={collapsed}
                aria-label="New chat"
                onClick={(e) => {
                  e.preventDefault()
                  handleNewChat()
                }}
              />

              <SidebarDropdown
                ref={toolkitTriggerRef}
                icon={<IconWrench />}
                label="Toolkit"
                expanded={toolkitMenuOpen}
                collapsed={collapsed && !narrowNavLayout}
                onToggle={handleToolkitTriggerClick}
                ariaControls={
                  toolkitRailCollapsed && toolkitFlyoutOpen
                    ? 'sidebar-toolkit-flyout-menu'
                    : 'sidebar-tools-content'
                }
                aria-label="Toolkit"
              >
                {TOOLKIT_ITEMS.map(({ id, label }) => {
                  const href = getToolkitHash(id)
                  return (
                    <a
                      key={id}
                      href={href}
                      className="sb-dropdown__link"
                      role="menuitem"
                      onClick={(e) => {
                        e.preventDefault()
                        onToolkitItemNavigate(href)
                      }}
                    >
                      {label}
                    </a>
                  )
                })}
              </SidebarDropdown>

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
            </nav>
          </div>

          <div className="sidebar-rail-card sidebar-rail-card--bottom">
            <nav className="sidebar-nav sidebar-nav--history" aria-label="Chat history">
              <div className="sidebar-divider" aria-hidden />

              <div className="sidebar-history-header">
                <span className="sidebar-section-label">History</span>
              </div>
              <div className="sidebar-history-list" role="list">
                {isHistoryLoading && (
                  <div className="sidebar-history-empty">
                    <span className="sidebar-history-empty-text">Loading…</span>
                  </div>
                )}

                {!isHistoryLoading && (
                  <>
                    {mergedHistoryItems.length === 0 ? (
                      <div className="sidebar-history-empty">
                        <span className="sidebar-history-empty-icon" aria-hidden>
                          <IconFolder />
                        </span>
                        <span className="sidebar-history-empty-text">
                          No chats yet. Start in AI Coach, Script Generator, or Thumbnail Generator.
                        </span>
                      </div>
                    ) : (
                      mergedHistoryItems.map((conversation) => {
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
                          />
                        )
                      })
                    )}
                  </>
                )}
              </div>
            </nav>

            <LiquidGlass className="sidebar-footer">
              <button
                ref={userBlockRef}
                type="button"
                className="sidebar-user-block"
                onClick={toggleAccountDialog}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={accountDialogOpen}
                title={collapsed && user?.email ? user.email : undefined}
              >
                <span className="sidebar-user-avatar-placeholder">{userInitial}</span>
                <span className="sidebar-user-info">
                  <span className="sidebar-user-email">{user?.email || 'User'}</span>
                  <span className="sidebar-user-plan">Free</span>
                </span>
              </button>
            </LiquidGlass>
          </div>
        </div>
      </aside>

      {toolkitFlyoutPortal}
      {accountMenuPortal}

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
