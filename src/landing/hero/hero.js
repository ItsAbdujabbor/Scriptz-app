/**
 * Hero section — Linear-inspired interactions
 * Sidebar nav · Group collapse · Status cycle · Right tabs · AI chat
 */
(function () {
  'use strict';

  function init() {

    /* ── 1. Sidebar navigation ── */
    var navItems = document.querySelectorAll('.lin-ni[data-lin-view]');
    var views    = document.querySelectorAll('.lin-view');

    navItems.forEach(function (ni) {
      ni.addEventListener('click', function () {
        var v = ni.getAttribute('data-lin-view');
        navItems.forEach(function (n) { n.classList.remove('active'); });
        ni.classList.add('active');
        views.forEach(function (p) { p.classList.remove('active'); });
        var t = document.getElementById('lin-view-' + v);
        if (t) t.classList.add('active');
      });
    });

    /* ── 2. Group collapse / expand ── */
    document.querySelectorAll('.lin-grp-hdr[data-lin-toggle]').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var id = hdr.getAttribute('data-lin-toggle');
        var el = document.getElementById(id);
        if (el) el.classList.toggle('lin-collapsed');
      });
    });

    /* ── 3. Issue status cycle (click to advance status) ── */
    var cycle   = ['todo', 'prog', 'done'];
    var dotCls  = { todo: 'lin-dot-todo', prog: 'lin-dot-prog', done: 'lin-dot-done', back: 'lin-dot-back' };
    var stLabel = { todo: 'Idea', prog: 'In Progress', done: 'Done', back: 'Backlog' };

    document.querySelectorAll('.lin-iss').forEach(function (iss) {
      iss.addEventListener('click', function (e) {
        e.stopPropagation();
        var cur  = iss.getAttribute('data-lin-status');
        var idx  = cycle.indexOf(cur);
        var next = idx === -1 ? 'todo' : cycle[(idx + 1) % cycle.length];
        iss.setAttribute('data-lin-status', next);

        var stDiv = iss.querySelector('.lin-iss-st');
        if (stDiv) {
          stDiv.innerHTML = '<span class="lin-iss-dot ' + dotCls[next] + '"></span>' + stLabel[next];
        }
        if (next === 'done') {
          iss.classList.add('lin-iss-done');
        } else {
          iss.classList.remove('lin-iss-done');
        }
      });
    });

    /* ── 4. Right panel tabs ── */
    var rtabs    = document.querySelectorAll('.lin-rtab[data-lin-rtab]');
    var panelAct = document.getElementById('lin-panel-act');
    var panelAi  = document.getElementById('lin-panel-ai');

    rtabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        rtabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var which = tab.getAttribute('data-lin-rtab');
        if (which === 'act') {
          if (panelAct) panelAct.classList.add('active');
          if (panelAi)  panelAi.classList.remove('active');
        } else {
          if (panelAi)  panelAi.classList.add('active');
          if (panelAct) panelAct.classList.remove('active');
        }
      });
    });

    /* ── 5. AI chat ── */
    var aiInp  = document.getElementById('lin-ai-input');
    var aiSend = document.getElementById('lin-ai-send');
    var aiFeed = document.getElementById('lin-panel-ai');

    var replies = [
      'Noted. Issue statuses have been updated.',
      'Sprint is 68% complete with 4 days left — looking good!',
      'Found 2 related issues to SCR-98. Want me to link them?',
      'Cycle velocity is up 12% vs last sprint. Great work.',
      'I can auto-assign issues by workload. Enable it in Settings.',
    ];
    var ri = 0;

    function sendMsg() {
      if (!aiInp || !aiFeed) return;
      var val = aiInp.value.trim();
      if (!val) return;

      /* Switch to AI tab */
      rtabs.forEach(function (t) { t.classList.remove('active'); });
      var aiTab = document.querySelector('.lin-rtab[data-lin-rtab="ai"]');
      if (aiTab)   aiTab.classList.add('active');
      if (panelAct) panelAct.classList.remove('active');
      if (panelAi)  panelAi.classList.add('active');

      var u = document.createElement('div');
      u.className = 'lin-ai-row user';
      u.innerHTML =
        '<div class="lin-ai-who"><span class="lin-ai-dot"></span>You</div>' +
        '<div class="lin-ai-bubble">' + val.replace(/</g, '&lt;') + '</div>';
      aiFeed.appendChild(u);
      aiInp.value = '';
      aiFeed.scrollTop = aiFeed.scrollHeight;

      setTimeout(function () {
        var a = document.createElement('div');
        a.className = 'lin-ai-row ai';
        a.innerHTML =
          '<div class="lin-ai-who"><span class="lin-ai-dot"></span>Scriptz AI</div>' +
          '<div class="lin-ai-bubble">' + replies[ri++ % replies.length] + '</div>';
        aiFeed.appendChild(a);
        aiFeed.scrollTop = aiFeed.scrollHeight;
      }, 680);
    }

    if (aiSend) aiSend.addEventListener('click', sendMsg);
    if (aiInp)  aiInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMsg(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
