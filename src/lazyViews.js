/**
 * Lazy-loaded entry for the authenticated thumbnails view.
 *
 * Living in its own module gives the sidebar a single hook for hover
 * prefetch — `onPointerEnter={() => loaders.thumbnails()}` starts the
 * chunk download on hover so the click→render gap is gone.
 *
 * Uses `lazyWithRetry` so a stale-deploy chunk 404 self-recovers
 * (retry → one guarded reload) instead of hanging on the Suspense
 * fallback forever.
 */
import { lazyWithRetry } from './lib/lazyWithRetry'

export const loaders = {
  thumbnails: () => import('./app/Thumbnails'),
}

export const Thumbnails = lazyWithRetry(() =>
  loaders.thumbnails().then((m) => ({ default: m.Thumbnails }))
)
