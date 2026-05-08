/**
 * Lazy-loaded entries for the authenticated views (thumbnails, pro, billing).
 *
 * Living in their own module gives the sidebar a single hook for hover
 * prefetch — `<SidebarButton onPointerEnter={() => loaders.thumbnails()} />`
 * starts the chunk download on hover so the click→render gap is gone.
 */
import { lazy } from 'react'

export const loaders = {
  thumbnails: () => import('./app/Thumbnails'),
  billing: () => import('./app/Billing'),
}

export const Thumbnails = lazy(() =>
  loaders.thumbnails().then((m) => ({ default: m.Thumbnails }))
)
export const Billing = lazy(() =>
  loaders.billing().then((m) => ({ default: m.Billing }))
)

/** Prefetch a view's chunk by name. Safe to call repeatedly — the import
 *  cache makes subsequent calls free. Used by the sidebar on hover. */
export function prefetchView(name) {
  const fn = loaders[name]
  if (typeof fn === 'function') {
    fn().catch(() => {})
  }
}
