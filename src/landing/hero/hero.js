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

    /* ── 6. Thumbnail Generator mockup — fake generation cycle ──
     *
     * Runs only while the Thumbnails view is in the active tab. We watch
     * the view's `.active` class via MutationObserver so we don't burn
     * setInterval cycles on a hidden mockup.
     *
     * Cycle (~14s end-to-end):
     *   0.0s  empty state heading + centred composer
     *   2.4s  fake user prompt slides in (right-aligned violet bubble)
     *   3.0s  generating loader appears + bar fills 0 → 100% over ~5s
     *   8.0s  loader is replaced by the finished thumbnail card
     *   12s   reset to empty state, loop again.
     */
    const tgView = document.getElementById('lin-view-thumbnails')
    const tgShell = tgView ? tgView.querySelector('.lin-tg-shell') : null
    const tgThread = document.getElementById('lin-tg-thread')

    if (tgShell && tgThread) {
      let cycleTimer = null
      let cycleRunning = false

      const PROMPTS = [
        'A smiling explorer on a misty mountain peak, bold yellow text "I SURVIVED 7 DAYS"',
        'Shocked face next to a huge pile of cash, red glow, title "I WON $1,000,000?!"',
        'Close-up iPhone 16 on a neon-purple gradient, bold white text "WORTH THE HYPE?"',
        'Ripped athlete mid-lift in dramatic red lighting, title "30-DAY TRANSFORMATION"',
      ]
      let promptIndex = 0

      function clearGenerated() {
        // Strip everything except the empty-state node.
        const empty = tgThread.querySelector('.lin-tg-empty')
        tgThread.innerHTML = ''
        if (empty) tgThread.appendChild(empty)
        tgShell.classList.remove(
          'lin-tg-shell--sending',
          'lin-tg-shell--generating',
          'lin-tg-shell--done'
        )
      }

      function appendUserMessage(text) {
        const u = document.createElement('div')
        u.className = 'lin-tg-user-msg'
        u.textContent = text
        tgThread.appendChild(u)
      }

      function appendLoaderCard() {
        const card = document.createElement('div')
        card.className = 'lin-tg-card lin-tg-card--loading'
        card.innerHTML =
          '<div class="lin-tg-card__stage">' +
          '<div class="lin-tg-fill" id="lin-tg-fill"></div>' +
          '<div class="lin-tg-pct" id="lin-tg-pct">0%</div>' +
          '</div>'
        tgThread.appendChild(card)
        return card
      }

      function appendDoneCard() {
        const card = document.createElement('div')
        card.className = 'lin-tg-card lin-tg-card--done'
        card.innerHTML =
          '<div class="lin-tg-card__img"></div>' +
          '<div class="lin-tg-card__score">90</div>' +
          '<div class="lin-tg-card__actions">' +
          '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4L16.5 3.5Z"/></svg></span>' +
          '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>' +
          '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.7 1 6.4 2.6"/><path d="M21 3v6h-6"/></svg></span>' +
          '</div>'
        tgThread.appendChild(card)
        return card
      }

      function animateFill(durationMs) {
        const fill = document.getElementById('lin-tg-fill')
        const pct = document.getElementById('lin-tg-pct')
        if (!fill || !pct) return null
        const start = performance.now()
        let raf = 0
        const tick = (now) => {
          const elapsed = now - start
          const ratio = Math.min(1, elapsed / durationMs)
          const value = Math.round(ratio * 100)
          fill.style.width = value + '%'
          pct.textContent = value + '%'
          if (ratio < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
      }

      function step(name, ms) {
        return new Promise((resolve) => {
          cycleTimer = setTimeout(() => {
            cycleTimer = null
            resolve(name)
          }, ms)
        })
      }

      async function runCycle() {
        if (cycleRunning) return
        cycleRunning = true
        try {
          while (cycleRunning) {
            clearGenerated()
            // Wait, then send the user message.
            await step('idle', 2400)
            if (!cycleRunning) break
            tgShell.classList.add('lin-tg-shell--sending')
            const prompt = PROMPTS[promptIndex % PROMPTS.length]
            promptIndex += 1
            appendUserMessage(prompt)
            await step('user-msg', 600)
            if (!cycleRunning) break
            // Generating — append loader, animate fill.
            tgShell.classList.add('lin-tg-shell--generating')
            appendLoaderCard()
            const cancelFill = animateFill(5000)
            await step('generating', 5000)
            if (cancelFill) cancelFill()
            if (!cycleRunning) break
            // Done — swap the loader for the finished card.
            const loader = tgThread.querySelector('.lin-tg-card--loading')
            if (loader) loader.remove()
            tgShell.classList.add('lin-tg-shell--done')
            appendDoneCard()
            await step('done-hold', 4000)
            if (!cycleRunning) break
          }
        } finally {
          cycleRunning = false
        }
      }

      function stopCycle() {
        cycleRunning = false
        if (cycleTimer) {
          clearTimeout(cycleTimer)
          cycleTimer = null
        }
        clearGenerated()
      }

      function syncToVisibility() {
        const isActive = tgView.classList.contains('active')
        if (isActive && !cycleRunning) {
          runCycle()
        } else if (!isActive && cycleRunning) {
          stopCycle()
        }
      }

      // Watch for the .active class flip — the sidebar nav handler at
      // the top of this file toggles it when the user clicks "Thumbnail
      // Generator" in the mockup sidebar.
      const obs = new MutationObserver(syncToVisibility)
      obs.observe(tgView, { attributes: true, attributeFilter: ['class'] })

      // Initial sync — in case Thumbnails happens to be the active view
      // on load (currently Dashboard is, but this keeps the code honest).
      syncToVisibility()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
