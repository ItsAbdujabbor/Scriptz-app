/**
 * Landing demo modal — open/close, Escape key.
 */
;(function () {
  'use strict'

  function run() {
    const demoModal = document.getElementById('demo-modal')
    const openDemoButtons = document.querySelectorAll('[data-open-demo]')
    const closeDemoButtons = document.querySelectorAll('[data-close-demo]')

    function openDemo() {
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

    openDemoButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault()
        openDemo()
      })
    })

    closeDemoButtons.forEach(function (btn) {
      btn.addEventListener('click', closeDemo)
    })

    if (demoModal) {
      demoModal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDemo()
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
