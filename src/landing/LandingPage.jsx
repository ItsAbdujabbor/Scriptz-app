import { useEffect } from 'react'
import './styles.css'
import './header/header.css'
import './hero/hero.css'
import './sections/another-10/another-10.css'
import './sections/solution/solution.css'
import './sections/results/results.css'
import './sections/social-proof/social-proof.css'
import './sections/pricing/pricing.css'
import './sections/faq/faq.css'
import './sections/final-cta/final-cta.css'
import './footer/footer.css'
import './demo-modal/demo-modal.css'

import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { AnotherTen } from './components/AnotherTen'
import { Solution } from './components/Solution'
import { Results } from './components/Results'
import { SocialProof } from './components/SocialProof'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { FinalCta } from './components/FinalCta'
import { Footer } from './components/Footer'
import { DemoModal } from './components/DemoModal'
import { rafThrottle } from '../lib/rafThrottle'

const SECTION_NAV = {
  solution: 'nav-features',
  results: 'nav-results',
  'social-proof': 'nav-reviews',
  pricing: 'nav-pricing',
  faq: 'nav-faq',
}

export function LandingPage() {
  useEffect(() => {
    const headerEl = document.getElementById('header')

    /* ── 1. Header glass on scroll ─────────────────────────────────────── */
    const updateHeaderScroll = () => {
      if (!headerEl) return
      const isScrolled = window.scrollY > 60
      headerEl.classList.toggle('scrolled', isScrolled)
      if (isScrolled) headerEl.classList.add('header-ready')
    }
    const throttledHeaderScroll = rafThrottle(updateHeaderScroll)
    window.addEventListener('scroll', throttledHeaderScroll, { passive: true })
    updateHeaderScroll()
    headerEl?.classList.add('header-ready')

    /* ── 2. Demo modal open/close (data-attribute driven) ──────────────── */
    const demoModal = document.getElementById('demo-modal')
    const openDemoButtons = document.querySelectorAll('[data-open-demo]')
    const closeDemoButtons = document.querySelectorAll('[data-close-demo]')

    const openDemo = (e) => {
      if (e) e.preventDefault()
      if (!demoModal) return
      demoModal.setAttribute('aria-hidden', 'false')
      document.body.style.overflow = 'hidden'
    }
    const closeDemo = () => {
      if (!demoModal) return
      demoModal.setAttribute('aria-hidden', 'true')
      document.body.style.overflow = ''
    }

    openDemoButtons.forEach((btn) => btn.addEventListener('click', openDemo))
    closeDemoButtons.forEach((btn) => btn.addEventListener('click', closeDemo))
    const onDemoEscape = (e) => {
      if (e.key === 'Escape') closeDemo()
    }
    demoModal?.addEventListener('keydown', onDemoEscape)

    /* ── 3. Pricing billing toggle (monthly ↔ annual) ──────────────────── */
    const pricingSection = document.getElementById('pricing')
    const priBtns = pricingSection?.querySelectorAll('.pri-toggle-btn') ?? []
    const priClickHandlers = []
    if (pricingSection) {
      const priSaveMsg = pricingSection.querySelector('.pri-annual-msg')
      const priCurEls = pricingSection.querySelectorAll('.pri-cur')
      const priOldEls = pricingSection.querySelectorAll('.pri-old')
      const priBilledEls = pricingSection.querySelectorAll('.pri-billed')
      const priMoEls = pricingSection.querySelectorAll('.pri-billed-mo')

      const applyPricingMode = (mode) => {
        const annual = mode === 'annual'
        priBtns.forEach((btn) =>
          btn.classList.toggle('pri-toggle-active', btn.dataset.period === mode)
        )
        priSaveMsg?.classList.toggle('pri-show', annual)
        priCurEls.forEach((el) => {
          const monthly = el.getAttribute('data-monthly')
          const annualPrice = el.getAttribute('data-annual')
          el.textContent = annual ? annualPrice : monthly
        })
        priOldEls.forEach((el) => el.classList.toggle('pri-hidden', !annual))
        priBilledEls.forEach((el) => el.classList.toggle('pri-hidden', !annual))
        priMoEls.forEach((el) => el.classList.toggle('pri-hidden', annual))
      }

      priBtns.forEach((btn) => {
        const handler = () => applyPricingMode(btn.dataset.period || 'monthly')
        btn.addEventListener('click', handler)
        priClickHandlers.push({ btn, handler })
      })
    }

    /* ── 4. Header nav active-state observer ───────────────────────────── */
    const sectionIds = Object.keys(SECTION_NAV)
    const sectionEls = sectionIds.map((id) => document.getElementById(id)).filter(Boolean)

    const setHeaderActive = (sectionId) => {
      headerEl
        ?.querySelectorAll('.header-nav-link.active')
        .forEach((l) => l.classList.remove('active'))
      const navId = SECTION_NAV[sectionId]
      if (!navId) return
      document.getElementById(navId)?.classList.add('active')
    }

    let navObserver = null
    if (sectionEls.length && typeof IntersectionObserver !== 'undefined') {
      // Track which sections are currently in the observation band, resolve
      // the active one as the topmost in DOM order — avoids races when fast
      // scrolling fires multiple intersect callbacks at once.
      const visibleIds = new Set()
      navObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) visibleIds.add(entry.target.id)
            else visibleIds.delete(entry.target.id)
          })
          if (visibleIds.size === 0) return
          for (const id of sectionIds) {
            if (visibleIds.has(id)) {
              setHeaderActive(id)
              break
            }
          }
        },
        { rootMargin: '-12% 0px -58% 0px', threshold: 0 }
      )
      sectionEls.forEach((el) => navObserver.observe(el))
    }

    /* ── 5. Smooth-scroll for header desktop nav links ─────────────────── */
    const handleNavClick = (e) => {
      const href = e.currentTarget.getAttribute('href')
      if (!href || href.charAt(0) !== '#' || href === '#login' || href === '#register') return
      const target = document.getElementById(href.slice(1))
      if (!target) return
      e.preventDefault()
      const offset = (headerEl?.getBoundingClientRect().height ?? 64) + 16
      const top = target.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
    const navLinks = headerEl?.querySelectorAll('.header-nav-link') ?? []
    navLinks.forEach((link) => link.addEventListener('click', handleNavClick))

    /* ── Cleanup ───────────────────────────────────────────────────────── */
    return () => {
      window.removeEventListener('scroll', throttledHeaderScroll)
      throttledHeaderScroll.cancel()
      openDemoButtons.forEach((btn) => btn.removeEventListener('click', openDemo))
      closeDemoButtons.forEach((btn) => btn.removeEventListener('click', closeDemo))
      demoModal?.removeEventListener('keydown', onDemoEscape)
      priClickHandlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler))
      navObserver?.disconnect()
      navLinks.forEach((link) => link.removeEventListener('click', handleNavClick))
    }
  }, [])

  return (
    <>
      <Header />
      <DemoModal />
      <main id="main-content">
        <Hero />
        <AnotherTen />
        <Solution />
        <Results />
        <SocialProof />
        <Pricing />
        <Faq />
        <FinalCta />
        <Footer />
      </main>
    </>
  )
}
