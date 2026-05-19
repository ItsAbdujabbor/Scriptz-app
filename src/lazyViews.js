/**
 * Lazy-loaded entry for the authenticated thumbnails view.
 *
 * Living in its own module gives the sidebar a single hook for hover
 * prefetch — `onPointerEnter={() => loaders.thumbnails()}` starts the
 * chunk download on hover so the click→render gap is gone.
 */
import { lazy } from 'react'

export const loaders = {
  thumbnails: () => import('./app/Thumbnails'),
}

export const Thumbnails = lazy(() => loaders.thumbnails().then((m) => ({ default: m.Thumbnails })))
