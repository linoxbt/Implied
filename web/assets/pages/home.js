(function () {
  'use strict';
  var M = ImpliedMarket, fmt = ImpliedCharts.fmtPrice, esc = ImpliedResults.esc;
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) { var n = document.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }

  // ---------- Market overview table ----------
  // Every number in a row comes from the script's own run: the painted bands
  // at the farthest expiry it draws, and the text of its summary panel. Only
  // the ATM IV column models one more expiry (the one nearest 30 days).
  function first(list, test) { for (var i = 0; i < list.length; i++) if (test(list[i])) return list[i]; return null; }
  function lastPainted(series) { for (var i = series.length - 1; i >= 0; i--) if (series[i] != null) return { bar: i, v: series[i] }; return null; }
  function summary(d) {
    var near30 = first(d.expiries.slice().sort(function (a, b) { return Math.abs(a.dte - 30) - Math.abs(b.dte - 30); }), function (e) { return e.ok; });
    var P = d.out.error ? [] : d.out.projections, q025 = P[0] && lastPainted(P[0].series), q50 = P[3] && lastPainted(P[3].series), q975 = P[6] && lastPainted(P[6].series);
    var texts = d.out.overlays[0] ? d.out.overlays[0].definition.rows.map(function (r) { return r.cells[0] && r.cells[0].text; }).filter(Boolean) : [];
    var fork = first(texts, function (t) { return /^Fork: /.test(t); }), head = first(texts, function (t) { return /^IMPLIED · \d+-DAY/.test(t); });
    var tag = first(texts, function (t) { return /^(Upside|Downside) tail|^Close to symmetric/.test(t); });
    var prev = d.close[d.close.length - 2], last = d.close[d.close.length - 1];
    return { d: d, last: last, chg: last / prev - 1, near30: near30, iv: near30 && M.atmIv(near30),
      band: q50 && q025 && q975 ? { lo: q025.v, mid: q50.v, hi: q975.v, day: q50.bar, skew: Math.log(q975.v / q50.v) / Math.log(q50.v / q025.v) } : null,
      tag: tag ? tag.replace(/ \(to \d+ days\)$/, '') : null,
      fork: fork && fork.replace(/^Fork: /, '').replace(/ · least likely.*/, ''), forkDay: head && +head.match(/(\d+)-DAY/)[1] };
  }
  function row(s) {
    var b = s.band, tag = s.tag && s.tag !== 'Close to symmetric' ? s.tag : null, kind = s.fork ? 'fork' : !tag ? 'flat' : /^Downside/.test(tag) ? 'down' : 'up';
    var shape = s.fork ? '<span class="tag-fork">Fork · ' + esc(s.fork) + ' <span class="muted small">(' + s.forkDay + 'd)</span></span>' : esc(tag || 'Close to symmetric');
    return '<tr data-k="' + kind + '" data-href="/symbol/?t=' + s.d.sym + '"><td><a href="/symbol/?t=' + s.d.sym + '">' + s.d.sym + '</a></td><td>' + esc(s.d.name) + '</td>' +
      '<td class="num">' + fmt(s.last) + ' <span class="' + (s.chg >= 0 ? 'up' : 'down') + '">' + (s.chg >= 0 ? '+' : '') + (s.chg * 100).toFixed(2) + '%</span></td>' +
      '<td class="num">' + (s.iv ? (s.iv * 100).toFixed(1) + '% <span class="muted small">' + s.near30.dte + 'd</span>' : '—') + '</td>' +
      '<td class="num">' + (b ? fmt(b.mid) : '—') + '</td>' +
      '<td class="num">' + (b ? fmt(b.lo) + ' – ' + fmt(b.hi) + ' <span class="muted small">' + b.day + 'd</span>' : '—') + '</td>' +
      '<td class="num">' + (b ? b.skew.toFixed(2) : '—') + '</td><td>' + shape + '</td></tr>';
  }
  var tbody = document.querySelector('#mkt tbody'), filter = 'all', loaded = {};
  // One ticker at a time, yielding between them, so the page stays responsive.
  var yieldNow = function () { return new Promise(function (res) { setTimeout(res, 0); }); };
  (async function () {
    var rows = [];
    for (var i = 0; i < Implied.TICKERS.length; i++) {
      var d = await M.load(Implied.TICKERS[i].sym);
      loaded[d.sym] = d; rows.push(row(summary(d)));
      tbody.innerHTML = rows.join('') + '<tr class="empty" hidden><td colspan="8" class="muted">No ticker matches this filter.</td></tr>';
      apply();
      await yieldNow();
    }
    tbody.querySelectorAll('tr[data-href]').forEach(function (tr) { tr.addEventListener('click', function (e) { if (e.target.tagName !== 'A') location.href = tr.getAttribute('data-href'); }); });
    shots();
  })().catch(function (e) { tbody.innerHTML = '<tr><td colspan="8">' + esc(e.message || e) + '</td></tr>'; });
  function apply() {
    var n = 0, rows = tbody.querySelectorAll('tr[data-k]');
    rows.forEach(function (tr) { var on = filter === 'all' || tr.getAttribute('data-k') === filter; tr.hidden = !on; if (on) n++; });
    var empty = tbody.querySelector('tr.empty'); if (empty) empty.hidden = n > 0;
    document.getElementById('mkt-n').textContent = 'Showing ' + n + ' of ' + rows.length + ' simulated tickers';
  }
  document.querySelectorAll('[data-f]').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-f');
      document.querySelectorAll('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      apply();
    });
  });

  // ---------- Chart card thumbnails, from the same model ----------
  function frame(host) { var s = el('svg', { viewBox: '0 0 300 150', preserveAspectRatio: 'none', 'aria-hidden': 'true' }); host.appendChild(s); return s; }
  function path(svg, xs, ys, x0, x1, y0, y1, attrs) {
    var d = xs.map(function (x, i) { return (i ? 'L' : 'M') + (16 + (x - x0) / (x1 - x0) * 268).toFixed(1) + ' ' + (134 - (ys[i] - y0) / (y1 - y0) * 112).toFixed(1); }).join('');
    return el('path', Object.assign({ d: d, fill: 'none' }, attrs), svg);
  }
  function shots() {
    var ern = loaded.XERN, idx = loaded.XIDX;
    var fe = first(ern.expiries, function (e) { return e.ok && e.ex.shape.fork; }) || first(ern.expiries, function (e) { return e.ok; });
    var ie = first(idx.expiries, function (e) { return e.dte >= 28 && e.ok; });
    var host = function (k) { return document.querySelector('[data-shot="' + k + '"]'); };
    // probability: implied vs lognormal
    (function () {
      var s = frame(host('prob')), d = ie.ex.d, q = ie.ex.shape.q, lo = q[0] - (q[6] - q[0]) * .25, hi = q[6] + (q[6] - q[0]) * .25;
      var xs = [], ys = [], ls = [];
      d.Ks.forEach(function (K, i) { if (K >= lo && K <= hi) { xs.push(K); ys.push(d.pdf[i]); ls.push(M.lognormal(ie, K).pdf); } });
      var top = Math.max.apply(null, ys.concat(ls)) * 1.05;
      path(s, xs, ls, lo, hi, 0, top, { stroke: '#94a3b8', 'stroke-width': 1.6, 'stroke-dasharray': '4 4' });
      path(s, xs, ys, lo, hi, 0, top, { stroke: '#3b82f6', 'stroke-width': 2.2 });
    })();
    // cloud: bands from the script
    (function () {
      var s = frame(host('cloud')), b = ern.out.projections.slice(0, 7).map(function (p) { return p.series; }), L = 0;
      b[0].forEach(function (v, i) { if (v != null) L = i; });
      var hist = ern.close.slice(-40), all = hist.slice(); b.forEach(function (x) { x.slice(0, L + 1).forEach(function (v) { all.push(v); }); });
      var y0 = Math.min.apply(null, all), y1 = Math.max.apply(null, all), X = function (i) { return 16 + i / (39 + L) * 268; }, Y = function (v) { return 134 - (v - y0) / (y1 - y0) * 112; };
      [[0, 6, .12], [1, 5, .18], [2, 4, .32]].forEach(function (p) {
        var pts = []; for (var i = 0; i <= L; i++) pts.push(X(39 + i) + ',' + Y(b[p[1]][i])); for (var j = L; j >= 0; j--) pts.push(X(39 + j) + ',' + Y(b[p[0]][j]));
        el('polygon', { points: pts.join(' '), fill: '#3b82f6', 'fill-opacity': p[2] }, s);
      });
      el('polyline', { points: hist.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' '), fill: 'none', stroke: '#111827', 'stroke-width': 1.4 }, s);
    })();
    // skew: market IV points and the fitted smile
    (function () {
      var s = frame(host('skew')), pts = ie.ex.pts, F = ie.ex.F, T = ie.T, xs = pts.map(function (p) { return p.K; }), iv = pts.map(function (p) { return p.iv; });
      var fit = xs.map(function (K) { return Math.sqrt(ie.ex.smile(Math.log(K / F)) / T); });
      var y0 = Math.min.apply(null, iv.concat(fit)) * .95, y1 = Math.max.apply(null, iv.concat(fit)) * 1.05, x0 = xs[0], x1 = xs[xs.length - 1];
      xs.forEach(function (K, i) { el('circle', { cx: 16 + (K - x0) / (x1 - x0) * 268, cy: 134 - (iv[i] - y0) / (y1 - y0) * 112, r: 2.2, fill: '#94a3b8' }, s); });
      path(s, xs, fit, x0, x1, y0, y1, { stroke: '#3b82f6', 'stroke-width': 2.2 });
    })();
    // expected move: straddle range vs implied 95% range by expiry
    (function () {
      var s = frame(host('em')), es = idx.expiries.filter(function (e) { return e.ok && e.dte <= 91; });
      var dt = es.map(function (e) { return e.dte; }), up = [], dn = [], hi = [], lo = [];
      es = es.filter(function (e) { return M.straddle(e); });
      dt = es.map(function (e) { return e.dte; });
      es.forEach(function (e) { var st = M.straddle(e), F = e.ex.F; up.push(F + st.price); dn.push(F - st.price); hi.push(e.ex.shape.q[6]); lo.push(e.ex.shape.q[0]); });
      var all = up.concat(dn, hi, lo), y0 = Math.min.apply(null, all), y1 = Math.max.apply(null, all);
      [hi, lo].forEach(function (a) { path(s, dt, a, dt[0], dt[dt.length - 1], y0, y1, { stroke: '#3b82f6', 'stroke-width': 2.2 }); });
      [up, dn].forEach(function (a) { path(s, dt, a, dt[0], dt[dt.length - 1], y0, y1, { stroke: '#ec4899', 'stroke-width': 1.6, 'stroke-dasharray': '4 4' }); });
    })();
    // fork: density with both outcomes
    (function () {
      var s = frame(host('fork')), d = fe.ex.d, q = fe.ex.shape.q, lo = q[0] - (q[6] - q[0]) * .2, hi = q[6] + (q[6] - q[0]) * .2, xs = [], ys = [];
      d.Ks.forEach(function (K, i) { if (K >= lo && K <= hi) { xs.push(K); ys.push(d.pdf[i]); } });
      var top = Math.max.apply(null, ys) * 1.1;
      path(s, xs, ys, lo, hi, 0, top, { stroke: '#3b82f6', 'stroke-width': 2.2 });
      var f = fe.ex.shape.fork;
      if (f) [[f.low, '#f59e0b'], [f.high, '#f59e0b'], [f.valley, '#94a3b8']].forEach(function (m) { var x = 16 + (m[0] - lo) / (hi - lo) * 268; el('line', { x1: x, x2: x, y1: 22, y2: 134, stroke: m[1], 'stroke-width': 1.6, 'stroke-dasharray': m[1] === '#94a3b8' ? '3 3' : null }, s); });
    })();
    // chain: a few rows of the chain itself
    (function () {
      var h = host('chain'), e = fe, keys = Object.keys(e.byStrike).map(Number).sort(function (a, b) { return a - b; });
      var mid = keys.reduce(function (b, k) { return Math.abs(k - ern.S) < Math.abs(b - ern.S) ? k : b; }, keys[0]), i0 = Math.max(0, keys.indexOf(mid) - 3);
      var rows = keys.slice(i0, i0 + 6).map(function (k) { var r = e.byStrike[k.toFixed(2)] || {}; return '<tr><td>' + (r.C ? r.C.b.toFixed(2) : '—') + '</td><td>' + (r.C ? r.C.a.toFixed(2) : '—') + '</td><td><b>' + k + '</b></td><td>' + (r.P ? r.P.b.toFixed(2) : '—') + '</td><td>' + (r.P ? r.P.a.toFixed(2) : '—') + '</td></tr>'; }).join('');
      h.innerHTML = '<table class="mini"><thead><tr><th>Bid</th><th>Ask</th><th>Strike</th><th>Bid</th><th>Ask</th></tr></thead><tbody>' + rows + '</tbody></table>';
    })();
  }
})();
