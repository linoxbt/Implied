// Implied — shared page behaviour: menu, copy, toasts, reveals, clock, sliders.
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
      if (e.key === 'Escape' && body.classList.contains('menu-open')) { setMenu(false); burger.focus(); }
      if (e.key === 'Tab' && body.classList.contains('menu-open')) {
        var f = [burger].concat([].slice.call(menu.querySelectorAll('a')));
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  // Header border on scroll
  var top = document.querySelector('.top');
  function onScroll() { if (top) top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Toast
  var toast = document.querySelector('.toast'), timer;
  function say(msg) { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 2600); }

  // Copy the script
  function copyScript() {
    return fetch('/implied.js').then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (t) { return navigator.clipboard.writeText(t); })
      .then(function () { say('Copied. Paste it into the TrendSpider editor.'); })
      .catch(function () { say('Copy failed. Use the download link instead.'); });
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', copyScript); });
  document.querySelectorAll('[data-copy-text]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = document.querySelector(b.getAttribute('data-copy-text'));
      navigator.clipboard.writeText(src.textContent).then(function () { say('Copied.'); }, function () { say('Copy failed.'); });
    });
  });

  // Reveal on scroll
  var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(function (n) { io ? io.observe(n) : n.classList.add('in'); });

  // Range sliders: fill + live value
  function paintRange(r) { var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
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

  global.ImpliedUI = { say: say, paintRange: paintRange, copyScript: copyScript };
})(window);

// Words that fill in as you scroll ([data-words]), DOVV-style.
(function () {
  'use strict';
  var blocks = [].slice.call(document.querySelectorAll('[data-words]'));
  if (!blocks.length) return;
  blocks.forEach(function (b) {
    b.innerHTML = b.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w">' + w.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</span>'; }).join(' ');
  });
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    blocks.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      var ws = b.querySelectorAll('.w'), n = Math.round(p * ws.length);
      for (var i = 0; i < ws.length; i++) ws[i].classList.toggle('on', i < n);
    });
  }
  function on() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on); frame();
})();
