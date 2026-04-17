import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { AppShellLayout } from '../components/AppShellLayout'
import { Sidebar } from './Sidebar'
/* Sidebar.css, Dashboard.css imported by AuthenticatedRoutes */
import './Templates.css'
import {
  useThumbnailTemplateCategoriesQuery,
  useThumbnailTemplatesListQuery,
} from '../queries/thumbnailTemplates/thumbnailTemplateQueries'

const PAGE_SIZE = 24

// Demo templates for development/demo without backend
const DEMO_TEMPLATES = [
  {
    id: 1,
    name: 'Tech Review Minimal',
    category: 'Tech',
    description: 'Clean minimal tech review thumbnail with bold text overlay',
    image_url: 'https://picsum.photos/seed/tech1/640/360',
  },
  {
    id: 2,
    name: 'Gaming Channel Banner',
    category: 'Gaming',
    description: 'Vibrant gaming thumbnail with neon effects and action pose',
    image_url: 'https://picsum.photos/seed/game1/640/360',
  },
  {
    id: 3,
    name: 'Vlog Story Style',
    category: 'Vlog',
    description: 'Personal vlog thumbnail with emotional expression and warm colors',
    image_url: 'https://picsum.photos/seed/vlog1/640/360',
  },
  {
    id: 4,
    name: 'Education Explainer',
    category: 'Education',
    description: 'Professional educational thumbnail with diagrams and clean design',
    image_url: 'https://picsum.photos/seed/edu1/640/360',
  },
  {
    id: 5,
    name: 'Fitness Motivation',
    category: 'Fitness',
    description: 'High energy fitness thumbnail with dramatic lighting and bold typography',
    image_url: 'https://picsum.photos/seed/fit1/640/360',
  },
  {
    id: 6,
    name: 'Cooking Recipe Card',
    category: 'Food',
    description: 'Delicious food thumbnail with mouth-watering close-up and clear title',
    image_url: 'https://picsum.photos/seed/food1/640/360',
  },
  {
    id: 7,
    name: 'Finance Stock Market',
    category: 'Finance',
    description: 'Professional finance thumbnail with charts and data visualization',
    image_url: 'https://picsum.photos/seed/finance1/640/360',
  },
  {
    id: 8,
    name: 'Travel Adventure',
    category: 'Travel',
    description: 'Stunning travel thumbnail with scenic landscape and adventure vibes',
    image_url: 'https://picsum.photos/seed/travel1/640/360',
  },
  {
    id: 9,
    name: 'Music Studio Session',
    category: 'Music',
    description: 'Music thumbnail with studio aesthetic and artist portrait',
    image_url: 'https://picsum.photos/seed/music1/640/360',
  },
  {
    id: 10,
    name: 'Comedy Skit Highlight',
    category: 'Comedy',
    description: 'Funny thumbnail with exaggerated expression and comedy elements',
    image_url: 'https://picsum.photos/seed/comedy1/640/360',
  },
  {
    id: 11,
    name: 'News Current Events',
    category: 'News',
    description: 'Professional news thumbnail with breaking news banner',
    image_url: 'https://picsum.photos/seed/news1/640/360',
  },
  {
    id: 12,
    name: 'DIY Craft Tutorial',
    category: 'DIY',
    description: 'Creative DIY thumbnail showing hands-on crafting process',
    image_url: 'https://picsum.photos/seed/diy1/640/360',
  },
  {
    id: 13,
    name: 'Science Experiment',
    category: 'Science',
    description: 'Interesting science thumbnail with experiment setup and curiosity',
    image_url: 'https://picsum.photos/seed/science1/640/360',
  },
  {
    id: 14,
    name: 'Fashion Lookbook',
    category: 'Fashion',
    description: 'Stylish fashion thumbnail with outfit showcase and trends',
    image_url: 'https://picsum.photos/seed/fashion1/640/360',
  },
  {
    id: 15,
    name: 'Pet Compilation',
    category: 'Pets',
    description: 'Adorable pet thumbnail with cute animals and fun moments',
    image_url: 'https://picsum.photos/seed/pet1/640/360',
  },
  {
    id: 16,
    name: 'Car Review Drive',
    category: 'Auto',
    description: 'Sleek automotive thumbnail with car showcase and speed',
    image_url: 'https://picsum.photos/seed/car1/640/360',
  },
  {
    id: 17,
    name: 'Podcast Episode',
    category: 'Podcast',
    description: 'Podcast thumbnail with host conversation and episode title',
    image_url: 'https://picsum.photos/seed/podcast1/640/360',
  },
  {
    id: 18,
    name: 'Motivation Speaker',
    category: 'Motivation',
    description: 'Inspiring motivational thumbnail with powerful quote and pose',
    image_url: 'https://picsum.photos/seed/motivation1/640/360',
  },
  {
    id: 19,
    name: 'Beauty Tutorial',
    category: 'Beauty',
    description: 'Glamorous beauty thumbnail with makeup transformation',
    image_url: 'https://picsum.photos/seed/beauty1/640/360',
  },
  {
    id: 20,
    name: 'History Documentary',
    category: 'History',
    description: 'Historical documentary thumbnail with vintage aesthetic',
    image_url: 'https://picsum.photos/seed/history1/640/360',
  },
  {
    id: 21,
    name: 'Nature Documentary',
    category: 'Nature',
    description: 'Breathtaking nature thumbnail with wildlife and landscape',
    image_url: 'https://picsum.photos/seed/nature1/640/360',
  },
  {
    id: 22,
    name: 'Retro Vintage Style',
    category: 'Retro',
    description: 'Nostalgic retro thumbnail with vintage filters and classic vibes',
    image_url: 'https://picsum.photos/seed/retro1/640/360',
  },
  {
    id: 23,
    name: 'Minimal Clean',
    category: 'Minimal',
    description: 'Clean minimalist thumbnail with simple design and focus',
    image_url: 'https://picsum.photos/seed/minimal1/640/360',
  },
  {
    id: 24,
    name: 'Neon Cyberpunk',
    category: 'Cyberpunk',
    description: 'Futuristic neon cyberpunk thumbnail with glowing effects',
    image_url: 'https://picsum.photos/seed/cyber1/640/360',
  },
]

const DEMO_CATEGORIES = [
  { category: 'All', category_slug: '', count: 24 },
  { category: 'Tech', category_slug: 'tech', count: 1 },
  { category: 'Gaming', category_slug: 'gaming', count: 1 },
  { category: 'Vlog', category_slug: 'vlog', count: 1 },
  { category: 'Education', category_slug: 'education', count: 1 },
  { category: 'Fitness', category_slug: 'fitness', count: 1 },
  { category: 'Food', category_slug: 'food', count: 1 },
  { category: 'Finance', category_slug: 'finance', count: 1 },
  { category: 'Travel', category_slug: 'travel', count: 1 },
  { category: 'Music', category_slug: 'music', count: 1 },
  { category: 'Comedy', category_slug: 'comedy', count: 1 },
  { category: 'News', category_slug: 'news', count: 1 },
  { category: 'DIY', category_slug: 'diy', count: 1 },
  { category: 'Science', category_slug: 'science', count: 1 },
  { category: 'Fashion', category_slug: 'fashion', count: 1 },
  { category: 'Pets', category_slug: 'pets', count: 1 },
  { category: 'Auto', category_slug: 'auto', count: 1 },
  { category: 'Podcast', category_slug: 'podcast', count: 1 },
  { category: 'Motivation', category_slug: 'motivation', count: 1 },
  { category: 'Beauty', category_slug: 'beauty', count: 1 },
  { category: 'History', category_slug: 'history', count: 1 },
  { category: 'Nature', category_slug: 'nature', count: 1 },
  { category: 'Retro', category_slug: 'retro', count: 1 },
  { category: 'Minimal', category_slug: 'minimal', count: 1 },
  { category: 'Cyberpunk', category_slug: 'cyberpunk', count: 1 },
]

function thumbPrefillFromTemplate(t) {
  const parts = [t.name, t.category, t.description].filter(Boolean)
  return parts.join(' — ')
}

function thumbnailGeneratorHref(t) {
  return `#thumbnails?prefill=${encodeURIComponent(thumbPrefillFromTemplate(t))}`
}

function TemplateLightbox({ item, onClose, onNavigate }) {
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
        <img src={item.image_url} alt="" className="templates-lightbox-img" loading="eager" />
        <div className="templates-lightbox-meta">
          <span className="templates-lightbox-title">{item.name}</span>
          <span className="templates-lightbox-cat">{item.category}</span>
        </div>
        <div className="templates-lightbox-actions">
          <a
            className="templates-btn templates-btn--primary"
            href={thumbnailGeneratorHref(item)}
            onClick={() => {
              if (onNavigate) onNavigate()
            }}
          >
            Use in Thumbnail Generator
          </a>
          <button
            type="button"
            className="templates-btn templates-btn--ghost"
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(item.image_url || '')
              } catch {
                /* ignore */
              }
            }}
          >
            Copy Image URL
          </button>
        </div>
      </div>
    </div>
  )
}

export function Templates({ onLogout, shellManaged }) {
  const { user } = useAuthStore()

  const [page, setPage] = useState(0)
  const [categorySlug, setCategorySlug] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [sortBy, setSortBy] = useState('popular')
  const [viewMode, setViewMode] = useState('grid')
  const [isDemoMode, setIsDemoMode] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Reset page when search query changes
  const prevDebouncedQRef = useRef(debouncedQ)
  useEffect(() => {
    if (prevDebouncedQRef.current !== debouncedQ) {
      prevDebouncedQRef.current = debouncedQ
      setPage(0) // eslint-disable-line react-hooks/set-state-in-effect -- reset on filter change
    }
  }, [debouncedQ])

  // Wrap filter setters to also reset page
  const handleCategoryChange = useCallback((slug) => {
    setCategorySlug(slug)
    setPage(0)
  }, [])
  const handleSortChange = useCallback((val) => {
    setSortBy(val)
    setPage(0)
  }, [])

  const offset = page * PAGE_SIZE
  const { data: catData, isLoading: catsLoading } = useThumbnailTemplateCategoriesQuery()
  const categories = catData?.categories ?? []

  const listParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      category: categorySlug || undefined,
      q: debouncedQ || undefined,
      sort: sortBy !== 'popular' ? sortBy : undefined,
    }),
    [offset, categorySlug, debouncedQ, sortBy]
  )

  const {
    data: listData,
    isLoading: listLoading,
    isFetching,
    isError,
  } = useThumbnailTemplatesListQuery(listParams)

  // Use demo data if API fails or returns empty
  const useDemoData = isDemoMode || (!listLoading && !listData?.items?.length && !isError)

  const demoFiltered = useMemo(() => {
    let filtered = DEMO_TEMPLATES
    if (categorySlug) {
      filtered = filtered.filter((t) => t.category.toLowerCase() === categorySlug.toLowerCase())
    }
    if (debouncedQ) {
      const q = debouncedQ.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
    }
    // Sort
    if (sortBy === 'newest') {
      filtered = [...filtered].reverse()
    }
    return filtered
  }, [categorySlug, debouncedQ, sortBy])

  const items = useDemoData
    ? demoFiltered.slice(offset, offset + PAGE_SIZE)
    : (listData?.items ?? [])
  const total = useDemoData ? demoFiltered.length : (listData?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const copyUrl = useCallback(async (url) => {
    try {
      await navigator.clipboard?.writeText(url || '')
    } catch {
      /* ignore */
    }
  }, [])

  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = offset + items.length

  // Switch to demo mode on error
  useEffect(() => {
    if (isError && !isDemoMode) setIsDemoMode(true) // eslint-disable-line react-hooks/set-state-in-effect -- intentional fallback
  }, [isError, isDemoMode])

  const innerContent = (
    <>
      <div className="dashboard-main-scroll">
        <div className="dashboard-main dashboard-main--subpage">
          <div className="dashboard-content-shell dashboard-content-shell--page">
            <div className="templates-shell">
              <header className="templates-hero">
                <div>
                  <h1 className="templates-hero-title">
                    Thumbnail Templates
                    {isDemoMode && <span className="templates-demo-badge">Demo</span>}
                  </h1>
                  <p className="templates-hero-sub">
                    Browse curated thumbnail references from top creators. Filter by category,
                    search keywords, or open any template in the Thumbnail Generator for
                    inspiration.
                    {isDemoMode && ' Showing demo templates for development.'}
                  </p>
                </div>
                <div className="templates-hero-actions">
                  <button
                    type="button"
                    className={`templates-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    title="Grid view"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`templates-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    title="List view"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="templates-toolbar">
                <div className="templates-search-wrap">
                  <svg
                    className="templates-search-icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="search"
                    className="templates-search"
                    placeholder="Search templates (e.g., 'tech review', 'gaming')…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    aria-label="Search templates"
                  />
                  {isFetching && !listLoading ? (
                    <span className="templates-search-hint">Updating…</span>
                  ) : null}
                </div>
                <div className="templates-sort-wrap">
                  <label htmlFor="sort-select" className="templates-sort-label">
                    Sort by:
                  </label>
                  <select
                    id="sort-select"
                    className="templates-sort-select"
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                  >
                    <option value="popular">Most Popular</option>
                    <option value="newest">Newest First</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </div>
              </div>

              <div className="templates-filters" role="group" aria-label="Category filters">
                <button
                  type="button"
                  className={`templates-chip ${!categorySlug ? 'templates-chip--active' : ''}`}
                  onClick={() => handleCategoryChange('')}
                >
                  All
                  {!catsLoading && (useDemoData ? DEMO_CATEGORIES[0].count : categories.length) ? (
                    <span className="templates-chip-count">
                      {useDemoData
                        ? DEMO_TEMPLATES.length
                        : categories.reduce((a, c) => a + (c.count || 0), 0)}
                    </span>
                  ) : null}
                </button>
                {(useDemoData ? DEMO_CATEGORIES.slice(1) : categories).map((c) => (
                  <button
                    key={c.category_slug || c.category}
                    type="button"
                    className={`templates-chip ${categorySlug === (c.category_slug || c.category.toLowerCase()) ? 'templates-chip--active' : ''}`}
                    onClick={() =>
                      handleCategoryChange(c.category_slug || c.category.toLowerCase())
                    }
                  >
                    {c.category}
                    <span className="templates-chip-count">{c.count || 0}</span>
                  </button>
                ))}
              </div>

              {isError && !isDemoMode && (
                <div className="templates-error" role="alert">
                  <p>Could not load templates from server.</p>
                  <button
                    type="button"
                    className="templates-btn templates-btn--ghost"
                    onClick={() => setIsDemoMode(true)}
                  >
                    Show Demo Templates
                  </button>
                </div>
              )}

              {!listLoading && !isError && total === 0 && (
                <div className="templates-empty">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <h2>No templates found</h2>
                  <p>Try a different category or search term.</p>
                </div>
              )}

              {listLoading || (useDemoData && demoFiltered.length === 0) ? (
                <div className="templates-skeleton-grid" aria-busy="true">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="templates-skeleton-card" />
                  ))}
                </div>
              ) : (
                <ul
                  className={`templates-masonry ${viewMode === 'list' ? 'templates-masonry--list' : ''}`}
                  role="list"
                >
                  {items.map((t, idx) => (
                    <li
                      key={t.id}
                      className="templates-card"
                      style={{ animationDelay: `${(idx % 12) * 50}ms` }}
                    >
                      <button
                        type="button"
                        className="templates-card-thumb"
                        onClick={() => setLightbox(t)}
                        aria-label={`View ${t.name} full size`}
                      >
                        <img src={t.image_url} alt="" loading="lazy" decoding="async" />
                        <span className="templates-card-cat">{t.category}</span>
                        {viewMode === 'list' && (
                          <div className="templates-card-list-overlay">
                            <span>View</span>
                          </div>
                        )}
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
                            Use Template
                          </a>
                          <button
                            type="button"
                            className="templates-btn templates-btn--small templates-btn--ghost"
                            onClick={() => copyUrl(t.image_url)}
                          >
                            Copy URL
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {total > PAGE_SIZE && (
                <nav className="templates-pagination" aria-label="Pagination">
                  <button
                    type="button"
                    className="templates-page-btn"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </button>
                  <div className="templates-page-info">
                    <span className="templates-page-status">
                      Page {page + 1} of {totalPages}
                    </span>
                    <span className="templates-page-range">
                      {rangeStart}–{rangeEnd} of {total} templates
                    </span>
                  </div>
                  <button
                    type="button"
                    className="templates-page-btn"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </nav>
              )}

              <div className="templates-stats">
                <span>
                  Showing {items.length} of {total} templates
                </span>
                {isDemoMode && (
                  <span className="templates-demo-note">Demo mode - showing sample templates</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {lightbox ? (
        <TemplateLightbox
          item={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={() => setLightbox(null)}
        />
      ) : null}
    </>
  )

  if (shellManaged) return innerContent

  return (
    <div className="dashboard-page">
      <AppShellLayout
        shellOnly
        mainClassName="dashboard-main-wrap"
        sidebar={<Sidebar user={user} currentScreen="templates" onLogout={onLogout} />}
      >
        {innerContent}
      </AppShellLayout>
    </div>
  )
}
