import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STYLE_STORAGE_KEY = 'clixa_selected_style'

// One-shot migration from the legacy "scriptz_*" brand key. Runs before
// Zustand's persist middleware reads the store, so the selected style
// survives the rebrand without forcing the user to re-pick.
const LEGACY_STYLE_STORAGE_KEY = 'scriptz_selected_style'
try {
  if (typeof localStorage !== 'undefined') {
    if (!localStorage.getItem(STYLE_STORAGE_KEY)) {
      const legacy = localStorage.getItem(LEGACY_STYLE_STORAGE_KEY)
      if (legacy) localStorage.setItem(STYLE_STORAGE_KEY, legacy)
    }
    localStorage.removeItem(LEGACY_STYLE_STORAGE_KEY)
  }
} catch {
  /* storage may be unavailable — silent fail */
}

export const useStyleStore = create(
  persist(
    (set) => ({
      selectedStyleId: null,
      selectedStyle: null,

      setSelectedStyle: (style) => {
        if (!style) {
          set({ selectedStyleId: null, selectedStyle: null })
          return
        }
        set({
          selectedStyleId: style.id,
          selectedStyle: {
            id: style.id,
            name: style.name,
            image_url: style.image_url,
            visibility: style.visibility,
          },
        })
      },

      clearSelectedStyle: () => {
        set({ selectedStyleId: null, selectedStyle: null })
      },
    }),
    {
      name: STYLE_STORAGE_KEY,
      partialize: (state) => ({
        selectedStyleId: state.selectedStyleId,
        selectedStyle: state.selectedStyle,
      }),
    }
  )
)
