import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STYLE_STORAGE_KEY = 'scriptz_selected_style'

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
