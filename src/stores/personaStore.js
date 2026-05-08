import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const PERSONA_STORAGE_KEY = 'clixa_selected_persona'

// One-shot migration from the legacy "scriptz_*" brand key. Runs before
// Zustand's persist middleware reads the store, so the selected persona
// survives the rebrand without forcing the user to re-pick.
const LEGACY_PERSONA_STORAGE_KEY = 'scriptz_selected_persona'
try {
  if (typeof localStorage !== 'undefined') {
    if (!localStorage.getItem(PERSONA_STORAGE_KEY)) {
      const legacy = localStorage.getItem(LEGACY_PERSONA_STORAGE_KEY)
      if (legacy) localStorage.setItem(PERSONA_STORAGE_KEY, legacy)
    }
    localStorage.removeItem(LEGACY_PERSONA_STORAGE_KEY)
  }
} catch {
  /* storage may be unavailable — silent fail */
}

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
