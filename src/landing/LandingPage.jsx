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

export function LandingPage() {
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const headerEl = document.getElementById('header')
    function updateHeaderScroll() {
      if (!headerEl) return
      const isScrolled = window.scrollY > 60
      headerEl.classList.toggle('scrolled', isScrolled)
      if (isScrolled) headerEl.classList.add('header-ready')
    }
    const throttledHeaderScroll = rafThrottle(updateHeaderScroll)
    window.addEventListener('scroll', throttledHeaderScroll, { passive: true })
    updateHeaderScroll()
    if (headerEl) {
      headerEl.classList.add('header-ready')
    }

    const heroContent = document.getElementById('hero-content')
    if (heroContent && !prefersReducedMotion) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          heroContent.classList.add('hero-visible')
        }, 80)
      })
    } else if (heroContent) {
      heroContent.classList.add('hero-visible')
    }

    // Make any generic .reveal elements visible immediately to avoid scroll-time work
    document.querySelectorAll('.reveal').forEach((el) => {
      el.classList.add('revealed')
    })

    const demoModal = document.getElementById('demo-modal')
    const openDemoButtons = document.querySelectorAll('[data-open-demo]')
    const closeDemoButtons = document.querySelectorAll('[data-close-demo]')

    function openDemo(e) {
      if (e) e.preventDefault()
      if (demoModal) {
        demoModal.setAttribute('aria-hidden', 'false')
        document.body.style.overflow = 'hidden'
      }
    }
    function closeDemo() {
      if (demoModal) {
        demoModal.setAttribute('aria-hidden', 'true')
        document.body.style.overflow = ''
      }
    }

    openDemoButtons.forEach((btn) => btn.addEventListener('click', openDemo))
    closeDemoButtons.forEach((btn) => btn.addEventListener('click', closeDemo))
    if (demoModal) {
      demoModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDemo()
      })
    }

    // "Another 10 of 10" scroll reveal
    // Instantly mark "Another 10 of 10" elements as visible (no scroll observers for smoother scrolling)
    document.querySelectorAll('.a10-reveal').forEach((el) => {
      el.classList.add('a10-visible')
    })

    // Solution section scroll reveal
    // Solution section — make all reveal elements visible immediately
    document.querySelectorAll('.sol-reveal').forEach((el) => {
      el.classList.add('sol-visible')
    })

    // Results section scroll reveal
    document.querySelectorAll('.res-reveal').forEach((el) => {
      el.classList.add('res-visible')
    })

    // Social proof section scroll reveal
    document.querySelectorAll('.sp-reveal').forEach((el) => {
      el.classList.add('sp-visible')
    })

    // Pricing section: scroll reveal + billing toggle
    document.querySelectorAll('.pri-reveal').forEach((el) => {
      el.classList.add('pri-visible')
    })

    const pricingSection = document.getElementById('pricing')
    if (pricingSection) {
      const priBtns = pricingSection.querySelectorAll('.pri-toggle-btn')
      const priSaveMsg = pricingSection.querySelector('.pri-annual-msg')
      const priCurEls = pricingSection.querySelectorAll('.pri-cur')
      const priOldEls = pricingSection.querySelectorAll('.pri-old')
      const priBilledEls = pricingSection.querySelectorAll('.pri-billed')
      const priMoEls = pricingSection.querySelectorAll('.pri-billed-mo')

      const applyPricingMode = (mode) => {
        const annual = mode === 'annual'
        priBtns.forEach((btn) => {
          btn.classList.toggle('pri-toggle-active', btn.dataset.period === mode)
        })
        if (priSaveMsg) {
          priSaveMsg.classList.toggle('pri-show', annual)
        }
        priCurEls.forEach((el) => {
          const span = el
          const monthly = span.getAttribute('data-monthly')
          const annualPrice = span.getAttribute('data-annual')
          span.textContent = annual ? annualPrice : monthly
        })
        priOldEls.forEach((el) => el.classList.toggle('pri-hidden', !annual))
        priBilledEls.forEach((el) => el.classList.toggle('pri-hidden', !annual))
        priMoEls.forEach((el) => el.classList.toggle('pri-hidden', annual))
      }

      priBtns.forEach((btn) => {
        btn.addEventListener('click', () => applyPricingMode(btn.dataset.period || 'monthly'))
      })
    }

    // FAQ section: reveal + accordion
    document.querySelectorAll('.faq-reveal').forEach((el) => {
      el.classList.add('faq-visible')
    })

    const faqItems = document.querySelectorAll('.faq-item')
    faqItems.forEach((item) => {
      const btn = item.querySelector('.faq-q')
      const panel = item.querySelector('.faq-a')
      if (!btn || !panel) return

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('faq-open')

        faqItems.forEach((i) => {
          i.classList.remove('faq-open')
          const p = i.querySelector('.faq-a')
          if (p) p.style.maxHeight = null
          const b = i.querySelector('.faq-q')
          if (b) b.setAttribute('aria-expanded', 'false')
        })

        if (!isOpen) {
          item.classList.add('faq-open')
          panel.style.maxHeight = panel.scrollHeight + 'px'
          btn.setAttribute('aria-expanded', 'true')
        }
      })
    })

    // Final CTA reveal
    document.querySelectorAll('.fcta-reveal').forEach((el) => {
      el.classList.add('fcta-visible')
    })

    // Header nav active state: highlight link for section in view
    const SECTION_NAV = {
      solution: 'nav-features',
      results: 'nav-how',
      pricing: 'nav-pricing',
      'social-proof': 'nav-reviews',
      faq: 'nav-faq',
    }
    const sectionIds = Object.keys(SECTION_NAV)
    const sectionEls = sectionIds.map((id) => document.getElementById(id)).filter(Boolean)

    function clearHeaderActive() {
      headerEl?.querySelectorAll('.header-nav-link, .header-mobile-link').forEach((l) => {
        l.classList.remove('active')
      })
    }
    function setHeaderActive(sectionId) {
      clearHeaderActive()
      const navId = SECTION_NAV[sectionId]
      if (!navId) return
      const desktopLink = document.getElementById(navId)
      if (desktopLink) desktopLink.classList.add('active')
      const mobileMenu = document.getElementById('header-mobile')
      const mobileLink = mobileMenu?.querySelector(`[data-section="${sectionId}"]`)
      if (mobileLink) mobileLink.classList.add('active')
    }

    let navObserver = null
    if (sectionEls.length && typeof IntersectionObserver !== 'undefined') {
      navObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setHeaderActive(entry.target.id)
          })
        },
        { rootMargin: '-12% 0px -58% 0px', threshold: 0 }
      )
      sectionEls.forEach((el) => navObserver.observe(el))
    }

    function handleNavClick(e) {
      const href = e.currentTarget.getAttribute('href')
      if (!href || href.charAt(0) !== '#' || href === '#login' || href === '#register') return
      const targetId = href.slice(1)
      const target = document.getElementById(targetId)
      if (!target) return
      e.preventDefault()
      const headerHeight = headerEl?.getBoundingClientRect().height ?? 64
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16
      window.scrollTo({ top, behavior: 'smooth' })
      const mobileMenuEl = document.getElementById('header-mobile')
      const burgerEl = document.getElementById('header-burger')
      if (burgerEl?.classList.contains('open') && mobileMenuEl) {
        burgerEl.classList.remove('open')
        mobileMenuEl.classList.remove('open')
        mobileMenuEl.setAttribute('aria-hidden', 'true')
        document.body.style.overflow = ''
      }
    }

    const navLinks = headerEl?.querySelectorAll('.header-nav-link, .header-mobile-link') ?? []
    navLinks.forEach((link) => link.addEventListener('click', handleNavClick))

    // Hamburger toggle (header HTML has no script)
    const burger = document.getElementById('header-burger')
    const mobileMenu = document.getElementById('header-mobile')
    function closeMobile() {
      burger?.classList.remove('open')
      mobileMenu?.classList.remove('open')
      mobileMenu?.setAttribute('aria-hidden', 'true')
      document.body.style.overflow = ''
    }
    function handleBurgerClick() {
      const open = burger?.classList.contains('open')
      if (open) closeMobile()
      else {
        burger?.classList.add('open')
        mobileMenu?.classList.add('open')
        mobileMenu?.setAttribute('aria-hidden', 'false')
        document.body.style.overflow = 'hidden'
      }
    }
    burger?.addEventListener('click', handleBurgerClick)
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeMobile()
    }
    document.addEventListener('keydown', handleEscape)

    return () => {
      if (navObserver) navObserver.disconnect()
      navLinks.forEach((link) => link.removeEventListener('click', handleNavClick))
      burger?.removeEventListener('click', handleBurgerClick)
      document.removeEventListener('keydown', handleEscape)
      throttledHeaderScroll.cancel()
      window.removeEventListener('scroll', throttledHeaderScroll)
      openDemoButtons.forEach((btn) => btn.removeEventListener('click', openDemo))
      closeDemoButtons.forEach((btn) => btn.removeEventListener('click', closeDemo))
    }
  }, [])

  return (
    <>
      <div id="landing-header">
        <Header />
      </div>
      <div id="landing-demo-modal">
        <DemoModal />
      </div>
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
