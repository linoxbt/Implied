// Implied — light line/scatter charts for the ticker pages: titled, with axis
// titles, vertical markers (spot, ±σ, Fork), and a hover readout of every
// series at the cursor. No dependencies.
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function ticks(lo, hi, n) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  // Value of a series at x (linear interpolation; null outside its range).
  function at(s, x) {
    var xs = s.x, n = xs.length;
    if (!n || x < xs[0] || x > xs[n - 1]) return null;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    var t = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
    return s.y[lo] + t * (s.y[hi] - s.y[lo]);
  }

  // opts: { title, subtitle, xTitle, yTitle, xFmt, yFmt, tipFmt(series, y),
  //         series: [{ name, x, y, color, width, dash, fill, points }],
  //         marks: [{ x, label, color, dash }], xMin, xMax, yMin, yMax, height }
  function line(host, opts) {
    if (host._ro) host._ro.disconnect();
    host.innerHTML = '';
    host.classList.add('plot');
    var tip = document.createElement('div'); tip.className = 'plot-tip'; host.appendChild(tip);
    var svg = null, last = 0;
    function draw() {
      var w = Math.max(300, host.clientWidth);
      if (w === last && svg) return;
      last = w;
      var h = opts.height || Math.round(Math.max(300, Math.min(460, w * 0.42)));
      if (svg) svg.remove();
      svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': opts.title || 'Chart' });
      host.insertBefore(svg, tip);
      var lg = opts.series.filter(function (s) { return s.name; }), legH = lg.length ? 26 : 0;
      var top = opts.title ? 66 : 18, pad = { l: opts.yTitle ? 70 : 48, r: 18, t: top, b: (opts.xTitle ? 56 : 34) + legH };
      var xs = [], ys = [];
      opts.series.forEach(function (s) { s.x.forEach(function (v) { xs.push(v); }); s.y.forEach(function (v) { if (v != null && isFinite(v)) ys.push(v); }); });
      var x0 = opts.xMin != null ? opts.xMin : Math.min.apply(null, xs), x1 = opts.xMax != null ? opts.xMax : Math.max.apply(null, xs);
      var y0 = opts.yMin != null ? opts.yMin : Math.min(0, Math.min.apply(null, ys)), y1 = opts.yMax != null ? opts.yMax : Math.max.apply(null, ys) * 1.08;
      if (opts.yMin == null && y0 > 0) y0 = 0;
      if (opts.yAuto) { var sp = Math.max.apply(null, ys) - Math.min.apply(null, ys); y0 = Math.min.apply(null, ys) - sp * 0.08; y1 = Math.max.apply(null, ys) + sp * 0.08; }
      var X = function (v) { return pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r); };
      var Y = function (v) { return pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b); };
      var xf = opts.xFmt || function (v) { return String(v); }, yf = opts.yFmt || function (v) { return String(v); };
      if (opts.title) {
        el('text', { x: w / 2, y: 26, 'text-anchor': 'middle', class: 'pt-title' }, svg).textContent = opts.title;
        if (opts.subtitle) el('text', { x: w / 2, y: 46, 'text-anchor': 'middle', class: 'pt-sub' }, svg).textContent = opts.subtitle;
      }
      ticks(y0, y1, h < 340 ? 4 : 5).forEach(function (v) {
        el('line', { x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v), class: 'pt-grid' }, svg);
        el('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'pt-tick' }, svg).textContent = yf(v);
      });
      ticks(x0, x1, w < 520 ? 4 : 9).forEach(function (v) {
        el('line', { x1: X(v), x2: X(v), y1: h - pad.b, y2: h - pad.b + 5, class: 'pt-axis' }, svg);
        el('text', { x: X(v), y: h - pad.b + 19, 'text-anchor': 'middle', class: 'pt-tick' }, svg).textContent = xf(v);
      });
      el('line', { x1: pad.l, x2: w - pad.r, y1: h - pad.b, y2: h - pad.b, class: 'pt-axis' }, svg);
      if (opts.xTitle) el('text', { x: (pad.l + w - pad.r) / 2, y: h - 10 - legH, 'text-anchor': 'middle', class: 'pt-axt' }, svg).textContent = opts.xTitle;
      if (opts.yTitle) { var t = el('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'pt-axt', transform: 'translate(18 ' + ((pad.t + h - pad.b) / 2) + ') rotate(-90)' }, svg); t.textContent = opts.yTitle; }
      (opts.marks || []).forEach(function (m) {
        if (m.x < x0 || m.x > x1) return;
        el('line', { x1: X(m.x), x2: X(m.x), y1: pad.t, y2: h - pad.b, stroke: m.color || '#94a3b8', 'stroke-dasharray': m.dash === false ? null : (m.dash || '4 4'), 'stroke-width': m.width || 1 }, svg);
        if (m.label) el('text', { x: X(m.x), y: pad.t - 6, 'text-anchor': 'middle', class: 'pt-mark', fill: m.color || '#64748b' }, svg).textContent = m.label;
      });
      opts.series.forEach(function (s) {
        var pts = [];
        s.x.forEach(function (v, i) { if (s.y[i] != null && isFinite(s.y[i]) && v >= x0 && v <= x1) pts.push([X(v), Y(Math.max(y0, Math.min(y1, s.y[i])))]); });
        if (!pts.length) return;
        if (s.points) { pts.forEach(function (p) { el('circle', { cx: p[0], cy: p[1], r: s.r || 3, fill: s.color }, svg); }); return; }
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
        if (s.fill) el('path', { d: d + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + Y(Math.max(y0, 0)) + 'L' + pts[0][0].toFixed(1) + ' ' + Y(Math.max(y0, 0)) + 'Z', fill: s.color, 'fill-opacity': s.fill }, svg);
        el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round' }, svg);
      });
      // legend, centred under the chart
      if (lg.length) {
        var g = el('g', { class: 'pt-legend' }, svg), xx = 0;
        lg.forEach(function (s) {
          el('line', { x1: xx, x2: xx + 18, y1: 0, y2: 0, stroke: s.color, 'stroke-width': 2.5, 'stroke-dasharray': s.dash || null }, g);
          el('text', { x: xx + 24, y: 4, class: 'pt-leg' }, g).textContent = s.name;
          xx += 40 + s.name.length * 6.6;
        });
        g.setAttribute('transform', 'translate(' + Math.max(8, (w - xx) / 2) + ' ' + (h - 12) + ')');
      }
      // hover
      var cross = el('line', { y1: pad.t, y2: h - pad.b, class: 'pt-cross', visibility: 'hidden' }, svg);
      var dots = opts.series.map(function (s) { return el('circle', { r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 1.5, visibility: 'hidden' }, svg); });
      function move(ev) {
        var r = svg.getBoundingClientRect(), mx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * w / r.width;
        if (mx < pad.l || mx > w - pad.r) return leave();
        var xv = x0 + (mx - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
        cross.setAttribute('x1', X(xv)); cross.setAttribute('x2', X(xv)); cross.setAttribute('visibility', 'visible');
        var html = '<b>' + (opts.xLabel || '') + xf(xv, true) + '</b>';
        opts.series.forEach(function (s, i) {
          var v = s.points ? null : at(s, xv);
          if (v == null) { dots[i].setAttribute('visibility', 'hidden'); return; }
          dots[i].setAttribute('cx', X(xv)); dots[i].setAttribute('cy', Y(v)); dots[i].setAttribute('visibility', 'visible');
          html += '<div class="r"><span><i style="background:' + s.color + '"></i>' + (s.name || '') + '</span><span>' + (opts.tipFmt ? opts.tipFmt(s, v, xv) : yf(v)) + '</span></div>';
        });
        tip.innerHTML = html; tip.classList.add('on');
        var left = X(xv) / w * r.width + 14, tw = tip.offsetWidth;
        if (left + tw > r.width) left = X(xv) / w * r.width - tw - 14;
        tip.style.left = Math.max(4, left) + 'px'; tip.style.top = (pad.t / h * r.height + 6) + 'px';
      }
      function leave() { tip.classList.remove('on'); cross.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); }
      svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('mouseleave', leave);
    }
    draw();
    if ('ResizeObserver' in window) { host._ro = new ResizeObserver(function () { draw(); }); host._ro.observe(host); }
    return { redraw: function () { last = 0; draw(); } };
  }

  global.ImpliedPlot = { line: line };
})(window);
