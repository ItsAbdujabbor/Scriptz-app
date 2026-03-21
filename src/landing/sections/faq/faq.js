(function () {
  'use strict';

  /* ── Scroll reveal ── */
  function initReveal() {
    var els = document.querySelectorAll('.faq-reveal');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('faq-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Accordion ── */
  function initAccordion() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    items.forEach(function (item) {
      var btn    = item.querySelector('.faq-q');
      var panel  = item.querySelector('.faq-a');
      if (!btn || !panel) return;

      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('faq-open');

        /* Close every item */
        items.forEach(function (i) {
          i.classList.remove('faq-open');
          var p = i.querySelector('.faq-a');
          if (p) p.style.maxHeight = null;
          var b = i.querySelector('.faq-q');
          if (b) b.setAttribute('aria-expanded', 'false');
        });

        /* Open the clicked one (unless it was already open) */
        if (!isOpen) {
          item.classList.add('faq-open');
          panel.style.maxHeight = panel.scrollHeight + 'px';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function init() { initReveal(); initAccordion(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
