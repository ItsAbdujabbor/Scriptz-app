/**
 * Centralize how "fresh" different resources are.
 * Higher staleTime = fewer background refetches = smoother UX.
 * Chat threads/lists are usually updated via explicit cache merges (see chatCacheUtils).
 */
export const queryFreshness = {
  short: 1000 * 60 * 2, // 2 minutes — active lists / light polling
  medium: 1000 * 60 * 10, // 10 minutes — dashboard insights, personas, styles
  long: 1000 * 60 * 20, // 20 minutes — snapshots, profile, conversation lists
  /** Loaded thread bodies: stay fresh after explicit cache writes; avoids refetch churn when switching chats. */
  chatThread: 1000 * 60 * 30, // 30 minutes
  /** Keep thread + list entries in memory across navigation (React Query gc). */
  chatThreadGc: 1000 * 60 * 60 * 24, // 24 hours
  weekly: 1000 * 60 * 60 * 24 * 7,
}
