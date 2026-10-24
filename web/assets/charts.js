// Implied — SVG charts, no dependencies. Every chart is responsive (redraws
// on resize) and has a hover read-out. Colors match what the indicator paints.
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = { bg: '#0f1218', grid: 'rgba(255,255,255,.06)', axis: '#8d919b', price: '#e6e8ec', band: '#5b8def', median: '#9aa0b4', fork: '#ffb347', valley: '#7d8296', truth: 'rgba(255,255,255,.75)', dropped: '#4a4f5a', bell: '#ff7a90' };
  var QLABEL = ['2.5%', '10%', '25%', 'Median', '75%', '90%', '97.5%'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmtPrice(v) { return v == null || !isFinite(v) ? '—' : '$' + (v < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')); }
  function fmtAxis(v, span) { var d = span < 5 ? 2 : span < 50 ? 1 : 0; return v.toFixed(d); }
  function niceTicks(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function fmtDate(ts) { var d = new Date(ts * 1000); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }

  // Stops a host's previous chart from redrawing (one resize observer per host).
  function clear(host) {
    if (host._ro) { host._ro.disconnect(); host._ro = null; }
    if (host._onResize) { window.removeEventListener('resize', host._onResize); host._onResize = null; }
    host.innerHTML = '';
  }

  // Shared frame: sizing, redraw on resize, tooltip element.
  function mount(host, draw, ratio, minH, maxH) {
    host.classList.add('chart');
    clear(host);
    var tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip);
    var svg = null, last = 0;
    function render() {
      var w = Math.max(280, Math.round(host.clientWidth));
      if (w === last && svg) return;
      last = w;
      var h = Math.round(Math.max(minH, Math.min(maxH, w * ratio)));
      if (svg) svg.remove();
      svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img' });
      host.insertBefore(svg, tip);
      draw(svg, w, h, tip);
    }
    render();
    if ('ResizeObserver' in window) { host._ro = new ResizeObserver(function () { render(); }); host._ro.observe(host); }
    else { host._onResize = render; window.addEventListener('resize', render); }
    return { redraw: function () { last = 0; render(); } };
  }
  function showTip(tip, host, x, y, html, w) {
    tip.innerHTML = html; tip.classList.add('on');
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = x + 16 + tw > w ? x - tw - 16 : x + 16;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = Math.max(4, Math.min(host.clientHeight - th - 4, y - th / 2)) + 'px';
  }
  function hideTip(tip) { tip.classList.remove('on'); }
  function row(k, v, cls) { return '<div class="r' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span>' + v + '</span></div>'; }

  // ---------- Cloud: price history + what the script painted ----------
  // opts: { close, time, out (runScript result), history (bars shown), bell }
  // bell: also draw the 95% range of a symmetric bell curve (lognormal) with
  // the same median and the same 10th-90th percentile width as the cloud at
  // every bar: what an expected-move tool assumes. Where the cloud's outer
  // edges leave it, the market is pricing a lopsided or fat-tailed outcome.
  function bellRange(bands, L) {
    var lo = [], hi = [];
    for (var i = 0; i <= L; i++) {
      var q10 = bands[1].series[i], m = bands[3].series[i], q90 = bands[5].series[i];
      if (q10 == null || m == null || q90 == null || i === 0) { lo.push(i === 0 ? m : null); hi.push(i === 0 ? m : null); continue; }
      var s = Math.log(q90 / q10) / 2.5631; // a normal's 10th-90th percentile span is 2.563 sd
      lo.push(m * Math.exp(-1.96 * s)); hi.push(m * Math.exp(1.96 * s));
    }
    return { lo: lo, hi: hi };
  }
  function cloud(host, opts) {
    var out = opts.out, proj = out.projections || [];
    var hist = opts.close.slice(-(opts.history || 126)), times = opts.time.slice(-(opts.history || 126));
    var bands = proj.slice(0, 7), marks = proj.slice(7);
    var L = 0;
    if (bands.length) bands[0].series.forEach(function (v, i) { if (v != null) L = i; });
    var N = hist.length, total = N - 1 + L, lastT = times[times.length - 1];
    var bell = opts.bell && bands.length === 7 && L ? bellRange(bands, L) : null;
    return mount(host, function (svg, w, h, tip) {
      var pad = { l: 12, r: 62, t: 18, b: 30 };
      var vals = hist.slice();
      proj.forEach(function (p) { p.series.forEach(function (v, i) { if (v != null && i <= L) vals.push(v); }); });
      if (bell) bell.lo.concat(bell.hi).forEach(function (v) { if (v != null) vals.push(v); });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), sp = hi - lo;
      lo -= sp * 0.06; hi += sp * 0.06;
      var X = function (i) { return pad.l + (i / Math.max(1, total)) * (w - pad.l - pad.r); };
      var Y = function (v) { return pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b); };
      var fx = N - 1;
      el('rect', { width: w, height: h, fill: C.bg }, svg);
      niceTicks(lo, hi, h < 340 ? 4 : 6).forEach(function (v) {
        el('line', { x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v), stroke: C.grid }, svg);
        el('text', { x: w - pad.r + 8, y: Y(v) + 4, fill: C.axis, 'font-size': 11 }, svg).textContent = fmtAxis(v, hi - lo);
      });
      // month labels across history and projection
      var seen = {}, lastX = -99;
      for (var i = 0; i <= total; i++) {
        var ts = i <= fx ? times[i] : lastT + (i - fx) * 86400, d = new Date(ts * 1000), key = d.getUTCFullYear() * 12 + d.getUTCMonth();
        if (seen[key] || d.getUTCDate() > 7 || i === 0) { seen[key] = 1; continue; }
        seen[key] = 1;
        if (X(i) - lastX < 44) continue;
        lastX = X(i);
        el('line', { x1: X(i), x2: X(i), y1: h - pad.b, y2: h - pad.b + 4, stroke: C.axis }, svg);
        el('text', { x: X(i), y: h - 10, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, svg).textContent = MONTHS[d.getUTCMonth()];
      }
      // projection zone
      if (L) {
        el('rect', { x: X(fx), y: pad.t, width: X(total) - X(fx), height: h - pad.t - pad.b, fill: 'rgba(91,141,239,.035)' }, svg);
        el('line', { x1: X(fx), x2: X(fx), y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.18)', 'stroke-dasharray': '3 4' }, svg);
        el('text', { x: X(fx) + 8, y: pad.t + 12, fill: C.axis, 'font-size': 11 }, svg).textContent = 'Projection →';
      }
      // fills
      out.fills.forEach(function (f) {
        var a = proj[f.a].series, b = proj[f.b].series, pts = [], back = [];
        for (var i = 0; i <= L; i++) if (a[i] != null && b[i] != null) { pts.push(X(fx + i).toFixed(1) + ',' + Y(a[i]).toFixed(1)); back.unshift(X(fx + i).toFixed(1) + ',' + Y(b[i]).toFixed(1)); }
        if (pts.length) el('polygon', { points: pts.concat(back).join(' '), fill: f.color, 'fill-opacity': f.opacity }, svg);
      });
      // history
      el('polyline', { points: hist.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' '), fill: 'none', stroke: C.price, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, svg);
      // visible projections (median + Fork marks)
      proj.forEach(function (p) {
        if (p.hidden) return;
        var dash = p.style === 'dotted' ? '2 4' : p.style === 'dashed' ? '6 4' : null, seg = [];
        var isFork = p.color === '#ffb347';
        var flush = function () { if (seg.length > 1) el('polyline', { points: seg.join(' '), fill: 'none', stroke: p.color, 'stroke-width': isFork ? 3 : 1.8, 'stroke-dasharray': dash, 'stroke-linecap': 'round' }, svg); seg = []; };
        for (var i = 0; i <= L; i++) { var v = p.series[i]; if (v == null) flush(); else seg.push(X(fx + i).toFixed(1) + ',' + Y(v).toFixed(1)); }
        flush();
      });
      // bell-curve comparison
      if (bell) ['lo', 'hi'].forEach(function (side) {
        var pts = [];
        bell[side].forEach(function (v, i) { if (v != null) pts.push(X(fx + i).toFixed(1) + ',' + Y(v).toFixed(1)); });
        el('polyline', { points: pts.join(' '), fill: 'none', stroke: C.bell, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, svg);
        var last = bell[side][L];
        if (last != null) el('text', { x: X(total) - 4, y: Y(last) + (side === 'hi' ? -7 : 14), fill: C.bell, 'font-size': 11, 'text-anchor': 'end' }, svg).textContent = 'Bell curve ' + (side === 'hi' ? '97.5%' : '2.5%');
      });
      // hover
      var cross = el('line', { y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.35)', visibility: 'hidden' }, svg);
      var dots = bands.map(function (_, j) { return el('circle', { r: j === 3 ? 3.5 : 2.5, fill: j === 3 ? C.median : C.band, visibility: 'hidden' }, svg); });
      var hd = el('circle', { r: 3.5, fill: C.price, visibility: 'hidden' }, svg);
      function move(ev) {
        var r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        var i = Math.round((x - pad.l) / (w - pad.l - pad.r) * total);
        if (i < 0 || i > total) return leave();
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        var html;
        if (i <= fx) {
          dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
          hd.setAttribute('cx', X(i)); hd.setAttribute('cy', Y(hist[i])); hd.setAttribute('visibility', 'visible');
          html = '<b>' + fmtDate(times[i]) + '</b>' + row('Close', fmtPrice(hist[i]));
        } else {
          hd.setAttribute('visibility', 'hidden');
          var k = i - fx;
          html = '<b>' + fmtDate(lastT + k * 86400) + ' · day ' + k + '</b>';
          for (var j = 6; j >= 0; j--) {
            var v = bands[j] && bands[j].series[k];
            dots[j].setAttribute('cx', X(i)); dots[j].setAttribute('cy', Y(v)); dots[j].setAttribute('visibility', v == null ? 'hidden' : 'visible');
            html += row(QLABEL[j], fmtPrice(v));
          }
          if (bell && bell.hi[k] != null) html += row('Bell curve 95%', fmtPrice(bell.lo[k]) + ' – ' + fmtPrice(bell.hi[k]), 'bl');
          marks.forEach(function (m) { var v = m.series[k]; if (v != null) html += row(m.name.indexOf('least') >= 0 ? 'Least likely' : m.name.indexOf('lower') >= 0 ? 'Fork low' : 'Fork high', fmtPrice(v), 'fk'); });
        }
        showTip(tip, host, x, y, html, w);
      }
      function leave() { hideTip(tip); cross.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); }
      svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
    }, 0.48, 300, 520);
  }

  // ---------- Density at one expiry ----------
  // opts: { d: {Ks, pdf, cdf}, F, q, fork, truth: {Ks, pdf}?, spot }
  function densityChart(host, opts) {
    var d = opts.d, q = opts.q;
    return mount(host, function (svg, w, h, tip) {
      var pad = { l: 12, r: 16, t: 20, b: 34 };
      var span = q[6] - q[0];
      var x0 = Math.max(d.Ks[0], q[0] - span * 0.3), x1 = Math.min(d.Ks[d.Ks.length - 1], q[6] + span * 0.3);
      var ymax = 0;
      d.Ks.forEach(function (K, i) { if (K >= x0 && K <= x1) ymax = Math.max(ymax, d.pdf[i]); });
      if (opts.truth) opts.truth.Ks.forEach(function (K, i) { if (K >= x0 && K <= x1) ymax = Math.max(ymax, opts.truth.pdf[i]); });
      ymax *= 1.12;
      var X = function (v) { return pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r); };
      var Y = function (v) { return h - pad.b - v / ymax * (h - pad.t - pad.b); };
      el('rect', { width: w, height: h, fill: C.bg }, svg);
      niceTicks(x0, x1, w < 500 ? 4 : 7).forEach(function (v) {
        el('line', { x1: X(v), x2: X(v), y1: pad.t, y2: h - pad.b, stroke: C.grid }, svg);
        el('text', { x: X(v), y: h - 12, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, svg).textContent = fmtAxis(v, x1 - x0);
      });
      // band shading under the curve, same opacities as the chart cloud
      var segs = [[0, 1, .14], [1, 2, .3], [2, 4, .55], [4, 5, .3], [5, 6, .14]];
      segs.forEach(function (s) {
        var a = q[s[0]], b = q[s[1]], pts = [X(a).toFixed(1) + ',' + Y(0)];
        d.Ks.forEach(function (K, i) { if (K >= a && K <= b) pts.push(X(K).toFixed(1) + ',' + Y(d.pdf[i]).toFixed(1)); });
        pts.push(X(b).toFixed(1) + ',' + Y(0));
        el('polygon', { points: pts.join(' '), fill: C.band, 'fill-opacity': s[2] }, svg);
      });
      var line = [];
      d.Ks.forEach(function (K, i) { if (K >= x0 && K <= x1) line.push(X(K).toFixed(1) + ',' + Y(d.pdf[i]).toFixed(1)); });
      el('polyline', { points: line.join(' '), fill: 'none', stroke: C.band, 'stroke-width': 2.2 }, svg);
      if (opts.truth) {
        var tl = [];
        opts.truth.Ks.forEach(function (K, i) { if (K >= x0 && K <= x1) tl.push(X(K).toFixed(1) + ',' + Y(opts.truth.pdf[i]).toFixed(1)); });
        el('polyline', { points: tl.join(' '), fill: 'none', stroke: C.truth, 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }, svg);
      }
      el('line', { x1: X(q[3]), x2: X(q[3]), y1: pad.t, y2: h - pad.b, stroke: C.median, 'stroke-dasharray': '2 4', 'stroke-width': 1.5 }, svg);
      el('text', { x: X(q[3]) + 6, y: h - pad.b - 8, fill: C.median, 'font-size': 11 }, svg).textContent = 'median ' + fmtPrice(q[3]);
      if (opts.spot) {
        el('line', { x1: X(opts.spot), x2: X(opts.spot), y1: h - pad.b - 8, y2: h - pad.b, stroke: '#fff', 'stroke-width': 2 }, svg);
      }
      if (opts.fork) {
        [['high', C.fork], ['low', C.fork], ['valley', C.valley]].forEach(function (m) {
          var v = opts.fork[m[0]];
          el('line', { x1: X(v), x2: X(v), y1: pad.t + 16, y2: h - pad.b, stroke: m[1], 'stroke-width': m[0] === 'valley' ? 1.5 : 2.5, 'stroke-dasharray': m[0] === 'valley' ? '5 4' : null }, svg);
          var crowded = m[0] === 'valley' && (Math.abs(X(v) - X(opts.fork.high)) < 70 || Math.abs(X(v) - X(opts.fork.low)) < 70);
          if (!crowded) el('text', { x: X(v), y: pad.t + 10, fill: m[1], 'font-size': 11, 'text-anchor': 'middle', 'font-weight': 600 }, svg).textContent = m[0] === 'valley' ? 'least likely' : fmtPrice(v);
        });
      }
      el('line', { x1: pad.l, x2: w - pad.r, y1: h - pad.b, y2: h - pad.b, stroke: 'rgba(255,255,255,.2)' }, svg);
      var cross = el('line', { y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.35)', visibility: 'hidden' }, svg);
      function move(ev) {
        var r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        var v = x0 + (x - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
        if (v < x0 || v > x1) return leave();
        cross.setAttribute('x1', X(v)); cross.setAttribute('x2', X(v)); cross.setAttribute('visibility', 'visible');
        var below = cdfAt(d, v);
        showTip(tip, host, x, y, '<b>' + fmtPrice(v) + '</b>' + row('Chance below', (below * 100).toFixed(1) + '%') + row('Chance above', ((1 - below) * 100).toFixed(1) + '%'), w);
      }
      function leave() { hideTip(tip); cross.setAttribute('visibility', 'hidden'); }
      svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
    }, 0.42, 240, 380);
  }

  // ---------- Volatility smile: quotes with spread error bars + fitted curve ----------
  function smileChart(host, opts) {
    var pts = opts.pts, T = opts.T, F = opts.F;
    return mount(host, function (svg, w, h, tip) {
      var pad = { l: 46, r: 16, t: 16, b: 34 };
      var kx0 = pts[0].K, kx1 = pts[pts.length - 1].K;
      var ivs = pts.map(function (p) { return p.iv * 100; });
      var fit = [];
      if (opts.smile) for (var i = 0; i <= 120; i++) { var K = kx0 + (kx1 - kx0) * i / 120; fit.push([K, Math.sqrt(opts.smile(Math.log(K / F)) / T) * 100]); }
      var all = ivs.concat(fit.map(function (f) { return f[1]; }));
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), sp = (hi - lo) || 1;
      lo -= sp * 0.12; hi += sp * 0.12;
      var X = function (v) { return pad.l + (v - kx0) / (kx1 - kx0) * (w - pad.l - pad.r); };
      var Y = function (v) { return pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b); };
      el('rect', { width: w, height: h, fill: C.bg }, svg);
      niceTicks(lo, hi, 5).forEach(function (v) {
        el('line', { x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v), stroke: C.grid }, svg);
        el('text', { x: pad.l - 8, y: Y(v) + 4, fill: C.axis, 'font-size': 11, 'text-anchor': 'end' }, svg).textContent = v.toFixed(0) + '%';
      });
      niceTicks(kx0, kx1, w < 500 ? 4 : 7).forEach(function (v) {
        el('text', { x: X(v), y: h - 12, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, svg).textContent = fmtAxis(v, kx1 - kx0);
      });
      el('line', { x1: X(F), x2: X(F), y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.2)', 'stroke-dasharray': '3 4' }, svg);
      el('text', { x: X(F) + 6, y: pad.t + 10, fill: C.axis, 'font-size': 11 }, svg).textContent = 'forward';
      pts.forEach(function (p) {
        var sdIv = p.sdw / (2 * p.iv * T) * 100;
        el('line', { x1: X(p.K), x2: X(p.K), y1: Y(p.iv * 100 + sdIv), y2: Y(p.iv * 100 - sdIv), stroke: 'rgba(255,255,255,.28)' }, svg);
        el('circle', { cx: X(p.K), cy: Y(p.iv * 100), r: 2.6, fill: p.K < F ? '#ff8a8a' : '#8ad3ff' }, svg);
      });
      if (fit.length) el('polyline', { points: fit.map(function (f) { return X(f[0]).toFixed(1) + ',' + Y(f[1]).toFixed(1); }).join(' '), fill: 'none', stroke: C.fork, 'stroke-width': 2.4 }, svg);
      var cross = el('line', { y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.35)', visibility: 'hidden' }, svg);
      function move(ev) {
        var r = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        var best = null;
        pts.forEach(function (p) { if (!best || Math.abs(X(p.K) - x) < Math.abs(X(best.K) - x)) best = p; });
        if (!best) return;
        cross.setAttribute('x1', X(best.K)); cross.setAttribute('x2', X(best.K)); cross.setAttribute('visibility', 'visible');
        var fv = opts.smile ? Math.sqrt(opts.smile(Math.log(best.K / F)) / T) * 100 : null;
        showTip(tip, host, x, y, '<b>Strike ' + best.K + (best.K < F ? ' · put' : ' · call') + '</b>' + row('Market IV', (best.iv * 100).toFixed(2) + '%') + (fv != null ? row('Fitted IV', fv.toFixed(2) + '%') : ''), w);
      }
      function leave() { hideTip(tip); cross.setAttribute('visibility', 'hidden'); }
      svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
    }, 0.42, 240, 380);
  }

  // ---------- Raw quotes: OTM bid/ask by strike, kept vs dropped ----------
  function quotesChart(host, opts) {
    var byStrike = opts.byStrike, F = opts.F, kept = {};
    (opts.pts || []).forEach(function (p) { kept[p.K] = 1; });
    var rows = Object.keys(byStrike).map(Number).filter(function (K) { return K > 0; }).sort(function (a, b) { return a - b; }).map(function (K) {
      var q = byStrike[K.toFixed(2)] || byStrike[K];
      var side = K >= F ? q && q.C : q && q.P;
      return side ? { K: K, b: +side.b, a: +side.a, put: K < F, kept: !!kept[K] } : null;
    }).filter(Boolean);
    return mount(host, function (svg, w, h, tip) {
      var pad = { l: 46, r: 16, t: 16, b: 34 };
      var kx0 = rows[0].K, kx1 = rows[rows.length - 1].K, hi = Math.max.apply(null, rows.map(function (r) { return r.a; })) * 1.08;
      var X = function (v) { return pad.l + (v - kx0) / (kx1 - kx0) * (w - pad.l - pad.r); };
      var Y = function (v) { return pad.t + (1 - v / hi) * (h - pad.t - pad.b); };
      el('rect', { width: w, height: h, fill: C.bg }, svg);
      niceTicks(0, hi, 4).forEach(function (v) {
        el('line', { x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v), stroke: C.grid }, svg);
        el('text', { x: pad.l - 8, y: Y(v) + 4, fill: C.axis, 'font-size': 11, 'text-anchor': 'end' }, svg).textContent = '$' + fmtAxis(v, hi);
      });
      niceTicks(kx0, kx1, w < 500 ? 4 : 7).forEach(function (v) {
        el('text', { x: X(v), y: h - 12, fill: C.axis, 'font-size': 11, 'text-anchor': 'middle' }, svg).textContent = fmtAxis(v, kx1 - kx0);
      });
      el('line', { x1: X(F), x2: X(F), y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.2)', 'stroke-dasharray': '3 4' }, svg);
      var bw = Math.max(2, (w - pad.l - pad.r) / rows.length * 0.55);
      rows.forEach(function (r) {
        var col = !r.kept ? C.dropped : r.put ? '#ff8a8a' : '#8ad3ff';
        el('rect', { x: X(r.K) - bw / 2, y: Y(r.a), width: bw, height: Math.max(1.5, Y(r.b) - Y(r.a)), fill: col, rx: Math.min(2, bw / 2) }, svg);
      });
      var cross = el('line', { y1: pad.t, y2: h - pad.b, stroke: 'rgba(255,255,255,.35)', visibility: 'hidden' }, svg);
      function move(ev) {
        var rc = svg.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rc.left, y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rc.top;
        var best = null;
        rows.forEach(function (r) { if (!best || Math.abs(X(r.K) - x) < Math.abs(X(best.K) - x)) best = r; });
        cross.setAttribute('x1', X(best.K)); cross.setAttribute('x2', X(best.K)); cross.setAttribute('visibility', 'visible');
        showTip(tip, host, x, y, '<b>Strike ' + best.K + (best.put ? ' · put' : ' · call') + '</b>' + row('Bid', '$' + best.b.toFixed(2)) + row('Ask', '$' + best.a.toFixed(2)) + row('Used', best.kept ? 'yes' : 'no (filtered)'), w);
      }
      function leave() { hideTip(tip); cross.setAttribute('visibility', 'hidden'); }
      svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
    }, 0.36, 220, 340);
  }

  // ---------- The script's paint_overlay panel, drawn over a chart ----------
  // Renders the overlay definition (rows of text cells and one Chart.js line
  // chart) the way TrendSpider would place it: top left of the price chart.
  function overlay(host, def) {
    var old = host.querySelector('.ov'); if (old) old.remove();
    var box = document.createElement('div'); box.className = 'ov';
    def.rows.forEach(function (r) {
      r.cells.forEach(function (c) {
        if (c.chart) {
          var d = c.chart.data, vals = d.datasets[0].data, n = vals.length, max = Math.max.apply(null, vals) || 1;
          var W = 240, H = 84, pts = vals.map(function (v, i) { return (i / (n - 1) * W).toFixed(1) + ',' + (H - 14 - v / max * (H - 22)).toFixed(1); });
          var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H });
          el('polygon', { points: '0,' + (H - 14) + ' ' + pts.join(' ') + ' ' + W + ',' + (H - 14), fill: 'rgba(91,141,239,.25)' }, svg);
          el('polyline', { points: pts.join(' '), fill: 'none', stroke: C.band, 'stroke-width': 1.5 }, svg);
          [0, Math.round((n - 1) / 2), n - 1].forEach(function (i, k) {
            el('text', { x: i / (n - 1) * W, y: H - 2, fill: C.axis, 'font-size': 10, 'text-anchor': ['start', 'middle', 'end'][k] }, svg).textContent = d.labels[i];
          });
          box.appendChild(svg);
        } else if (c.text) {
          var p = document.createElement('div'); p.textContent = c.text;
          if (/^IMPLIED/.test(c.text)) p.className = 'ov-h';
          else if (/^Fork/.test(c.text)) p.className = 'ov-f';
          else if (/^Risk-neutral|platform limit/.test(c.text)) p.className = 'ov-s';
          box.appendChild(p);
        }
      });
    });
    host.appendChild(box);
  }

  global.ImpliedCharts = { overlay: overlay, clear: clear, cloud: cloud, density: densityChart, smile: smileChart, quotes: quotesChart, fmtPrice: fmtPrice, QLABEL: QLABEL };
})(window);
