import { useEffect, useState } from 'react'
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

import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { AnotherTen } from './components/AnotherTen'
import { Solution } from './components/Solution'
import { Results } from './components/Results'
import { SocialProof } from './components/SocialProof'
import { Pricing } from './components/Pricing'
import { FinalCta } from './components/FinalCta'
import { Footer } from './components/Footer'
import { rafThrottle } from '../lib/rafThrottle'

export function LandingPage() {
  // Billing-period toggle lifted into React state and handed to
  // <ProPricingContent> (via <Pricing>) as a controlled prop. Replaces
  // the previous imperative querySelectorAll DOM manipulation, which
  // targeted a legacy pricing markup (`.pri-toggle-btn`, `.pri-cur`, …)
  // that no longer exists after the pricing UI was unified.
  const [billingPeriod, setBillingPeriod] = useState('monthly')

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

    /* Header nav scroll-spy intentionally omitted — section headlines
     * are the visual anchor; highlighting a nav link as the user scrolls
     * was redundant chrome. */

    /* ── Smooth-scroll for header desktop nav links ─────────────────── */
    const handleNavClick = (e) => {
      const href = e.currentTarget.getAttribute('href')
      if (!href || href.charAt(0) !== '#') return
      // Auth hashes are routing targets, not in-page anchors — let the
      // browser handle them (App.jsx picks them up via hashchange).
      if (href === '#signin' || href === '#login' || href === '#register') return
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
      navLinks.forEach((link) => link.removeEventListener('click', handleNavClick))
    }
  }, [])

  return (
    <>
      <Header />
      <main id="main-content">
        <Hero />
        <AnotherTen />
        <Solution />
        <Results />
        <SocialProof />
        <Pricing billingPeriod={billingPeriod} onBillingPeriodChange={setBillingPeriod} />
        <FinalCta />
        <Footer />
      </main>
    </>
  )
}
