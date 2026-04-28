/**
 * Lazy-loaded entries for the five authenticated views.
 *
 * They live in their own module (not inline in AuthenticatedRoutes) for two
 * reasons:
 *
 *  1. The shared `loaders` map gives the sidebar a single hook for hover
 *     prefetch — `<SidebarButton onPointerEnter={() => loaders.optimize()} />`
 *     starts the chunk download on hover so the click→render gap is gone.
 *  2. Calling a `lazy()` factory more than once is a no-op after the first
 *     call (the underlying dynamic import is cached by the bundler), so it's
 *     safe for both Suspense and the prefetch path to share the same
 *     loader.
 *
 * Each chunk pulls in its own CSS via the component's own imports, which
 * means landing on /dashboard no longer downloads the styles for /optimize,
 * /pro, etc.
 */
import { lazy } from 'react'

export const loaders = {
  dashboard: () => import('./app/Dashboard'),
  thumbnails: () => import('./app/Thumbnails'),
  optimize: () => import('./app/Optimize'),
  pro: () => import('./app/Pro'),
  billing: () => import('./app/Billing'),
}

export const Dashboard = lazy(() =>
  loaders.dashboard().then((m) => ({ default: m.Dashboard }))
)
export const Thumbnails = lazy(() =>
  loaders.thumbnails().then((m) => ({ default: m.Thumbnails }))
)
export const Optimize = lazy(() =>
  loaders.optimize().then((m) => ({ default: m.Optimize }))
)
export const Pro = lazy(() => loaders.pro().then((m) => ({ default: m.Pro })))
export const Billing = lazy(() =>
  loaders.billing().then((m) => ({ default: m.Billing }))
)

/** Prefetch a view's chunk by name. Safe to call repeatedly — the import
 *  cache makes subsequent calls free. Used by the sidebar on hover. */
export function prefetchView(name) {
  const fn = loaders[name]
  if (typeof fn === 'function') {
    // We deliberately don't await — fire-and-forget. Errors here would
    // surface again at click time through Suspense's fallback path.
    fn().catch(() => {})
  }
}
