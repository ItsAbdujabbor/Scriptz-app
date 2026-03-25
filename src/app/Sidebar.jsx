import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './Sidebar.css'
import { useSidebarStore } from '../stores/sidebarStore'
import {
  useCoachConversationsQuery,
  useDeleteCoachConversationMutation,
  useUpdateCoachConversationMutation,
} from '../queries/coach/coachQueries'
import {
  useScriptConversationsQuery,
  useDeleteScriptConversationMutation,
  useUpdateScriptConversationMutation,
} from '../queries/scripts/scriptQueries'
import {
  useThumbnailConversationsQuery,
  useDeleteThumbnailConversationMutation,
  useUpdateThumbnailConversationMutation,
} from '../queries/thumbnails/thumbnailQueries'

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const IconWrench = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18l6-6-6-6" />
  </svg>
)
const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)
const IconMessage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L7 21l-4 1 1-4L16.5 3.5Z" />
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 13 4 4L19 7" />
  </svg>
)
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
)

const ScriptzMark = () => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="scriptzMarkGradient" x1="6" y1="5" x2="26" y2="27" gradientUnits="userSpaceOnUse">
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
  { label: 'Script Generator', id: 'script-generator' },
  { label: 'Thumbnail Generator', id: 'thumbnail-generator' },
  { label: 'Rate Thumbnails', id: 'thumbnail-rate' },
  { label: 'Title Generator', id: 'title-generator' },
  { label: 'Keyword Search', id: 'keyword-search' },
  { label: 'Niche Competitor Analyzer', id: 'niche-analyzer' },
]

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
  window.location.hash = conversationId ? `#coach/thumbnails?id=${conversationId}` : '#coach/thumbnails'
}

const IconScript = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
)

const IconThumbnail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

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
  const collapsed = useSidebarStore((state) => state.collapsed)
  const mobileOpen = useSidebarStore((state) => state.mobileOpen)
  const toolsExpanded = useSidebarStore((state) => state.toolsExpanded)
  const accountDialogOpen = useSidebarStore((state) => state.accountDialogOpen)
  const setCollapsed = useSidebarStore((state) => state.setCollapsed)
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed)
  const setMobileOpen = useSidebarStore((state) => state.setMobileOpen)
  const closeMobile = useSidebarStore((state) => state.closeMobile)
  const toggleToolsExpanded = useSidebarStore((state) => state.toggleToolsExpanded)
  const toggleAccountDialog = useSidebarStore((state) => state.toggleAccountDialog)
  const setAccountDialogOpen = useSidebarStore((state) => state.setAccountDialogOpen)
  const accountDialogRef = useRef(null)
  const userBlockRef = useRef(null)
  const historyMenuRef = useRef(null)
  const [historyMenu, setHistoryMenu] = useState({ conversationId: null, type: null, x: 0, y: 0 })
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingConversationType, setEditingConversationType] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteChatDialogOpen, setDeleteChatDialogOpen] = useState(false)
  const [deleteChatConversationId, setDeleteChatConversationId] = useState(null)
  const [deleteChatConversationType, setDeleteChatConversationType] = useState(null)

  const coachConversationsQuery = useCoachConversationsQuery({ limit: 50, isActive: true })
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
  const coachItems = useMemo(() => coachConversationsQuery.data?.items || [], [coachConversationsQuery.data])
  const scriptItems = useMemo(() => scriptConversationsQuery.data?.items || [], [scriptConversationsQuery.data])
  const thumbnailItems = useMemo(() => thumbnailConversationsQuery.data?.items || [], [thumbnailConversationsQuery.data])

  const mergedHistoryItems = useMemo(() => {
    const withType = [
      ...coachItems.map((c) => ({ ...c, _type: 'coach', _sortAt: c.last_message_at || c.created_at })),
      ...scriptItems.map((c) => ({ ...c, _type: 'script', _sortAt: c.last_message_at || c.created_at })),
      ...thumbnailItems.map((c) => ({ ...c, _type: 'thumbnail', _sortAt: c.last_message_at || c.created_at })),
    ]
    withType.sort((a, b) => {
      const aVal = a._sortAt ? new Date(a._sortAt).getTime() : 0
      const bVal = b._sortAt ? new Date(b._sortAt).getTime() : 0
      return bVal - aVal
    })
    return withType
  }, [coachItems, scriptItems, thumbnailItems])

  const selectedConversationId = isThumbnailsTab
    ? (activeThumbnailConversationId ?? null)
    : isScriptsTab
    ? (activeScriptConversationId ?? null)
    : (activeConversationId ?? getCoachConversationIdFromHash())

  const isHistoryLoading = coachConversationsQuery.isPending || scriptConversationsQuery.isPending || thumbnailConversationsQuery.isPending

  useEffect(() => {
    if (!accountDialogOpen) return
    const handleClickOutside = (e) => {
      if (
        accountDialogRef.current?.contains(e.target) ||
        userBlockRef.current?.contains(e.target)
      ) return
      setAccountDialogOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [accountDialogOpen, setAccountDialogOpen])

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
    const mutation = type === 'thumbnail' ? updateThumbnailMutation : type === 'script' ? updateScriptMutation : updateCoachMutation
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

  useEffect(() => {
    if (!deleteChatDialogOpen) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeDeleteChatDialog()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [deleteChatDialogOpen, closeDeleteChatDialog])

  const confirmDeleteConversation = async () => {
    const conversationId = deleteChatConversationId
    const type = deleteChatConversationType
    if (!conversationId) return
    closeDeleteChatDialog()
    const mutation = type === 'thumbnail' ? deleteThumbnailMutation : type === 'script' ? deleteScriptMutation : deleteCoachMutation
    try {
      await mutation.mutateAsync(conversationId)
      const isSelected = (type === 'thumbnail' && Number(activeThumbnailConversationId) === Number(conversationId)) ||
        (type === 'script' && Number(activeScriptConversationId) === Number(conversationId)) ||
        (type === 'coach' && Number(activeConversationId ?? getCoachConversationIdFromHash()) === Number(conversationId))
      if (isSelected) handleNewChat()
    } catch (error) {
      console.error('Failed to delete conversation', error)
    }
  }

  const userInitial = (user?.email?.[0] || 'U').toUpperCase()

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
        <header className="sidebar-header" role="region" aria-label="Sidebar header">
          <div className="sidebar-header-inner">
            <button
              type="button"
              className="sidebar-logo-avatar-btn"
              onClick={() => { setCollapsed(false); closeMobile() }}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span className="sidebar-logo-avatar" aria-hidden>
                <span className="sidebar-logo-glyph">
                  <ScriptzMark />
                </span>
                <span className="sidebar-logo-placeholder">S</span>
              </span>
              <span className="sidebar-expand-icon" aria-hidden>
                <IconChevronRight />
              </span>
            </button>
            <a href="#dashboard" className="sidebar-brand" onClick={(e) => { e.preventDefault(); closeMobile() }} aria-label="Scriptz AI Home">
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
                <IconChevronLeft />
              </span>
            </button>
          </div>
        </header>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Main</span>

          <a
            href="#dashboard"
            className={`sidebar-link ${currentScreen === 'dashboard' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); closeMobile(); window.location.hash = 'dashboard' }}
          >
            <span className="sidebar-icon"><IconDashboard /></span>
            <span className="sidebar-label">Dashboard</span>
          </a>

          <a
            href="#coach"
            className={`sidebar-link ${currentScreen === 'coach' && !selectedConversationId ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleNewChat() }}
            aria-label="New chat"
          >
            <span className="sidebar-icon"><IconPlus /></span>
            <span className="sidebar-label">New Chat</span>
          </a>

          <div className={`sidebar-dropdown ${toolsExpanded ? 'expanded' : ''}`} role="group" aria-label="Toolkit">
            <button
              type="button"
              className="sidebar-dropdown-trigger"
              onClick={toggleToolsExpanded}
              aria-expanded={toolsExpanded}
              aria-controls="sidebar-tools-content"
            >
              <span className="sidebar-icon"><IconWrench /></span>
              <span className="sidebar-label">Toolkit</span>
              <span className="sidebar-dropdown-chevron" aria-hidden>
                <IconChevronDown />
              </span>
            </button>
            <div className="sidebar-dropdown-content" id="sidebar-tools-content" role="menu">
              {TOOLKIT_ITEMS.map(({ id, label }) => (
                <a key={id} href="#dashboard" className="sidebar-sub-link" role="menuitem" onClick={(e) => { e.preventDefault(); closeMobile(); window.location.hash = 'dashboard' }}>
                  {label}
                </a>
              ))}
            </div>
          </div>

          <a
            href="#optimize"
            className={`sidebar-link ${currentScreen === 'optimize' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); closeMobile(); window.location.hash = 'optimize' }}
          >
            <span className="sidebar-icon"><IconChart /></span>
            <span className="sidebar-label">Optimize</span>
          </a>

          <a
            href="#library"
            className={`sidebar-link ${currentScreen === 'library' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); closeMobile(); window.location.hash = 'library' }}
          >
            <span className="sidebar-icon"><IconFolder /></span>
            <span className="sidebar-label">Library</span>
          </a>

          <button
            type="button"
            className={`sidebar-upgrade-pro ${currentScreen === 'pro' ? 'active' : ''}`}
            onClick={() => { closeMobile(); window.location.hash = 'pro' }}
            title="Go Pro"
            aria-label="Go Pro"
          >
            <span className="sidebar-upgrade-pro-icon" aria-hidden><IconPro /></span>
            <span className="sidebar-upgrade-pro-label">Go Pro</span>
          </button>

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
                    <span className="sidebar-history-empty-icon" aria-hidden><IconFolder /></span>
                    <span className="sidebar-history-empty-text">No chats yet. Start in AI Coach, Script Generator, or Thumbnail Generator.</span>
                  </div>
                ) : (
                  mergedHistoryItems.map((conversation) => {
                    const isScript = conversation._type === 'script'
                    const isThumbnail = conversation._type === 'thumbnail'
                    const type = isThumbnail ? 'thumbnail' : isScript ? 'script' : 'coach'
                    const isActive = isThumbnail
                      ? (currentScreen === 'coach' && activeTab === 'thumbnails' && Number(activeThumbnailConversationId) === Number(conversation.id))
                      : isScript
                        ? (currentScreen === 'coach' && Number(activeScriptConversationId) === Number(conversation.id))
                        : (currentScreen === 'coach' && Number(activeConversationId ?? getCoachConversationIdFromHash()) === Number(conversation.id))
                    const isEditing = editingConversationId === conversation.id && editingConversationType === type
                    const updateMutation = isThumbnail ? updateThumbnailMutation : isScript ? updateScriptMutation : updateCoachMutation
                    return (
                      <div
                        key={`${type}-${conversation.id}`}
                        className={`sidebar-history-item ${isActive ? 'active' : ''}`}
                        role="listitem"
                      >
                        {isEditing ? (
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
                        ) : (
                          <>
                            <button
                              type="button"
                              className="sidebar-history-item-main"
                              onClick={() => {
                                closeMobile()
                                if (isThumbnail) goToThumbnailConversation(conversation.id)
                                else if (isScript) goToScriptConversation(conversation.id)
                                else goToCoachConversation(conversation.id)
                              }}
                            >
                              <span className={`sidebar-history-item-icon ${isThumbnail ? 'icon-thumbnail' : isScript ? 'icon-script' : 'icon-coach'}`}>
                                {isThumbnail ? <IconThumbnail /> : isScript ? <IconScript /> : <IconMessage />}
                              </span>
                              <span className="sidebar-history-item-title">
                                {conversation.title || (isThumbnail ? 'Untitled thumbnails' : isScript ? 'Untitled script' : 'Untitled chat')}
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
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div
            ref={accountDialogRef}
            className={`sidebar-account-dialog sidebar-account-dialog--inside ${accountDialogOpen ? 'visible' : ''} ${collapsed ? 'collapsed' : ''}`}
            role="menu"
            aria-label="Account menu"
            aria-hidden={!accountDialogOpen}
          >
            {onOpenSettings ? (
              <>
                <button type="button" className="dialog-item" role="menuitem" onClick={() => openSettingsTo('account')}>
                  <span className="dialog-item-icon"><IconSettings /></span>
                  Settings
                </button>
                <button type="button" className="dialog-item" role="menuitem" onClick={() => openSettingsTo('personalization')}>
                  <span className="dialog-item-icon"><IconPersonalization /></span>
                  Personalization
                </button>
                {onOpenPersonas ? (
                  <button type="button" className="dialog-item" role="menuitem" onClick={handleOpenPersonas}>
                    <span className="dialog-item-icon"><IconPersonalization /></span>
                    Personas
                  </button>
                ) : null}
                <button type="button" className="dialog-item" role="menuitem" onClick={() => openSettingsTo('billing')}>
                  <span className="dialog-item-icon"><IconUser /></span>
                  Billing
                </button>
                <button type="button" className="dialog-item" role="menuitem" onClick={() => openSettingsTo('help')}>
                  <span className="dialog-item-icon"><IconHelp /></span>
                  Help
                </button>
                <div className="dialog-divider" />
              </>
            ) : null}
            {onLogout && (
              <button type="button" className="dialog-item logout" onClick={handleLogoutClick}>
                <span className="dialog-item-icon"><IconLogout /></span>
                Log out
              </button>
            )}
          </div>
          <button
            ref={userBlockRef}
            type="button"
            className="sidebar-user-block"
            onClick={toggleAccountDialog}
            aria-label="Account menu"
            aria-haspopup="true"
            aria-expanded={accountDialogOpen}
          >
            <span className="sidebar-user-avatar-placeholder">{userInitial}</span>
            <span className="sidebar-user-info">
              <span className="sidebar-user-email">{user?.email || 'User'}</span>
              <span className="sidebar-user-plan">Free</span>
            </span>
          </button>
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
              onClick={() => {
                const items = historyMenu.type === 'thumbnail' ? thumbnailItems : historyMenu.type === 'script' ? scriptItems : coachItems
                const conversation = items.find((item) => item.id === historyMenu.conversationId)
                if (conversation) startRenamingConversation(conversation, historyMenu.type)
              }}
            >
              <IconEdit />
              Rename
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => openDeleteChatDialog(historyMenu.conversationId, historyMenu.type)}
            >
              <IconTrash />
              Delete
            </button>
          </>
        ) : null}
      </div>

      {deleteChatDialogOpen && (
        <div
          className="sidebar-delete-dialog-backdrop"
          onClick={closeDeleteChatDialog}
          role="presentation"
        >
          <div
            className="sidebar-delete-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-delete-dialog-title"
          >
            <h3 id="sidebar-delete-dialog-title" className="sidebar-delete-dialog-title">
              Delete chat
            </h3>
            <p className="sidebar-delete-dialog-desc">
              Delete this chat permanently? This cannot be undone.
            </p>
            <div className="sidebar-delete-dialog-actions">
              <button
                type="button"
                className="sidebar-delete-dialog-btn sidebar-delete-dialog-btn--cancel"
                onClick={closeDeleteChatDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sidebar-delete-dialog-btn sidebar-delete-dialog-btn--danger"
                onClick={confirmDeleteConversation}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
