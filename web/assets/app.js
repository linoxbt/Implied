// Implied — shared page behaviour: menu, search, toasts, copy-text buttons, clock, sliders.
(function (global) {
  'use strict';
  var root = document.documentElement, body = document.body;

  // Menu
  var burger = document.querySelector('.burger'), menu = document.getElementById('menu');
  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', !open);
    menu.querySelectorAll('a').forEach(function (a) { a.tabIndex = open ? 0 : -1; });
    if (open) setTimeout(function () { var a = menu.querySelector('nav a'); if (a) a.focus(); }, 250);
  }
  if (burger && menu) {
    setMenu(false);
    burger.addEventListener('click', function () { setMenu(!body.classList.contains('menu-open')); });
    document.addEventListener('keydown', function (e) {
      // Escape closes the topmost layer only: the search palette sits above the menu
      var palette = document.getElementById('cmdk');
      if (e.key === 'Escape' && body.classList.contains('menu-open') && (!palette || palette.hidden)) { setMenu(false); burger.focus(); }
      if (e.key === 'Tab' && body.classList.contains('menu-open') && (!palette || palette.hidden)) {
        var f = [burger].concat([].slice.call(menu.querySelectorAll('a')));
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  document.querySelectorAll('form').forEach(function (f) { f.addEventListener('submit', function (e) { e.preventDefault(); }); });

  // Resources dropdown
  document.querySelectorAll('.dd').forEach(function (dd) {
    var btn = dd.querySelector('.dd-btn');
    btn.addEventListener('click', function (e) { e.stopPropagation(); var open = !dd.classList.contains('open'); document.querySelectorAll('.dd.open').forEach(function (x) { x.classList.remove('open'); }); dd.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); });
  });
  function closeMenus() { document.querySelectorAll('.dd.open').forEach(function (x) { x.classList.remove('open'); x.querySelector('.dd-btn').setAttribute('aria-expanded', 'false'); }); }
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var inside = document.activeElement && document.activeElement.closest && document.activeElement.closest('.dd.open');
    closeMenus();
    if (inside) inside.querySelector('.dd-btn').focus(); // focus stays visible, not on a hidden link
  });
  document.querySelectorAll('.dd').forEach(function (dd) { dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) closeMenus(); }); });

  // Keyboard hints: ⌘K on Apple devices, Ctrl K elsewhere
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (!mac) document.querySelectorAll('kbd').forEach(function (k) { if (k.textContent === '⌘K') k.textContent = 'Ctrl K'; });

  // Search palette (⌘K or /)
  var cmdk = document.getElementById('cmdk'), q = document.getElementById('cmdk-q'), lastFocus = null;
  function items() { return [].slice.call(cmdk.querySelectorAll('.cmdk-list a')); }
  if (cmdk) items().forEach(function (a, i) { a.id = 'cmdk-o' + i; });
  // The highlighted result: a class for sight, aria-selected and the input's
  // aria-activedescendant for screen readers (focus stays in the input).
  function select(a) {
    items().forEach(function (x) { x.classList.toggle('sel', x === a); x.setAttribute('aria-selected', x === a ? 'true' : 'false'); });
    if (a) { q.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
  }
  function filter() {
    var v = q.value.trim().toLowerCase(), first = null;
    items().forEach(function (a) { var on = !v || a.getAttribute('data-k').toLowerCase().indexOf(v) >= 0; a.hidden = !on; if (on && !first) first = a; });
    select(first);
    cmdk.querySelector('.cmdk-empty').hidden = !!first;
    cmdk.querySelectorAll('.cmdk-list [role=group]').forEach(function (g) { g.hidden = !g.querySelector('a:not([hidden])'); });
  }
  function openSearch(prefill) {
    if (!cmdk) return;
    lastFocus = document.activeElement; cmdk.hidden = false; q.value = prefill || ''; filter(); q.focus();
  }
  function closeSearch() {
    if (!cmdk || cmdk.hidden) return;
    cmdk.hidden = true;
    if (lastFocus && lastFocus !== document.body && lastFocus.focus) lastFocus.focus(); else q.blur(); // never leave focus in the hidden dialog
  }
  if (cmdk) {
    document.querySelectorAll('[data-search]').forEach(function (b) { b.addEventListener('click', function () { openSearch(''); }); });
    // Keep Tab inside the dialog while it is open
    cmdk.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = [q].concat(items().filter(function (a) { return !a.hidden; }));
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    cmdk.addEventListener('click', function (e) { if (e.target === cmdk) closeSearch(); });
    q.addEventListener('input', filter);
    q.addEventListener('keydown', function (e) {
      var vis = items().filter(function (a) { return !a.hidden; }), i = vis.indexOf(cmdk.querySelector('.sel'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!vis.length) return;
        i = e.key === 'ArrowDown' ? (i + 1) % vis.length : (i - 1 + vis.length) % vis.length;
        select(vis[i]);
      } else if (e.key === 'Enter' && i >= 0) { location.href = vis[i].getAttribute('href'); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdk.hidden ? openSearch() : closeSearch(); }
      else if (e.key === '/' && cmdk.hidden && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
      else if (e.key === 'Escape') closeSearch();
    });
  }

  // Header border on scroll
  var top = document.querySelector('.top');
  function onScroll() { if (top) top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Toast
  var toast = document.querySelector('.toast'), timer;
  function say(msg) { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 2600); }

  // Copy buttons: the script itself is copied on its own page (/script/).
  document.querySelectorAll('[data-copy-text]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = document.querySelector(b.getAttribute('data-copy-text'));
      navigator.clipboard.writeText(src.textContent).then(function () { say('Copied.'); }, function () { say('Copy failed.'); });
    });
  });

  // Wide tables scroll sideways on phones: make each scroll box reachable by
  // keyboard and named for screen readers (tables are also drawn later).
  function labelTables() {
    document.querySelectorAll('.table-wrap:not([tabindex])').forEach(function (w) {
      var h = w.closest('.ptable, .panel, section'), t = h && h.querySelector('h2, h3');
      w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', t ? t.textContent.trim() : 'Table');
    });
  }
  labelTables();
  new MutationObserver(labelTables).observe(document.body, { childList: true, subtree: true });

  // Range sliders: fill + live value
  // The formatted value shown beside a slider (<output for=id>) is also what
  // screen readers announce, via aria-valuetext. It is read a tick later,
  // after the page's own handler has written it.
  function paintRange(r) {
    var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%');
    setTimeout(function () { var o = r.id && document.querySelector('output[for="' + r.id + '"]'); if (o && o.textContent) r.setAttribute('aria-valuetext', o.textContent); }, 0);
  }
  document.querySelectorAll('input[type=range]').forEach(function (r) { paintRange(r); r.addEventListener('input', function () { paintRange(r); }); });

  // New York clock, regular session (holidays not included)
  var clock = document.getElementById('clock'), mk = document.getElementById('mk');
  function tick() {
    if (!clock) return;
    try {
      var now = new Date();
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
      var get = function (k) { return (parts.filter(function (p) { return p.type === k; })[0] || {}).value; };
      var hh = (+get('hour')) % 24, mm = +get('minute'), mins = hh * 60 + mm, wd = get('weekday');
      var open = wd !== 'Sat' && wd !== 'Sun' && mins >= 570 && mins < 960;
      clock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' New York · market ' + (open ? 'open' : 'closed');
      if (mk) mk.classList.toggle('open', open);
    } catch (e) { clock.textContent = 'US equities'; }
  }
  tick(); setInterval(tick, 30000);

  global.ImpliedUI = { paintRange: paintRange };
})(window);
