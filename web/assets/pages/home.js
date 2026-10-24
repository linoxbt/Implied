(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var QS = [0.025, 0.10, 0.25, 0.50, 0.75, 0.90, 0.975];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var fmt = function (v) { return ImpliedCharts.fmtPrice(v); };
  var day = function (ts) { var d = new Date(ts * 1000); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- Data: run the real script on a preset ----------
  function run(key) {
    var p = Object.assign({ seed: 7 }, Implied.PRESETS[key]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    return Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time }).then(function (out) {
      if (out.error) throw new Error(out.error);
      var bands = out.projections.slice(0, 7).map(function (p) { return p.series; }), marks = out.projections.slice(7).map(function (p) { return p.series; });
      var L = 0; bands[0].forEach(function (v, i) { if (v != null) L = i; });
      var texts = [];
      (out.overlays[0] ? out.overlays[0].definition.rows : []).forEach(function (r) { var c0 = r.cells && r.cells[0]; if (c0 && c0.text) texts.push(c0.text); });
      return { close: c.close, time: c.time, bands: bands, marks: marks, L: L, texts: texts };
    });
  }
  // The bell curve with the same median and 10th-90th spread at every bar.
  function bellOf(d) {
    var lo = [], hi = [];
    for (var i = 0; i <= d.L; i++) {
      var m = d.bands[3][i], s = i ? Math.log(d.bands[5][i] / d.bands[1][i]) / 2.5631 : 0;
      lo.push(m * Math.exp(-1.96 * s)); hi.push(m * Math.exp(1.96 * s));
    }
    return { lo: lo, hi: hi };
  }
  // Probability that price at bar k ends below P, from the seven quantiles (log-linear between them).
  function probBelow(d, k, P) {
    var q = d.bands.map(function (b) { return b[k]; });
    var at = function (j) { return QS[j - 1] + Math.log(P / q[j - 1]) / Math.log(q[j] / q[j - 1]) * (QS[j] - QS[j - 1]); };
    if (P <= q[1]) return Math.max(0.001, at(1)); // below the 10th: extend the 2.5-10 slope
    if (P >= q[5]) return Math.min(0.999, at(6)); // above the 90th: extend the 90-97.5 slope
    for (var j = 2; j <= 5; j++) if (P <= q[j]) return at(j);
    return 0.5;
  }
  function oddsText(d, k, P) {
    var below = probBelow(d, k, P), pct = function (x) { return x < 0.02 ? 'under 2%' : x > 0.98 ? 'over 98%' : Math.round(x * 100) + '%'; };
    return below < 0.5 ? pct(below) + ' chance it ends below ' + fmt(P) : pct(1 - below) + ' chance it ends above ' + fmt(P);
  }

  // ---------- The renderer: history + cloud, full bleed ----------
  // o: { hist (bars of history), histFrac, padT, padB, cloud (0..1), bell ('dashed'|'fill'|null), fork, labels }
  function render(svg, d, o) {
    var w = Math.max(320, svg.clientWidth), h = Math.max(260, svg.clientHeight);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var H = o.hist, hist = d.close.slice(-H), times = d.time.slice(-H), L = d.L, bell = o.bell ? bellOf(d) : null;
    var x0 = w * o.histFrac, xr = w - (o.padR || 0);
    var X = function (i) { return i <= 0 ? x0 + i / (H - 1) * x0 : x0 + i / L * (xr - x0); };
    var vals = hist.slice();
    for (var i = 0; i <= L; i++) { vals.push(d.bands[0][i], d.bands[6][i]); if (bell) vals.push(bell.lo[i], bell.hi[i]); }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), sp = hi - lo;
    lo -= sp * 0.04; hi += sp * 0.04;
    var Y = function (v) { return o.padT + (1 - (v - lo) / (hi - lo)) * (h - o.padT - o.padB); };
    var defs = el('defs', {}, svg), id = svg.id;
    var hg = el('linearGradient', { id: id + '-h', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }, hg); el('stop', { offset: .5, 'stop-color': '#fff', 'stop-opacity': .12 }, hg); el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': .95 }, hg);
    var cg = el('linearGradient', { id: id + '-c', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#7aa2ff' }, cg); el('stop', { offset: 1, 'stop-color': '#4f6dff' }, cg);
    var glow = el('filter', { id: id + '-g', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    el('feGaussianBlur', { stdDeviation: 6 }, glow);

    // grid + price labels
    var step = Math.pow(10, Math.floor(Math.log10(sp / 4))); if (sp / step > 8) step *= 2.5; if (sp / step > 8) step *= 2;
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      el('line', { x1: 0, x2: w, y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.045)' }, svg);
      if (o.labels) el('text', { x: w - 12, y: Y(v) - 6, fill: 'rgba(255,255,255,.32)', 'font-size': 11, 'text-anchor': 'end', 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = v.toFixed(sp < 20 ? 1 : 0);
    }
    // future zone
    el('rect', { x: x0, y: 0, width: w - x0, height: h, fill: 'rgba(91,141,239,.03)' }, svg);
    el('line', { x1: x0, x2: x0, y1: o.padT * .5, y2: h - o.padB * .5, stroke: 'rgba(255,255,255,.16)', 'stroke-dasharray': '2 5' }, svg);
    if (o.labels) {
      el('text', { x: x0 - 10, y: h - o.padB * .5 - 6, fill: 'rgba(255,255,255,.4)', 'font-size': 11, 'text-anchor': 'end', 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = 'Today';
      el('text', { x: x0 + 10, y: h - o.padB * .5 - 6, fill: 'rgba(255,255,255,.4)', 'font-size': 11, 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = 'Projection to ' + day(times[times.length - 1] + L * 86400) + ' →';
    }
    // bell (fill = what others draw; dashed = for comparison)
    if (bell) {
      var bpts = function (arr) { return arr.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }); };
      if (o.bell === 'fill') {
        el('polygon', { points: bpts(bell.hi).concat(bpts(bell.lo).reverse()).join(' '), fill: 'rgba(255,122,144,.16)' }, svg);
        el('polyline', { points: bpts(bell.hi).join(' '), fill: 'none', stroke: '#ff7a90', 'stroke-width': 1.6 }, svg);
        el('polyline', { points: bpts(bell.lo).join(' '), fill: 'none', stroke: '#ff7a90', 'stroke-width': 1.6 }, svg);
      }
    }
    // the cloud
    if (o.cloud) {
      var g = el('g', { opacity: o.cloud }, svg);
      [[0, 6, .13], [1, 5, .2], [2, 4, .38]].forEach(function (b) {
        var top = [], bot = [];
        for (var i = 0; i <= L; i++) { top.push(X(i).toFixed(1) + ',' + Y(d.bands[b[1]][i]).toFixed(1)); bot.unshift(X(i).toFixed(1) + ',' + Y(d.bands[b[0]][i]).toFixed(1)); }
        el('polygon', { points: top.concat(bot).join(' '), fill: 'url(#' + id + '-c)', 'fill-opacity': b[2] }, g);
      });
      var med = []; for (var j = 0; j <= L; j++) med.push(X(j).toFixed(1) + ',' + Y(d.bands[3][j]).toFixed(1));
      el('polyline', { points: med.join(' '), fill: 'none', stroke: '#c9d6ff', 'stroke-width': 1.4, 'stroke-dasharray': '2 5', opacity: .8 }, g);
    }
    if (bell && o.bell === 'dashed') ['lo', 'hi'].forEach(function (s) {
      el('polyline', { points: bell[s].map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' '), fill: 'none', stroke: '#ff7a90', 'stroke-width': 1.5, 'stroke-dasharray': '6 6', opacity: .85 }, svg);
    });
    // history
    el('polyline', { points: hist.map(function (v, i) { return X(i - (H - 1)).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' '), fill: 'none', stroke: 'url(#' + id + '-h)', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, svg);
    el('circle', { cx: x0, cy: Y(hist[H - 1]), r: 9, fill: '#fff', opacity: .12 }, svg);
    el('circle', { cx: x0, cy: Y(hist[H - 1]), r: 3.5, fill: '#fff' }, svg);
    // the Fork
    if (o.fork && o.cloud && d.marks.length === 3) {
      var hiM = d.marks[0], loM = d.marks[1], vaM = d.marks[2], k = -1;
      for (var m = 0; m < hiM.length; m++) if (hiM[m] != null) k = m;
      if (k > 0) {
        [[hiM[k], '#ffb347', 'Outcome ' + fmt(hiM[k])], [loM[k], '#ffb347', 'Outcome ' + fmt(loM[k])], [vaM[k], '#9aa3b8', 'Least likely ' + fmt(vaM[k])]].forEach(function (f, n) {
          var y = Y(f[0]), xa = X(Math.max(1, k - 6)), xb = X(k);
          if (n < 2) el('line', { x1: xa, x2: xb, y1: y, y2: y, stroke: f[1], 'stroke-width': 7, opacity: .35, filter: 'url(#' + id + '-g)' }, svg);
          el('line', { x1: xa, x2: xb, y1: y, y2: y, stroke: f[1], 'stroke-width': n < 2 ? 3 : 2, 'stroke-dasharray': n < 2 ? null : '3 4', 'stroke-linecap': 'round' }, svg);
          el('text', { x: xb + 10, y: y + 4, fill: f[1], 'font-size': 12.5, 'font-weight': 600, 'font-family': 'Inter, sans-serif' }, svg).textContent = f[2];
        });
      }
    }
    return { X: X, Y: Y, x0: x0, xr: xr, lo: lo, hi: hi, H: H, L: L, h: h, w: w, hist: hist, times: times, invY: function (py) { return lo + (1 - (py - o.padT) / (h - o.padT - o.padB)) * (hi - lo); } };
  }

  // ---------- Stage: the hero ----------
  var stage = document.getElementById('stage'), ro = { date: document.getElementById('ro-date'), main: document.getElementById('ro-main') };
  var hero = null, geo = null, cross = null;
  function stageOpts() {
    var narrow = stage.clientWidth < 760;
    return { hist: narrow ? 50 : 110, histFrac: narrow ? 0.28 : 0.47, padT: narrow ? 360 : 110, padB: narrow ? 120 : 90, padR: narrow ? 64 : 90, cloud: 1, fork: true, labels: true };
  }
  function drawStage() {
    if (!hero) return;
    geo = render(stage, hero, stageOpts());
    cross = el('g', { visibility: 'hidden' }, stage);
    el('line', { class: 'cx', stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '3 4' }, cross);
    el('line', { class: 'cy', stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '3 4' }, cross);
    el('circle', { r: 5, fill: '#fff' }, cross);
    defaultReadout();
  }
  function defaultReadout() {
    var k = hero.L, P = hero.close[hero.close.length - 1];
    ro.date.textContent = day(hero.time[hero.time.length - 1] + k * 86400) + ' · ' + k + ' days out';
    ro.main.textContent = oddsText(hero, k, P) + ', today\'s price';
  }
  function point(ev) {
    if (!geo) return;
    var r = stage.getBoundingClientRect(), px = (ev.clientX - r.left) * geo.w / r.width, py = (ev.clientY - r.top) * geo.h / r.height;
    if (px < geo.x0 + 4 || px > geo.xr) {
      if (px < geo.x0 && px > 0) {
        var i = Math.round(px / geo.x0 * (geo.H - 1));
        ro.date.textContent = day(geo.times[i]); ro.main.textContent = 'Closed at ' + fmt(geo.hist[i]);
      } else defaultReadout();
      cross.setAttribute('visibility', 'hidden'); return;
    }
    var k = Math.max(1, Math.min(geo.L, Math.round((px - geo.x0) / (geo.xr - geo.x0) * geo.L)));
    var P = Math.max(geo.lo, Math.min(geo.hi, geo.invY(py)));
    var cx = geo.X(k), cy = geo.Y(P), ls = cross.querySelectorAll('line');
    ls[0].setAttribute('x1', cx); ls[0].setAttribute('x2', cx); ls[0].setAttribute('y1', 0); ls[0].setAttribute('y2', geo.h);
    ls[1].setAttribute('x1', geo.x0); ls[1].setAttribute('x2', geo.w); ls[1].setAttribute('y1', cy); ls[1].setAttribute('y2', cy);
    cross.querySelector('circle').setAttribute('cx', cx); cross.querySelector('circle').setAttribute('cy', cy);
    cross.setAttribute('visibility', 'visible');
    ro.date.textContent = day(geo.times[geo.times.length - 1] + k * 86400) + ' · ' + k + ' days out';
    ro.main.textContent = oddsText(hero, k, P);
  }
  stage.addEventListener('pointermove', point);
  stage.addEventListener('pointerleave', function () { if (cross) cross.setAttribute('visibility', 'hidden'); if (hero) defaultReadout(); });

  // ---------- Scrolly: one chart, four states ----------
  var sc = document.getElementById('scrolly'), data = {}, state = 'bell';
  var STATES = {
    bell: { key: 'index', title: 'A bell curve', sub: 'what an expected-move tool draws', cloud: 0, bell: 'fill' },
    skew: { key: 'index', title: 'Index: crash skew', sub: 'the downside priced further than the upside', cloud: 1, bell: 'dashed' },
    tail: { key: 'meme', title: 'High IV: a fat right tail', sub: 'big rallies priced past the bell curve', cloud: 1, bell: 'dashed' },
    fork: { key: 'earnings', title: 'Earnings: the Fork', sub: 'two outcomes; the middle is least likely', cloud: 1, bell: 'dashed', fork: true },
  };
  function drawScrolly() {
    var s = STATES[state], d = data[s.key];
    if (!d) return;
    document.getElementById('sf-title').textContent = s.title;
    document.getElementById('sf-sub').textContent = s.sub;
    render(sc, d, { hist: 60, histFrac: 0.3, padT: 30, padB: 40, padR: 140, cloud: s.cloud, bell: s.bell, fork: s.fork, labels: true });
  }
  function setState(next) {
    if (next === state) return;
    state = next;
    document.querySelectorAll('.step').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-state') === state); });
    sc.classList.add('fade');
    setTimeout(function () { drawScrolly(); sc.classList.remove('fade'); }, 180);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) setState(e.target.getAttribute('data-state')); }); }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('.step').forEach(function (s) { io.observe(s); });
  }
  document.querySelector('.step').classList.add('on');

  // ---------- Numbers ----------
  function numbers(d) {
    var k = d.L, P = d.close[d.close.length - 1], end = day(d.time[d.time.length - 1] + k * 86400);
    var above = 1 - probBelow(d, k, P), fork = d.texts.filter(function (t) { return /^Fork:/.test(t); })[0], tail = d.texts.filter(function (t) { return /tail/.test(t); })[0];
    var items = [[Math.round(above * 100) + '%', 'chance DEMO ends above today\'s ' + fmt(P) + ' by ' + end]];
    var f = fork && /^Fork: (\S+) \/ (\S+) · least likely (\S+)/.exec(fork);
    if (f) items.push([f[1] + ' or ' + f[2], 'the two outcomes priced after earnings; ' + f[3] + ' in between is the least likely']);
    var t = tail && /^(Upside|Downside) tail ([\d.]+)× (upside|downside)(?: \(to (\d+) days\))?/.exec(tail);
    if (t) items.push([t[2] + '×', 'fatter ' + t[1].toLowerCase() + ' tail than ' + t[3] + (t[4] ? ', out to ' + t[4] + ' days' : '')]);
    document.getElementById('nb-grid').innerHTML = items.map(function (it) { return '<div class="nb"><b>' + ImpliedResults.esc(it[0]) + '</b><span>' + ImpliedResults.esc(it[1]) + '</span></div>'; }).join('');
  }

  // ---------- Go ----------
  run('earnings').then(function (d) {
    hero = data.earnings = d; drawStage(); numbers(d);
    return Promise.all([run('index'), run('meme')]);
  }).then(function (r) {
    data.index = r[0]; data.meme = r[1]; drawScrolly();
  }).catch(function (e) { ro.main.textContent = String(e.message || e); });
  var t;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { drawStage(); drawScrolly(); }, 120); });
})();
