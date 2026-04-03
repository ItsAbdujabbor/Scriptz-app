;(function () {
  'use strict'

  function init() {
    const targets = document.querySelectorAll('.sp-reveal')
    if (!targets.length) return

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('sp-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )

    targets.forEach(function (el) {
      observer.observe(el)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
