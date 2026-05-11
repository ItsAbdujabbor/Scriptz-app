import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const NAV_ITEMS = [
  { href: '#solution', label: 'Features', id: 'nav-features', section: 'solution' },
  { href: '#results', label: 'Results', id: 'nav-results', section: 'results' },
  { href: '#social-proof', label: 'Reviews', id: 'nav-reviews', section: 'social-proof' },
  { href: '#pricing', label: 'Pricing', id: 'nav-pricing', section: 'pricing' },
]

/**
 * Header — bar (pure JSX) + mobile menu (React portal).
 * The portal mounts to document.body so the menu is always
 * viewport-relative regardless of any ancestor's contain/transform/filter.
 */
export function Header() {
  return (
    <>
      <HeaderBar />
      <HeaderMobileMenu />
    </>
  )
}

function HeaderBar() {
  return (
    <header className="header" id="header">
      <div className="header-inner">
        {/* Logo */}
        <a href="." className="header-logo" aria-label="Clixa AI home">
          <img src="/clixalogo.jpg" alt="" className="header-logo-mark" />
          <span className="header-logo-text">Clixa AI</span>
        </a>

        {/* Desktop nav (center) */}
        <nav className="header-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="header-nav-link"
              id={item.id}
              data-section={item.section}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop / mobile-visible CTAs. Both targets are the same unified
            auth dialog (#signin) — two buttons exist so returning users
            have an obvious "Sign In" affordance separate from the marketing
            "Start Free Trial" CTA, without changing dialog behaviour. */}
        <div className="header-actions">
          <a href="#signin" className="header-login">
            Sign In
          </a>
          <a href="#signin" className="header-trial">
            Start Free Trial
          </a>
        </div>

        {/* Mobile 3-line burger. The menu panel is a React portal attached
            to document.body (HeaderMobileMenu below) — escapes any
            containing-block trap from this header's contain/backdrop-filter. */}
        <button
          type="button"
          className="header-burger"
          id="header-burger"
          aria-label="Open menu"
          aria-expanded="false"
          aria-controls="hm-overlay"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}

function HeaderMobileMenu() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Wait until after mount so document.body exists (SSR-safe + Strict Mode safe).
  useEffect(() => setMounted(true), [])

  // Wire the burger button. It's rendered by HeaderBar (sibling React tree),
  // so we attach via id rather than passing a ref through component boundaries.
  useEffect(() => {
    const burger = document.getElementById('header-burger')
    if (!burger) return
    const toggle = () => setOpen((o) => !o)
    burger.addEventListener('click', toggle)
    return () => burger.removeEventListener('click', toggle)
  }, [])

  // Mirror open state back to the burger + body scroll-lock.
  useEffect(() => {
    const burger = document.getElementById('header-burger')
    if (burger) {
      burger.classList.toggle('open', open)
      burger.setAttribute('aria-expanded', String(open))
    }
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Safety net — if the URL hash changes for any reason (Log In / Sign Up nav,
  // browser back/forward, in-page link), force-unlock the body. Otherwise the
  // body can stay `overflow:hidden` from a previous open state, making the
  // page look like sections "disappeared" because you can't scroll past the
  // first viewport.
  useEffect(() => {
    const onHashChange = () => {
      document.body.style.overflow = ''
      setOpen(false)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // The useEffect on [open] mirrors body.overflow + burger classes when
  // state changes; the hashchange listener above is the safety net for
  // any case where state-update batching loses to href navigation.
  const close = () => setOpen(false)

  const handleNav = (e, href) => {
    if (href === '#signin' || href === '#login' || href === '#register') {
      close()
      return
    }
    e.preventDefault()
    const target = document.getElementById(href.slice(1))
    if (!target) {
      close()
      return
    }
    const headerEl = document.getElementById('header')
    const offset = (headerEl?.getBoundingClientRect().height ?? 60) + 16
    const top = target.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
    close()
  }

  if (!mounted) return null

  return createPortal(
    <div
      id="hm-overlay"
      className={`hm-overlay${open ? ' hm-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      aria-hidden={!open}
    >
      <button
        type="button"
        className="hm-backdrop"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={close}
      />
      <div className="hm-panel">
        <div className="hm-brand" aria-hidden="true">
          <img src="/clixalogo.jpg" alt="" className="hm-brand-mark" />
          <span className="hm-brand-text">Clixa AI</span>
        </div>

        <nav className="hm-nav" aria-label="Mobile navigation">
          {[
            { href: '#solution', label: 'Features' },
            { href: '#results', label: 'Results' },
            { href: '#social-proof', label: 'Reviews' },
            { href: '#pricing', label: 'Pricing' },
          ].map((item) => (
            <a key={item.href} href={item.href} onClick={(e) => handleNav(e, item.href)}>
              <span className="hm-nav-label">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="hm-cta">
          <a href="#signin" className="hm-trial" onClick={close}>
            <span className="hm-trial-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M12 2.5 13.7 9 20.5 10.5 13.7 12 12 18.5 10.3 12 3.5 10.5 10.3 9z" />
              </svg>
            </span>
            Start Free Trial
          </a>
          <a href="#signin" className="hm-login" onClick={close}>
            Already have an account? <span className="hm-login-em">Sign in</span>
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}
