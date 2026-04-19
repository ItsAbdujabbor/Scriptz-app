(function () {
  'use strict';

  /* ── Scroll reveal ── */
  function initReveal() {
    var els = document.querySelectorAll('.pri-reveal');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('pri-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Billing toggle ── */
  function initToggle() {
    var section = document.getElementById('pricing');
    if (!section) return;

    var btns      = section.querySelectorAll('.pri-toggle-btn');
    var saveMsg   = section.querySelector('.pri-annual-msg');
    var curEls    = section.querySelectorAll('.pri-cur');
    var oldEls    = section.querySelectorAll('.pri-old');
    var billedEls = section.querySelectorAll('.pri-billed');
    var moEls     = section.querySelectorAll('.pri-billed-mo');

    function apply(mode) {
      var annual = mode === 'annual';

      btns.forEach(function (b) {
        b.classList.toggle('pri-toggle-active', b.dataset.period === mode);
      });

      if (saveMsg) saveMsg.classList.toggle('pri-show', annual);

      curEls.forEach(function (el) {
        el.textContent = annual ? el.dataset.annual : el.dataset.monthly;
      });

      oldEls.forEach(function (el) { el.classList.toggle('pri-hidden', !annual); });
      billedEls.forEach(function (el) { el.classList.toggle('pri-hidden', !annual); });
      moEls.forEach(function (el) { el.classList.toggle('pri-hidden', annual); });
    }

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () { apply(btn.dataset.period); });
    });
  }

  function init() { initReveal(); initToggle(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
