import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Sidebar } from './Sidebar'
import './Sidebar.css'
import './Dashboard.css'
import './Templates.css'
import {
  useThumbnailTemplateCategoriesQuery,
  useThumbnailTemplatesListQuery,
} from '../queries/thumbnailTemplates/thumbnailTemplateQueries'

const PAGE_SIZE = 30

function thumbPrefillFromTemplate(t) {
  const parts = [t.name, t.category, t.description].filter(Boolean)
  return parts.join(' — ')
}

function thumbnailGeneratorHref(t) {
  return `#coach/thumbnails?prefill=${encodeURIComponent(thumbPrefillFromTemplate(t))}`
}

function TemplateLightbox({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!item) return null
  return (
    <div
      className="templates-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div className="templates-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="templates-lightbox-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <img src={item.image_url} alt="" className="templates-lightbox-img" />
        <div className="templates-lightbox-meta">
          <span className="templates-lightbox-title">{item.name}</span>
          <span className="templates-lightbox-cat">{item.category}</span>
        </div>
      </div>
    </div>
  )
}

export function Templates({ onLogout }) {
  const { user } = useAuthStore()

  const [page, setPage] = useState(0)
  const [categorySlug, setCategorySlug] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 320)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [categorySlug, debouncedQ])

  const offset = page * PAGE_SIZE
  const { data: catData, isLoading: catsLoading } = useThumbnailTemplateCategoriesQuery()
  const categories = catData?.categories ?? []

  const listParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      category: categorySlug || undefined,
      q: debouncedQ || undefined,
    }),
    [offset, categorySlug, debouncedQ]
  )

  const {
    data: listData,
    isLoading: listLoading,
    isFetching,
    isError,
    error,
  } = useThumbnailTemplatesListQuery(listParams)

  const items = listData?.items ?? []
  const total = listData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const copyUrl = async (url) => {
    try {
      await navigator.clipboard?.writeText(url || '')
    } catch {
      /* ignore */
    }
  }

  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = offset + items.length

  return (
    <div className="dashboard-page">
      <div className="dashboard-app-shell">
        <Sidebar user={user} currentScreen="templates" onLogout={onLogout} />
        <main className="dashboard-main-wrap">
          <div className="templates-shell">
            <header className="templates-hero">
              <div>
                <h1 className="templates-hero-title">Templates</h1>
                <p className="templates-hero-sub">
                  Curated thumbnail references from our team. Filter by category, search by name or
                  keywords, and open any template in the Thumbnail Generator for inspiration.
                  Templates are maintained in <strong>Scriptz Admin</strong> (not in this app).
                </p>
              </div>
            </header>

            <div className="templates-toolbar">
              <div className="templates-search-wrap">
                <input
                  type="search"
                  className="templates-search"
                  placeholder="Search templates (try multiple words)…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search templates"
                />
                {isFetching && !listLoading ? (
                  <span className="templates-search-hint">Updating…</span>
                ) : null}
              </div>
            </div>

            <div className="templates-filters" role="group" aria-label="Category filters">
              <button
                type="button"
                className={`templates-chip ${!categorySlug ? 'templates-chip--active' : ''}`}
                onClick={() => setCategorySlug('')}
              >
                All
                {!catsLoading && categories.length ? (
                  <span className="templates-chip-count">
                    {categories.reduce((a, c) => a + (c.count || 0), 0)}
                  </span>
                ) : null}
              </button>
              {categories.map((c) => (
                <button
                  key={c.category_slug}
                  type="button"
                  className={`templates-chip ${categorySlug === c.category_slug ? 'templates-chip--active' : ''}`}
                  onClick={() => setCategorySlug(c.category_slug)}
                >
                  {c.category}
                  <span className="templates-chip-count">{c.count}</span>
                </button>
              ))}
            </div>

            {isError && (
              <div className="templates-error" role="alert">
                {error?.message || 'Could not load templates.'}
              </div>
            )}

            {!listLoading && !isError && total === 0 && (
              <div className="templates-empty">
                <h2>No templates match</h2>
                <p>
                  Try another category or clear your search. Admins add templates in Scriptz Admin.
                </p>
              </div>
            )}

            {listLoading && !items.length ? (
              <div className="templates-skeleton-grid" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="templates-skeleton-card" />
                ))}
              </div>
            ) : (
              <ul className="templates-masonry" role="list">
                {items.map((t) => (
                  <li key={t.id} className="templates-card">
                    <button
                      type="button"
                      className="templates-card-thumb"
                      onClick={() => setLightbox(t)}
                      aria-label={`View ${t.name} full size`}
                    >
                      <img src={t.image_url} alt="" loading="lazy" decoding="async" />
                      <span className="templates-card-cat">{t.category}</span>
                    </button>
                    <div className="templates-card-body">
                      <h3 className="templates-card-name">{t.name}</h3>
                      {t.description ? (
                        <p className="templates-card-desc">{t.description}</p>
                      ) : null}
                      <div className="templates-card-actions">
                        <a
                          className="templates-btn templates-btn--small templates-btn--primary"
                          href={thumbnailGeneratorHref(t)}
                        >
                          Use in Thumbnail Generator
                        </a>
                        <button
                          type="button"
                          className="templates-btn templates-btn--small templates-btn--ghost"
                          onClick={() => copyUrl(t.image_url)}
                        >
                          Copy image URL
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {total > 0 && (
              <nav className="templates-pagination" aria-label="Pagination">
                <button
                  type="button"
                  className="templates-page-btn"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <span className="templates-page-status">
                  Page {page + 1} of {totalPages}
                  <span className="templates-page-range">
                    {' '}
                    · {rangeStart}–{rangeEnd} of {total}
                  </span>
                </span>
                <button
                  type="button"
                  className="templates-page-btn"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </main>
      </div>
      {lightbox ? <TemplateLightbox item={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  )
}
