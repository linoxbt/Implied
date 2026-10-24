(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- Illustrative shapes (in standard-deviation units) ----------
  // Mixtures of normals with the qualitative shapes the Lab produces from
  // real-format chains: a bell, crash skew, a fat right tail, the Fork.
  var X = []; for (var i = 0; i <= 160; i++) X.push(-4 + 8 * i / 160);
  var npdf = function (x, m, s) { return Math.exp(-0.5 * ((x - m) / s) * ((x - m) / s)) / (s * 2.5066282746); };
  var mix = function (parts) { return X.map(function (x) { return parts.reduce(function (a, p) { return a + p[0] * npdf(x, p[1], p[2]); }, 0); }); };
  var SHAPES = [
    { title: 'A bell curve', sub: 'what an expected-move tool assumes', y: mix([[1, 0, 1]]) },
    { title: 'Index: crash skew', sub: 'the downside priced further than the upside', y: mix([[0.7, 0.42, 0.62], [0.3, -0.85, 1.25]]) },
    { title: 'High IV: a fat right tail', sub: 'big rallies priced well past the bell', y: mix([[0.66, -0.55, 0.52], [0.34, 0.95, 1.35]]) },
    { title: 'Earnings: the Fork', sub: 'two outcomes; the middle is least likely', y: mix([[0.5, -1.25, 0.55], [0.5, 1.25, 0.55]]), fork: true },
  ];
  // The bell with the same mean and standard deviation as each shape.
  SHAPES.forEach(function (s) {
    var h = X[1] - X[0], m = 0, v = 0, a = 0;
    s.y.forEach(function (y, i) { a += y * h; m += X[i] * y * h; });
    m /= a; s.y.forEach(function (y, i) { v += (X[i] - m) * (X[i] - m) * y * h; }); v /= a;
    s.bell = X.map(function (x) { return npdf(x, m, Math.sqrt(v)); });
  });

  function paths(y, w, h, pad, ymax) {
    var px = function (i) { return pad + (w - 2 * pad) * i / (X.length - 1); }, py = function (v) { return h - 18 - v / ymax * (h - 40); };
    var line = y.map(function (v, i) { return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1); }).join('');
    return { line: line, area: line + 'L' + px(X.length - 1) + ' ' + (h - 18) + 'L' + px(0) + ' ' + (h - 18) + 'Z', px: px, py: py };
  }
  function gradients(svg, id, dark) {
    var defs = el('defs', {}, svg);
    var g = el('linearGradient', { id: id + 's', x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#4f46e5' }, g); el('stop', { offset: '.55', 'stop-color': '#7c6cf6' }, g); el('stop', { offset: '1', 'stop-color': '#ff6a4d' }, g);
    var f = el('linearGradient', { id: id + 'f', x1: '0', x2: '0', y1: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#7c6cf6', 'stop-opacity': dark ? '.5' : '.32' }, f); el('stop', { offset: '1', 'stop-color': '#7c6cf6', 'stop-opacity': '0' }, f);
  }

  // ---------- Hero: one distribution, morphing between shapes ----------
  (function hero() {
    var svg = document.getElementById('morph');
    if (!svg) return;
    var W = 520, H = 260, PAD = 16, YMAX = 0.75;
    gradients(svg, 'mo', false);
    for (var k = 1; k <= 3; k++) el('line', { x1: PAD, x2: W - PAD, y1: H - 18 - k * (H - 40) / 3.4, y2: H - 18 - k * (H - 40) / 3.4, stroke: 'rgba(12,14,22,.06)' }, svg);
    el('line', { x1: PAD, x2: W - PAD, y1: H - 18, y2: H - 18, stroke: 'rgba(12,14,22,.18)' }, svg);
    var area = el('path', { fill: 'url(#mof)' }, svg);
    var bell = el('path', { fill: 'none', stroke: '#9a9fab', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }, svg);
    var line = el('path', { fill: 'none', stroke: 'url(#mos)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
    var ann = el('g', { opacity: 0, style: 'transition:opacity .4s' }, svg);
    var title = document.getElementById('morph-title'), sub = document.getElementById('morph-sub');
    var dots = [].slice.call(document.querySelectorAll('.morph-dots button'));
    var cur = SHAPES[0].y.slice(), curBell = SHAPES[0].bell.slice(), idx = 0, timer = null, raf = null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render(y, b) {
      var p = paths(y, W, H, PAD, YMAX), q = paths(b, W, H, PAD, YMAX);
      area.setAttribute('d', p.area); line.setAttribute('d', p.line); bell.setAttribute('d', q.line);
    }
    function annotate(s) {
      while (ann.firstChild) ann.removeChild(ann.firstChild);
      if (!s.fork) { ann.setAttribute('opacity', 0); return; }
      var p = paths(s.y, W, H, PAD, YMAX);
      var peak = function (lo, hi) { var b = lo; for (var i = lo; i <= hi; i++) if (s.y[i] > s.y[b]) b = i; return b; };
      var a = peak(0, 80), c = peak(80, 160), v = a; for (var i = a; i <= c; i++) if (s.y[i] < s.y[v]) v = i;
      [[a, 'Outcome A', '#d97706'], [c, 'Outcome B', '#d97706'], [v, 'Least likely', '#686e7e']].forEach(function (m) {
        var x = p.px(m[0]), y = p.py(s.y[m[0]]);
        el('line', { x1: x, x2: x, y1: y - 6, y2: H - 18, stroke: m[2], 'stroke-width': 1.5, 'stroke-dasharray': m[1] === 'Least likely' ? '3 3' : null }, ann);
        el('text', { x: x, y: m[1] === 'Least likely' ? H - 3 : y - 12, 'text-anchor': 'middle', fill: m[2], 'font-size': 12, 'font-family': 'Inter, sans-serif', 'font-weight': 600 }, ann).textContent = m[1];
      });
      ann.setAttribute('opacity', 1);
    }
    function go(n, user) {
      idx = n;
      var s = SHAPES[n], from = cur.slice(), fromB = curBell.slice(), t0 = performance.now(), dur = reduce ? 0 : 900;
      title.textContent = s.title; sub.textContent = s.sub;
      dots.forEach(function (d, i) { d.setAttribute('aria-pressed', i === n); });
      ann.setAttribute('opacity', 0);
      cancelAnimationFrame(raf);
      (function step(now) {
        var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        cur = from.map(function (v, i) { return v + (s.y[i] - v) * e; });
        curBell = fromB.map(function (v, i) { return v + (s.bell[i] - v) * e; });
        render(cur, curBell);
        if (t < 1) raf = requestAnimationFrame(step); else annotate(s);
      })(t0);
      clearTimeout(timer);
      if (!reduce && !user) timer = setTimeout(function () { go((idx + 1) % SHAPES.length); }, s.fork ? 4200 : 3200);
    }
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i, true); }); });
    render(cur, curBell);
    go(0);
  })();

  // ---------- Tile illustrations ----------
  document.querySelectorAll('svg[data-viz]').forEach(function (svg, n) {
    var kind = svg.getAttribute('data-viz'), s = SHAPES[{ skew: 1, tail: 2, fork: 3 }[kind]];
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, dark = kind === 'fork', id = 'tv' + n;
    gradients(svg, id, dark);
    var p = paths(s.y, W, H, 4, 0.75), q = paths(s.bell, W, H, 4, 0.75);
    el('line', { x1: 4, x2: W - 4, y1: H - 18, y2: H - 18, stroke: dark ? 'rgba(255,255,255,.18)' : 'rgba(12,14,22,.15)' }, svg);
    el('path', { d: p.area, fill: 'url(#' + id + 'f)' }, svg);
    el('path', { d: q.line, fill: 'none', stroke: dark ? '#6b7080' : '#9a9fab', 'stroke-width': 1.3, 'stroke-dasharray': '4 4' }, svg);
    el('path', { d: p.line, fill: 'none', stroke: 'url(#' + id + 's)', 'stroke-width': 2.5 }, svg);
  });

  // ---------- The live product chart ----------
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips') };
  var bell = document.getElementById('bell'), caption = document.getElementById('caption'), seq = 0, last = null, key = 'earnings';
  var CAPTIONS = {
    earnings: '<b>Dashed lines:</b> a bell curve with the same median and spread. A bell curve says the middle is the most likely place to land. Here the market prices two outcomes after the event (orange ticks), and the middle is the least likely.',
    index: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s lower edge reaches below it: index options pay for crash risk a bell curve leaves out.',
    meme: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s upper edge runs past it: the market prices a fat right tail, big rallies a bell curve calls near-impossible.',
  };
  function draw() {
    if (!last) return;
    ImpliedResults.present(refs, Object.assign({ bell: bell.checked }, last));
    caption.innerHTML = CAPTIONS[key];
    caption.hidden = !bell.checked;
  }
  async function show(k) {
    var my = ++seq, p = Object.assign({ seed: 7 }, Implied.PRESETS[k]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    if (my !== seq) return;
    last = { out: out, close: c.close, time: c.time, schedule: d.schedule, chain: d.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 } };
    draw();
  }
  document.querySelectorAll('[data-demo]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-demo]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      key = b.getAttribute('data-demo'); show(key);
    });
  });
  bell.addEventListener('change', draw);
  show(key);
})();
