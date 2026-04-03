/**
 * "Another 10 of 10" section — scroll-reveal via IntersectionObserver.
 * Adds .a10-visible to .a10-reveal elements as they enter the viewport.
 */
;(function () {
  'use strict'

  function init() {
    const targets = document.querySelectorAll('.a10-reveal')
    if (!targets.length) return

    /* IntersectionObserver — trigger at 15% visibility */
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('a10-visible')
            observer.unobserve(entry.target) /* animate once */
          }
        })
      },
      { threshold: 0.15 }
    )

    targets.forEach(function (el) {
      observer.observe(el)
    })
  }

  /* Run after component HTML is injected */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
