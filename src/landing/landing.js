/**
 * Landing page only: header scroll, hero fade-in, demo modal.
 * Used by landing.html. CTAs link to app.html for login/register.
 */
(function () {
  'use strict';

  var prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function run() {
    var header = document.getElementById('header');

    function updateHeaderScroll() {
      if (!header) return;
      var isScrolled = window.scrollY > 60;
      header.classList.toggle('scrolled', isScrolled);
      if (isScrolled) header.classList.add('header-ready');
    }
    window.addEventListener('scroll', updateHeaderScroll, { passive: true });
    updateHeaderScroll();

    /* Header-ready set immediately so no animation on refresh; expand/tighten only when scrolling */
    if (header) {
      header.classList.add('header-ready');
    }

    /* Hero fade-in: reveal content with smooth stagger */
    var heroContent = document.getElementById('hero-content');
    if (heroContent && !prefersReducedMotion) {
      requestAnimationFrame(function () {
        setTimeout(function () {
          heroContent.classList.add('hero-visible');
        }, 80);
      });
    } else if (heroContent) {
      heroContent.classList.add('hero-visible');
    }

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add('revealed');
        });
      },
      { threshold: 0, rootMargin: '0px 0px -20px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(function (el) {
      if (prefersReducedMotion) el.classList.add('revealed');
      else revealObserver.observe(el);
    });

    /* Demo modal */
    var demoModal = document.getElementById('demo-modal');
    var openDemoButtons = document.querySelectorAll('[data-open-demo]');
    var closeDemoButtons = document.querySelectorAll('[data-close-demo]');
    function openDemo() {
      if (demoModal) {
        demoModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
    }
    function closeDemo() {
      if (demoModal) {
        demoModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    }
    openDemoButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openDemo();
      });
    });
    closeDemoButtons.forEach(function (btn) {
      btn.addEventListener('click', closeDemo);
    });
    if (demoModal) {
      demoModal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDemo();
      });
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
