/**
 * Centralize how "fresh" different resources are.
 * Tune these values based on how often your backend data changes.
 */
export const queryFreshness = {
  // Video/channel lists can change when you upload, but don't need per-second freshness.
  short: 1000 * 60 * 1, // 1 minute
  medium: 1000 * 60 * 3, // 3 minutes
  long: 1000 * 60 * 8, // 8 minutes
  weekly: 1000 * 60 * 60 * 24 * 7, // 7 days
}

