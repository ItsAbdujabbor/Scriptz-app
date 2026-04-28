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
  chatThreadGc: 1000 * 60 * 60 * 2, // 2 hours — was 24h; conversations stay ~forever because the LRU keeps the top 50 pinned, so a 24h gcTime on top of that let idle chats bloat the cache into hundreds of MB.
  weekly: 1000 * 60 * 60 * 24 * 7,
  /** Chat history sidebar list — kept very fresh so a refetch only happens once per active session. */
  chatList: 1000 * 60, // 60 seconds — was 30s. Sidebar refetched twice per minute; bumped to halve the background re-renders of the memoised HistoryItem list. `refetchOnWindowFocus` still kicks in after 60s so cross-tab staleness is unchanged.
  chatListGc: 1000 * 60 * 5, // 5 minutes
  chatListFocusThreshold: 1000 * 60, // refetch on tab-focus only if older than 60s
  /** Dashboard KPI / overview tier — fast revisits feel instant, slow background refresh. */
  dashboardKpi: 1000 * 30, // 30 seconds
  dashboardKpiGc: 1000 * 60 * 10, // 10 minutes
  /**
   * Auto-refresh cadence for the dashboard widgets while the user is on the
   * page. React Query pauses interval-based refetches when the tab is hidden
   * (default `refetchIntervalInBackground: false`) and stops them entirely
   * when the Dashboard component unmounts, so this only fires for active
   * users actually viewing the screen — no quota waste.
   *
   * Sized longer than the staleTime so the interval is the *upper* bound on
   * staleness, not a duplicate poll: clicking around the dashboard already
   * triggers fresh fetches via React Query's mount/focus rules.
   */
  dashboardAutoRefresh: 1000 * 60 * 5, // 5 minutes
}
