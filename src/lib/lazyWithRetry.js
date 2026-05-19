/**
 * Resilient dynamic-import for React.lazy code-split chunks.
 *
 * Every deploy publishes new content-hashed chunk files and the S3 sync
 * prunes the old ones (`--delete`). A browser that loaded the app
 * BEFORE a deploy still references the old hashes; the first lazy
 * `import()` after that deploy 404s, the promise rejects, and — with
 * only <Suspense> and no error boundary — the fallback spinner hangs
 * forever (the "click → infinite spinner" class of bug).
 *
 * Fix: retry once for a transient blip, then treat a persistent failure
 * as a stale deploy and force ONE full reload so the browser pulls the
 * fresh index.html + new chunk graph. A sessionStorage latch guarantees
 * we never reload-loop; it's cleared on the first successful load.
 */
import { lazy } from 'react'

const CHUNK_RELOAD_KEY = 'clixa:chunk-reload'

export function importWithRetry(factory) {
  return new Promise((resolve, reject) => {
    const succeed = (m) => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      } catch {
        /* ignore */
      }
      resolve(m)
    }
    factory()
      .then(succeed)
      .catch(() => {
        factory()
          .then(succeed)
          .catch((err2) => {
            let alreadyReloaded = true
            try {
              alreadyReloaded = Boolean(sessionStorage.getItem(CHUNK_RELOAD_KEY))
              if (!alreadyReloaded) sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
            } catch {
              /* sessionStorage blocked — fall through to reject */
            }
            if (!alreadyReloaded && typeof window !== 'undefined') {
              window.location.reload()
              return // page is reloading; never settle
            }
            reject(err2)
          })
      })
  })
}

export const lazyWithRetry = (factory) => lazy(() => importWithRetry(factory))
