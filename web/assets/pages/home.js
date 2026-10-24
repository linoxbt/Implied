(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = function (s) { return ImpliedResults.esc(s); };

  // ---------- Hero gradient: a few colours drifting, blended per pixel ----------
  // Rendered small and scaled up by the browser, which smooths it into a mesh.
  (function gradient() {
    var cv = document.getElementById('grad');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, img = ctx.createImageData(W, H);
    var hex = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
    var P = [
      { c: hex('#635bff'), x: .15, y: .3, ax: .18, ay: .25, sx: .00021, sy: .00017, p: 0 },
      { c: hex('#00d4ff'), x: .55, y: .2, ax: .22, ay: .2, sx: .00016, sy: .00023, p: 1.7 },
      { c: hex('#ff5996'), x: .85, y: .55, ax: .15, ay: .3, sx: .00019, sy: .00014, p: 3.1 },
      { c: hex('#ffb347'), x: .7, y: .9, ax: .25, ay: .15, sx: .00013, sy: .0002, p: 4.4 },
      { c: hex('#a5b4fc'), x: .3, y: .85, ax: .2, ay: .2, sx: .00024, sy: .00012, p: 5.2 },
    ];
    var visible = true, raf = 0;
    function frame(t) {
      var pts = P.map(function (p) { return [(p.x + p.ax * Math.sin(t * p.sx + p.p)) * W, (p.y + p.ay * Math.cos(t * p.sy + p.p)) * H, p.c]; });
      var d = img.data, k = 0;
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var r = 0, g = 0, b = 0, s = 0;
        for (var i = 0; i < pts.length; i++) {
          var dx = (x - pts[i][0]) / W, dy = (y - pts[i][1]) / H, w = 1 / Math.pow(dx * dx + dy * dy * 0.6 + 0.004, 1.6);
          r += w * pts[i][2][0]; g += w * pts[i][2][1]; b += w * pts[i][2][2]; s += w;
        }
        d[k++] = r / s; d[k++] = g / s; d[k++] = b / s; d[k++] = 255;
      }
      ctx.putImageData(img, 0, 0);
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    }
    frame(8000);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting; cancelAnimationFrame(raf); if (visible && !reduce) raf = requestAnimationFrame(frame);
    }).observe(cv);
  })();

  // ---------- Hero window: the real script, with its numbers on floating cards ----------
  function overlayParts(out) {
    var o = out.overlays && out.overlays[0], res = { texts: [], chart: null };
    if (!o) return res;
    o.definition.rows.forEach(function (r) {
      var c = r.cells && r.cells[0];
      if (!c) return;
      if (c.chart) res.chart = c.chart.data; else if (c.text) res.texts.push(c.text);
    });
    return res;
  }
  function sparkline(svg, values) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var NS = 'http://www.w3.org/2000/svg', max = Math.max.apply(null, values), n = values.length;
    var pts = values.map(function (v, i) { return (i / (n - 1) * 220).toFixed(1) + ',' + (52 - v / max * 46).toFixed(1); });
    var defs = document.createElementNS(NS, 'defs'), g = document.createElementNS(NS, 'linearGradient');
    g.setAttribute('id', 'fcg'); g.setAttribute('x1', 0); g.setAttribute('x2', 0); g.setAttribute('y1', 0); g.setAttribute('y2', 1);
    [['0', '#635bff', '.35'], ['1', '#635bff', '0']].forEach(function (s) { var st = document.createElementNS(NS, 'stop'); st.setAttribute('offset', s[0]); st.setAttribute('stop-color', s[1]); st.setAttribute('stop-opacity', s[2]); g.appendChild(st); });
    defs.appendChild(g); svg.appendChild(defs);
    var area = document.createElementNS(NS, 'polygon'); area.setAttribute('points', '0,54 ' + pts.join(' ') + ' 220,54'); area.setAttribute('fill', 'url(#fcg)'); svg.appendChild(area);
    var line = document.createElementNS(NS, 'polyline'); line.setAttribute('points', pts.join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#635bff'); line.setAttribute('stroke-width', '2'); line.setAttribute('vector-effect', 'non-scaling-stroke'); svg.appendChild(line);
  }
  (async function heroChart() {
    var host = document.getElementById('hero-chart');
    var p = Object.assign({ seed: 7 }, Implied.PRESETS.earnings), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    if (out.error) { ImpliedCharts.clear(host); host.innerHTML = '<div class="on-chart-msg"><span>' + esc(out.error) + '</span></div>'; return; }
    ImpliedCharts.cloud(host, { close: c.close, time: c.time, out: out, history: 70 });
    var parts = overlayParts(out), t = parts.texts;
    var head = t.filter(function (x) { return /^IMPLIED ·/.test(x); })[0], med = t.filter(function (x) { return /^Median/.test(x); })[0], fork = t.filter(function (x) { return /^Fork:/.test(x); })[0];
    if (head) document.getElementById('fc-title').textContent = head.replace('IMPLIED · ', '').toLowerCase().replace(/^./, function (m) { return m.toUpperCase(); });
    if (med) {
      var m = med.split(' · ');
      document.getElementById('fc-median').textContent = m[0];
      document.getElementById('fc-range').textContent = m[1] || '';
    }
    if (parts.chart) sparkline(document.getElementById('fc-svg'), parts.chart.datasets[0].data);
    if (fork) {
      var f = /^Fork: (.+?) · least likely (.+)$/.exec(fork);
      document.getElementById('fc-fork-px').textContent = f ? f[1] : fork;
      document.getElementById('fc-fork-v').textContent = f ? 'Least likely in between: ' + f[2] : '';
      document.getElementById('fc-fork').hidden = false;
    }
  })();

  // ---------- The comparison: Implied against a bell curve ----------
  var COPY = {
    index: { h: 'Index options price the crash.', p: 'Puts on an index cost more than calls the same distance away. A bell curve ignores that; Implied shows the downside band stretching further than the upside.',
      li: ['Downside tail measured against upside, in words', 'Lower bands reach beyond the bell curve', 'The same view at every expiry'],
      cap: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s lower edge reaches below it: index options pay for crash risk a bell curve leaves out.' },
    meme: { h: 'High-IV names price the moonshot.', p: 'For volatile stocks the market charges for extreme rallies. The outer band runs well past where a bell curve says moves become near-impossible.',
      li: ['Fat right tail shown where it is priced', 'Skew ratio in the summary panel', 'Works on any ticker with listed options'],
      cap: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s upper edge runs past it: the market prices a fat right tail.' },
    earnings: { h: 'Before earnings, two outcomes.', p: 'When the market prices a jump up or a jump down, the middle is the least likely place to land, the opposite of what a bell curve says.',
      li: ['Both outcomes marked on the chart', 'The least likely zone between them', 'Prices named in the summary panel'],
      cap: '<b>Dashed lines:</b> a bell curve with the same median and spread. It puts the most likely price in the middle; the market prices two outcomes (orange ticks), and the middle is least likely.' },
  };
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips') };
  var bell = document.getElementById('bell'), caption = document.getElementById('caption'), copy = document.getElementById('pcopy');
  var seq = 0, last = null, key = 'index';
  function draw() {
    if (!last) return;
    ImpliedResults.present(refs, Object.assign({ bell: bell.checked }, last));
    caption.innerHTML = COPY[key].cap;
    caption.hidden = !bell.checked;
  }
  async function show(k) {
    key = k;
    var cp = COPY[k];
    copy.innerHTML = '<h3>' + cp.h + '</h3><p>' + cp.p + '</p><ul>' + cp.li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul><a class="link" href="/lab/?preset=' + k + '">Open in the Lab <span class="arr">›</span></a>';
    var my = ++seq, p = Object.assign({ seed: 7 }, Implied.PRESETS[k]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    if (my !== seq) return;
    last = { out: out, close: c.close, time: c.time, schedule: d.schedule, chain: d.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 } };
    draw();
  }
  document.querySelectorAll('[data-demo]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-demo]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      show(b.getAttribute('data-demo'));
    });
  });
  bell.addEventListener('change', draw);
  show(key);
})();
