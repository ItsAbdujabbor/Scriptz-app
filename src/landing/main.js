/**
 * Landing page loader — injects component HTML, then loads each component’s JS.
 * Run from landing/index.html. Requires components to be served over HTTP (e.g. localhost).
 */
(function () {
  'use strict';

  var COMPONENTS = [
    { id: 'landing-header',     html: 'header/header.html' },
    { id: 'landing-demo-modal', html: 'demo-modal/demo-modal.html' },
    { id: 'landing-hero',       html: 'hero/hero.html' },
    // ── Sections (add new ones here) ──
    { id: 'landing-another-10', html: 'sections/another-10/another-10.html' },
    { id: 'landing-solution',     html: 'sections/solution/solution.html' },
    { id: 'landing-results',      html: 'sections/results/results.html' },
    { id: 'landing-social-proof', html: 'sections/social-proof/social-proof.html' },
    { id: 'landing-pricing',    html: 'sections/pricing/pricing.html' },
    { id: 'landing-faq',        html: 'sections/faq/faq.html' },
    { id: 'landing-final-cta',  html: 'sections/final-cta/final-cta.html' },
    { id: 'landing-footer',     html: 'footer/footer.html' }
  ];

  var SCRIPTS = [
    'header/header.js',
    'demo-modal/demo-modal.js',
    // ── Section scripts (add new ones here) ──
    'sections/another-10/another-10.js',
    'sections/solution/solution.js',
    'sections/results/results.js',
    'sections/social-proof/social-proof.js',
    'sections/pricing/pricing.js',
    'sections/faq/faq.js',
    'sections/final-cta/final-cta.js',
    'footer/footer.js'
  ];

  function getBase() {
    var script = document.currentScript || document.querySelector('script[src*="main.js"]');
    if (script && script.src) {
      var path = script.src.replace(/\/main\.js.*$/, '/');
      return path;
    }
    return '';
  }

  function fetchHtml(path) {
    var base = getBase();
    var url = base ? base + path : path;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + path);
      return r.text();
    });
  }

  function inject(id, html) {
    var el = document.getElementById(id);
    if (el && html) el.innerHTML = html;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var base = getBase();
      var url = base ? base + src : src;
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function run() {
    var base = getBase();
    var loads = COMPONENTS.map(function (c) {
      return fetchHtml(c.html).then(function (html) {
        inject(c.id, html);
      });
    });

    Promise.all(loads)
      .then(function () {
        var next = function (i) {
          if (i >= SCRIPTS.length) return Promise.resolve();
          return loadScript(SCRIPTS[i]).then(function () { return next(i + 1); });
        };
        return next(0);
      })
      .catch(function (err) {
        console.error('Landing loader:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
