/**
 * Hero section — Linear-inspired interactions
 * Sidebar nav · Group collapse · Status cycle · Right tabs · AI chat
 */
;(function () {
  'use strict'

  function init() {
    /* ── 1. Sidebar navigation ── */
    const navItems = document.querySelectorAll('.lin-ni[data-lin-view]')
    const views = document.querySelectorAll('.lin-view')

    navItems.forEach(function (ni) {
      ni.addEventListener('click', function () {
        const v = ni.getAttribute('data-lin-view')
        navItems.forEach(function (n) {
          n.classList.remove('active')
        })
        ni.classList.add('active')
        views.forEach(function (p) {
          p.classList.remove('active')
        })
        const t = document.getElementById('lin-view-' + v)
        if (t) t.classList.add('active')
      })
    })

    /* ── 2. Group collapse / expand ── */
    document.querySelectorAll('.lin-grp-hdr[data-lin-toggle]').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        const id = hdr.getAttribute('data-lin-toggle')
        const el = document.getElementById(id)
        if (el) el.classList.toggle('lin-collapsed')
      })
    })

    /* ── 3. Issue status cycle (click to advance status) ── */
    const cycle = ['todo', 'prog', 'done']
    const dotCls = {
      todo: 'lin-dot-todo',
      prog: 'lin-dot-prog',
      done: 'lin-dot-done',
      back: 'lin-dot-back',
    }
    const stLabel = { todo: 'Idea', prog: 'In Progress', done: 'Done', back: 'Backlog' }

    document.querySelectorAll('.lin-iss').forEach(function (iss) {
      iss.addEventListener('click', function (e) {
        e.stopPropagation()
        const cur = iss.getAttribute('data-lin-status')
        const idx = cycle.indexOf(cur)
        const next = idx === -1 ? 'todo' : cycle[(idx + 1) % cycle.length]
        iss.setAttribute('data-lin-status', next)

        const stDiv = iss.querySelector('.lin-iss-st')
        if (stDiv) {
          stDiv.innerHTML = '<span class="lin-iss-dot ' + dotCls[next] + '"></span>' + stLabel[next]
        }
        if (next === 'done') {
          iss.classList.add('lin-iss-done')
        } else {
          iss.classList.remove('lin-iss-done')
        }
      })
    })

    /* ── 4. Right panel tabs ── */
    const rtabs = document.querySelectorAll('.lin-rtab[data-lin-rtab]')
    const panelAct = document.getElementById('lin-panel-act')
    const panelAi = document.getElementById('lin-panel-ai')

    rtabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        rtabs.forEach(function (t) {
          t.classList.remove('active')
        })
        tab.classList.add('active')
        const which = tab.getAttribute('data-lin-rtab')
        if (which === 'act') {
          if (panelAct) panelAct.classList.add('active')
          if (panelAi) panelAi.classList.remove('active')
        } else {
          if (panelAi) panelAi.classList.add('active')
          if (panelAct) panelAct.classList.remove('active')
        }
      })
    })

    /* ── 5. AI chat ── */
    const aiInp = document.getElementById('lin-ai-input')
    const aiSend = document.getElementById('lin-ai-send')
    const aiFeed = document.getElementById('lin-panel-ai')

    const replies = [
      'Noted. Issue statuses have been updated.',
      'Sprint is 68% complete with 4 days left — looking good!',
      'Found 2 related issues to SCR-98. Want me to link them?',
      'Cycle velocity is up 12% vs last sprint. Great work.',
      'I can auto-assign issues by workload. Enable it in Settings.',
    ]
    let ri = 0

    function sendMsg() {
      if (!aiInp || !aiFeed) return
      const val = aiInp.value.trim()
      if (!val) return

      /* Switch to AI tab */
      rtabs.forEach(function (t) {
        t.classList.remove('active')
      })
      const aiTab = document.querySelector('.lin-rtab[data-lin-rtab="ai"]')
      if (aiTab) aiTab.classList.add('active')
      if (panelAct) panelAct.classList.remove('active')
      if (panelAi) panelAi.classList.add('active')

      const u = document.createElement('div')
      u.className = 'lin-ai-row user'
      u.innerHTML =
        '<div class="lin-ai-who"><span class="lin-ai-dot"></span>You</div>' +
        '<div class="lin-ai-bubble">' +
        val.replace(/</g, '&lt;') +
        '</div>'
      aiFeed.appendChild(u)
      aiInp.value = ''
      aiFeed.scrollTop = aiFeed.scrollHeight

      setTimeout(function () {
        const a = document.createElement('div')
        a.className = 'lin-ai-row ai'
        a.innerHTML =
          '<div class="lin-ai-who"><span class="lin-ai-dot"></span>Scriptz AI</div>' +
          '<div class="lin-ai-bubble">' +
          replies[ri++ % replies.length] +
          '</div>'
        aiFeed.appendChild(a)
        aiFeed.scrollTop = aiFeed.scrollHeight
      }, 680)
    }

    if (aiSend) aiSend.addEventListener('click', sendMsg)
    if (aiInp)
      aiInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendMsg()
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
