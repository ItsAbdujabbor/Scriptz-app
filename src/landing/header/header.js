/**
 * Scriptz AI — Landing header
 * • Sticky glass effect on scroll
 * • Hamburger / mobile menu toggle
 * • Smooth scroll with header offset
 * • Active nav link tracking via IntersectionObserver
 */
;(function () {
  'use strict'

  /* ── Section → nav-link mapping ──────────────────────────────────────────── */
  const SECTION_NAV = {
    solution: 'nav-features',
    results: 'nav-how',
    pricing: 'nav-pricing',
    'social-proof': 'nav-reviews',
    faq: 'nav-faq',
  }

  function run() {
    const header = document.getElementById('header')
    const burger = document.getElementById('header-burger')
    const mobileMenu = document.getElementById('header-mobile')
    if (!header) return

    /* ── 1. Scroll → glass effect ─────────────────────────────────────────── */
    function updateScrolled() {
      header.classList.toggle('scrolled', window.scrollY > 50)
    }
    window.addEventListener('scroll', updateScrolled, { passive: true })
    updateScrolled()

    /* ── 2. Hamburger toggle ──────────────────────────────────────────────── */
    function getHeaderHeight() {
      return header.getBoundingClientRect().height
    }

    function closeMobileMenu() {
      burger.classList.remove('open')
      burger.setAttribute('aria-expanded', 'false')
      mobileMenu.classList.remove('open')
      mobileMenu.setAttribute('aria-hidden', 'true')
      document.body.style.overflow = ''
    }

    function openMobileMenu() {
      burger.classList.add('open')
      burger.setAttribute('aria-expanded', 'true')
      mobileMenu.classList.add('open')
      mobileMenu.setAttribute('aria-hidden', 'false')
      document.body.style.overflow = 'hidden'
    }

    if (burger && mobileMenu) {
      burger.addEventListener('click', function () {
        const isOpen = burger.classList.contains('open')
        isOpen ? closeMobileMenu() : openMobileMenu()
      })

      /* Close on Escape */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMobileMenu()
      })
    }

    /* ── 3. Smooth scroll for all header nav links ────────────────────────── */
    const allLinks = header.querySelectorAll('.header-nav-link, .header-mobile-link')

    allLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        const href = link.getAttribute('href')
        if (!href || href.charAt(0) !== '#') return

        const targetId = href.slice(1)
        const target = document.getElementById(targetId)
        if (!target) return

        e.preventDefault()

        const offset = getHeaderHeight() + 16
        const targetTop = target.getBoundingClientRect().top + window.scrollY - offset

        window.scrollTo({ top: targetTop, behavior: 'smooth' })
        closeMobileMenu()
      })
    })

    /* ── 4. Active nav link tracking ─────────────────────────────────────── */
    function clearActive() {
      header.querySelectorAll('.header-nav-link, .header-mobile-link').forEach(function (l) {
        l.classList.remove('active')
      })
    }

    function setActive(sectionId) {
      clearActive()
      const navId = SECTION_NAV[sectionId]
      if (!navId) return

      /* Desktop link */
      const desktopLink = document.getElementById(navId)
      if (desktopLink) desktopLink.classList.add('active')

      /* Mobile link (matches by data-section) */
      const mobileLink = mobileMenu
        ? mobileMenu.querySelector('[data-section="' + sectionId + '"]')
        : null
      if (mobileLink) mobileLink.classList.add('active')
    }

    /* IntersectionObserver — highlight when section is ≥ 20 % visible */
    const observed = Object.keys(SECTION_NAV)
    const sectionEls = observed
      .map(function (id) {
        return document.getElementById(id)
      })
      .filter(Boolean)

    if ('IntersectionObserver' in window && sectionEls.length) {
      const io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) setActive(entry.target.id)
          })
        },
        {
          rootMargin: '-10% 0px -60% 0px',
          threshold: 0,
        }
      )

      sectionEls.forEach(function (el) {
        io.observe(el)
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
