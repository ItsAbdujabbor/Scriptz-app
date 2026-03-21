import { useAuthStore } from '../../stores/authStore'

/**
 * Shared bridge: TanStack Query queryFns need an access token.
 * We keep token/session lifecycle in Zustand and only read it here.
 */
export async function getAccessTokenOrNull() {
  try {
    return await useAuthStore.getState().getValidAccessToken()
  } catch {
    return null
  }
}

