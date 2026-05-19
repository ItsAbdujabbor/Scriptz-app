import { create } from 'zustand'

/**
 * Tracks the live status of an in-flight thumbnail-generation job.
 *
 * The submit+poll adapter in `thumbnailsApi.chat` writes the latest
 * polled status here on each tick; UI components (notably the
 * ThumbnailGenSlowHint inside the loader) read it for friendly
 * progress text like "Calling provider", "Retrying after timeout",
 * "Almost there".
 *
 * Why a store instead of a callback? The mutation that triggers chat
 * lives in one component, but the loader hint that needs to render
 * the status lives in another. A Zustand store is the lightest
 * mechanism to decouple them — no prop drilling, no global event bus.
 *
 * Lifecycle:
 *   - submit  → store cleared, then `update()` on every poll
 *   - terminal (done/failed) → `clear()` so a stale message doesn't
 *     persist past the next request
 */
export const useThumbnailJobStatusStore = create((set, get) => ({
  // The most recent polled job status, or null when no job is in flight.
  // Shape mirrors the backend's ThumbnailChatJobStatus.
  status: null,

  /** Replace the whole status with the latest poll.
   *
   *  The poll loop calls this every ~1-2s with a freshly-deserialized
   *  object (new reference each tick). Skip the `set()` when the value
   *  is unchanged so subscribers (the loader's slow-hint) don't re-render
   *  on every tick for the whole duration of a generation. Deep value
   *  compare guarantees no UI-visible change is ever suppressed. */
  update(jobStatus) {
    const prev = get().status
    if (JSON.stringify(prev) === JSON.stringify(jobStatus)) return
    set({ status: jobStatus })
  },

  /** Drop the status — call when a job completes or the user navigates
   *  away mid-poll. Idempotent. */
  clear() {
    set({ status: null })
  },
}))
