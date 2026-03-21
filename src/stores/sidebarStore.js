import { create } from 'zustand'

const STORAGE_KEY = 'scriptz_sidebar_ui'

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStored(data) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

const storedState = loadStored()

export const useSidebarStore = create((set, get) => ({
  collapsed: storedState?.collapsed === true,
  mobileOpen: false,
  toolsExpanded: false,
  accountDialogOpen: false,

  setCollapsed(value) {
    const collapsed = typeof value === 'function' ? value(get().collapsed) : !!value
    set({ collapsed })
    saveStored({ collapsed })
  },

  toggleCollapsed() {
    const next = !get().collapsed
    set({ collapsed: next })
    saveStored({ collapsed: next })
  },

  setMobileOpen(value) {
    set({ mobileOpen: !!value })
  },

  closeMobile() {
    set({ mobileOpen: false })
  },

  setToolsExpanded(value) {
    set({ toolsExpanded: !!value })
  },

  toggleToolsExpanded() {
    set((state) => ({ toolsExpanded: !state.toolsExpanded }))
  },

  setAccountDialogOpen(value) {
    set({ accountDialogOpen: !!value })
  },

  toggleAccountDialog() {
    set((state) => ({ accountDialogOpen: !state.accountDialogOpen }))
  },

  closeTransientUi() {
    set({ mobileOpen: false, accountDialogOpen: false })
  },
}))
