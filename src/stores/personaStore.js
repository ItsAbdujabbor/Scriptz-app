import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const PERSONA_STORAGE_KEY = 'scriptz_selected_persona'

export const usePersonaStore = create(
  persist(
    (set) => ({
      selectedPersonaId: null,
      selectedPersona: null, // { id, name, ... } for display

      setSelectedPersona: (persona) => {
        if (!persona) {
          set({ selectedPersonaId: null, selectedPersona: null })
          return
        }
        set({
          selectedPersonaId: persona.id,
          selectedPersona: {
            id: persona.id,
            name: persona.name,
            visibility: persona.visibility,
            image_url: persona.image_url,
          },
        })
      },

      clearSelectedPersona: () => {
        set({ selectedPersonaId: null, selectedPersona: null })
      },
    }),
    {
      name: PERSONA_STORAGE_KEY,
      partialize: (state) => ({
        selectedPersonaId: state.selectedPersonaId,
        selectedPersona: state.selectedPersona,
      }),
    }
  )
)
