(function () {
  'use strict';
  var M = ImpliedMarket, Pl = ImpliedPlot, fmt = ImpliedCharts.fmtPrice, esc = ImpliedResults.esc;
  var COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#0ea5e9'];
  var params = new URLSearchParams(location.search);
  var symParam = params.get('t') || 'XERN', tab = params.get('tab') || 'charts', chart = params.get('chart') || 'prob';
  var D = null, sel = [], $ = function (id) { return document.getElementById(id); };
  var pct = function (x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; };

  function setUrl() {
    var q = '?t=' + (D.custom ? 'custom' : D.sym) + (tab !== 'charts' ? '&tab=' + tab : '') + (tab === 'charts' && chart !== 'prob' ? '&chart=' + chart : '');
    history.replaceState(null, '', '/symbol/' + q);
  }
  function okList() { return D.expiries.filter(function (e) { return e.ok && e.dte <= 120; }); }
  // Default expiration: the first Fork if there is one, else the one nearest 30 days.
  function dflt() {
    var l = okList();
    return l.filter(function (e) { return e.ex.shape.fork; })[0] || l.slice().sort(function (a, b) { return Math.abs(a.dte - 30) - Math.abs(b.dte - 30); })[0];
  }
  function expButtons(id, list, multi) {
    return '<div class="exp-chips" id="' + id + '" role="group" aria-label="Expiration dates">' + list.map(function (e) {
      var i = sel.indexOf(e), on = i >= 0;
      return '<button type="button" data-key="' + e.key + '" aria-pressed="' + on + '">' + (on && multi ? '<i style="background:' + COLORS[i % COLORS.length] + '"></i>' : '') + e.date + ' <span class="muted">(' + e.dte + 'd)</span></button>';
    }).join('') + '</div>';
  }
  function bindExp(id, multi, redraw) {
    $(id).querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = D.expiries.filter(function (x) { return x.key === b.getAttribute('data-key'); })[0], i = sel.indexOf(e);
        if (!multi) sel = [e];
        else if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); } else { if (sel.length >= 4) sel.shift(); sel.push(e); }
        redraw();
      });
    });
  }
  function segBtns(name, opts, cur) { return '<div class="seg" role="group" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function bindSeg(host, name, fn) { host.querySelectorAll('[data-seg="' + name + '"] button').forEach(function (b) { b.addEventListener('click', function () { fn(b.getAttribute('data-v')); }); }); }
  function xRange(list, lo, hi) {
    var a = Infinity, b = -Infinity;
    list.forEach(function (e) { a = Math.min(a, quantile(e.ex.d, lo)); b = Math.max(b, quantile(e.ex.d, hi)); });
    return [a, b];
  }

  // ---------- Probability distribution ----------
  var prob = { view: 'both', fn: 'pdf', lo: null, hi: null };
  function drawProb() {
    var host = $('chart-pane'), list = okList();
    if (!sel.length || !sel[0].ok) sel = [dflt()];
    host.innerHTML = '<h2><span class="tk">' + esc(D.sym) + '</span> Option Probability</h2>' +
      '<p class="lead">Probabilities for the ending price of <b class="tk">' + esc(D.sym) + '</b> at expiration. <b>Implied</b> is recovered from every liquid strike; <b>lognormal</b> is the bell curve one at-the-money volatility assumes. Pick up to four expirations.</p>' +
      '<div class="controls"><span class="ctl-select">Expiration Dates</span>' + expButtons('pe', list, true) + '</div>' +
      '<div class="controls">' + segBtns('view', [['implied', 'Implied Probability'], ['lognormal', 'Lognormal Distribution'], ['both', 'Both']], prob.view) + segBtns('fn', [['pdf', 'Probability Density (PDF)'], ['cdf', 'Cumulative (CDF)']], prob.fn) + '</div>' +
      '<div id="pp"></div>' +
      '<div class="ptable"><h3>Probability Table</h3><p>The probability of ending below, between and above two prices at each selected expiration.</p>' +
      '<div class="range">Between <input class="in" type="number" step="any" id="p-lo" aria-label="Lower price"> and <input class="in" type="number" step="any" id="p-hi" aria-label="Upper price"><button type="button" class="btn sm" id="p-sig">±1σ</button></div>' +
      '<div class="table-wrap"><table class="data" id="pt"></table></div></div>';
    bindExp('pe', true, drawProb);
    bindSeg(host, 'view', function (v) { prob.view = v; drawProb(); });
    bindSeg(host, 'fn', function (v) { prob.fn = v; drawProb(); });
    var e0 = sel[0], r = xRange(sel, 0.003, 0.997), series = [], cdf = prob.fn === 'cdf';
    sel.forEach(function (e, i) {
      var c = COLORS[i % COLORS.length], xs = [], yi = [], yl = [], d = e.ex.d;
      d.Ks.forEach(function (K, j) { if (K >= r[0] && K <= r[1]) { xs.push(K); yi.push(cdf ? d.cdf[j] : d.pdf[j]); var l = M.lognormal(e, K); yl.push(cdf ? l.cdf : l.pdf); } });
      if (prob.view !== 'lognormal') series.push({ name: e.date + ' implied', x: xs, y: yi, color: c, width: 2.4, fill: cdf || sel.length > 1 ? null : 0.08, below: function (x) { return cdfAt(d, x); } });
      if (prob.view !== 'implied') series.push({ name: e.date + ' lognormal', x: xs, y: yl, color: c, width: 1.6, dash: '6 5', below: function (x) { return M.lognormal(e, x).cdf; } });
    });
    var marks = [{ x: D.S, label: fmt(D.S), color: '#111827', dash: '2 3' }];
    [-3, -2, -1, 1, 2, 3].forEach(function (n) { marks.push({ x: M.sigmaPrice(e0, n), label: (n > 0 ? '+' : '−') + Math.abs(n) + 'σ', color: '#9ca3af' }); });
    sel.forEach(function (e) { var f = e.ex.shape.fork; if (f) { marks.push({ x: f.low, label: 'Fork', color: '#f59e0b', dash: false, width: 1.5 }); marks.push({ x: f.high, label: 'Fork', color: '#f59e0b', dash: false, width: 1.5 }); } });
    Pl.line($('pp'), {
      title: 'Probability Distribution', subtitle: D.sym + ' · ' + (cdf ? 'cumulative probability' : 'probability density') + ' at expiration',
      xTitle: 'Underlying Price at Expiration', yTitle: cdf ? 'Probability below' : 'Probability density', xLabel: '',
      xFmt: function (v, tip) { return tip ? fmt(v) : (v < 100 ? v.toFixed(1) : Math.round(v)); }, yFmt: function (v) { return cdf ? pct(v, 0) : v.toPrecision(2); },
      tipFmt: function (s, v, x) { return pct(s.below(x)) + ' below'; }, series: series, marks: marks, xMin: r[0], xMax: r[1], yMin: 0, yMax: cdf ? 1 : null,
    });
    // probability table
    if (prob.lo == null || prob.lo < r[0] - (r[1] - r[0]) || prob.hi > r[1] + (r[1] - r[0])) { prob.lo = +M.sigmaPrice(e0, -1).toFixed(2); prob.hi = +M.sigmaPrice(e0, 1).toFixed(2); }
    var lo = $('p-lo'), hi = $('p-hi');
    lo.value = prob.lo; hi.value = prob.hi;
    function table() {
      var a = Math.min(prob.lo, prob.hi), b = Math.max(prob.lo, prob.hi);
      $('pt').innerHTML = '<thead><tr><th></th><th>Below ' + fmt(a) + '</th><th>' + fmt(a) + ' – ' + fmt(b) + '</th><th>Above ' + fmt(b) + '</th></tr></thead><tbody>' +
        series.map(function (s) { var pa = s.below(a), pb = s.below(b); return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + pct(pa, 2) + '</td><td>' + pct(pb - pa, 2) + '</td><td>' + pct(1 - pb, 2) + '</td></tr>'; }).join('') + '</tbody>';
    }
    [lo, hi].forEach(function (inp) { inp.addEventListener('input', function () { var v = Number(inp.value); if (v > 0) { if (inp === lo) prob.lo = v; else prob.hi = v; table(); } }); });
    $('p-sig').addEventListener('click', function () { prob.lo = null; drawProb(); });
    table();
  }

  // ---------- Projection cloud ----------
  function drawCloud() {
    var host = $('chart-pane');
    host.innerHTML = '<h2><span class="tk">' + esc(D.sym) + '</span> Projection Cloud</h2>' +
      '<p class="lead">What the indicator paints on your TrendSpider chart: percentile bands from the last candle out to the expirations it models, the median, and the Fork when there is one. This is the real implied.js output.</p>' +
      '<div class="controls"><label class="switch" style="margin:0;gap:10px"><input type="checkbox" id="pc-bell" checked> Compare with a bell curve (same median and spread)</label></div>' +
      '<div class="dark-card"><div class="chart-host" id="pc"></div><div class="chart-bar"><div class="chips" id="pc-chips"></div><span class="mono" id="pc-status"></span></div></div>' +
      '<div class="ptable"><h3>Expirations the script modelled</h3><div class="table-wrap" id="pc-table"></div></div>';
    var go = function () {
      ImpliedResults.present({ chart: $('pc'), chips: $('pc-chips'), status: $('pc-status'), table: $('pc-table') },
        { out: D.out, close: D.close, time: D.time, schedule: D.schedule, chain: D.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 }, bell: $('pc-bell').checked, history: 120 });
    };
    $('pc-bell').addEventListener('change', go);
    go();
  }

  // ---------- Volatility skew ----------
  function drawSkew() {
    var host = $('chart-pane'), list = okList();
    if (!sel.length) sel = [dflt()];
    host.innerHTML = '<h2><span class="tk">' + esc(D.sym) + '</span> Volatility Skew</h2>' +
      '<p class="lead">Implied volatility by strike. Dots are the market quotes Implied kept (out of the money, inside the spread limit); the line is the smile it fits through them, weighting each quote by its bid-ask spread.</p>' +
      '<div class="controls"><span class="ctl-select">Expiration Dates</span>' + expButtons('se', list, true) + '</div><div id="sp"></div>' +
      '<div class="ptable"><h3>Skew Summary</h3><div class="table-wrap"><table class="data" id="st"></table></div></div>';
    bindExp('se', true, drawSkew);
    var series = [], lo = Infinity, hi = -Infinity;
    sel.forEach(function (e, i) {
      var c = COLORS[i % COLORS.length], pts = e.ex.pts, xs = pts.map(function (p) { return p.K; });
      lo = Math.min(lo, xs[0]); hi = Math.max(hi, xs[xs.length - 1]);
      series.push({ x: xs, y: pts.map(function (p) { return p.iv * 100; }), color: c, points: true, r: 2.6 });
      var fx = [], fy = []; for (var j = 0; j <= 120; j++) { var K = xs[0] + (xs[xs.length - 1] - xs[0]) * j / 120; fx.push(K); fy.push(Math.sqrt(e.ex.smile(Math.log(K / e.ex.F)) / e.T) * 100); }
      series.push({ name: e.date + ' fitted smile', x: fx, y: fy, color: c, width: 2.2 });
    });
    Pl.line($('sp'), { title: 'Volatility Skew', subtitle: D.sym + ' · implied volatility by strike', xTitle: 'Strike', yTitle: 'Implied volatility (%)',
      xFmt: function (v, tip) { return tip ? fmt(v) : (v < 100 ? v.toFixed(1) : Math.round(v)); }, yFmt: function (v) { return v.toFixed(0) + '%'; }, tipFmt: function (s, v) { return v.toFixed(1) + '%'; },
      series: series, marks: [{ x: D.S, label: 'Spot ' + fmt(D.S), color: '#111827', dash: '2 3' }], xMin: lo, xMax: hi, yAuto: true });
    var iv = function (e, m) { return Math.sqrt(e.ex.smile(Math.log(m)) / e.T); };
    $('st').innerHTML = '<thead><tr><th>Expiration</th><th>DTE</th><th>Quotes used</th><th>ATM IV</th><th>IV at 90% of forward</th><th>IV at 110% of forward</th><th>90/110 skew</th></tr></thead><tbody>' +
      sel.map(function (e) { var a = iv(e, 0.9), b = iv(e, 1.1); return '<tr><td>' + e.date + '</td><td>' + e.dte + '</td><td>' + e.ex.pts.length + ' of ' + e.ex.total + '</td><td>' + pct(M.atmIv(e)) + '</td><td>' + pct(a) + '</td><td>' + pct(b) + '</td><td>' + ((a - b) * 100 >= 0 ? '+' : '') + ((a - b) * 100).toFixed(1) + ' pts</td></tr>'; }).join('') + '</tbody>';
  }

  // ---------- Expected move ----------
  function drawEM() {
    var host = $('chart-pane'), list = okList().filter(function (e) { return M.straddle(e); });
    host.innerHTML = '<h2><span class="tk">' + esc(D.sym) + '</span> Expected Move</h2>' +
      '<p class="lead">The expected move most tools show is the at-the-money straddle: one number, the same distance up and down. Implied shows the ranges the market actually prices, which are lopsided when there is skew and wider when the tails are fat.</p>' +
      '<div id="ep"></div><div class="ptable"><h3>Expected Move by Expiration</h3><div class="table-wrap"><table class="data" id="et"></table></div></div>';
    var dte = list.map(function (e) { return e.dte; }), F = list.map(function (e) { return e.ex.F; }), st = list.map(function (e) { return M.straddle(e).price; });
    var q = function (p) { return list.map(function (e) { return quantile(e.ex.d, p); }); };
    var series = [
      { name: 'Implied 95%', x: dte, y: q(0.975), color: '#3b82f6', width: 2.2 }, { x: dte, y: q(0.025), color: '#3b82f6', width: 2.2 },
      { name: 'Implied 68%', x: dte, y: q(0.84), color: '#93c5fd', width: 2 }, { x: dte, y: q(0.16), color: '#93c5fd', width: 2 },
      { name: 'Median', x: dte, y: q(0.5), color: '#64748b', width: 1.6, dash: '2 4' },
      { name: 'Straddle ± move', x: dte, y: F.map(function (f, i) { return f + st[i]; }), color: '#ec4899', width: 1.8, dash: '6 5' }, { x: dte, y: F.map(function (f, i) { return f - st[i]; }), color: '#ec4899', width: 1.8, dash: '6 5' },
    ];
    Pl.line($('ep'), { title: 'Expected Move', subtitle: D.sym + ' · ranges by days to expiration', xTitle: 'Days to expiration', yTitle: 'Price', yAuto: true,
      xFmt: function (v, tip) { return tip ? Math.round(v) + ' days' : Math.round(v); }, yFmt: function (v) { return v < 100 ? v.toFixed(1) : Math.round(v); }, tipFmt: function (s, v) { return fmt(v); },
      series: series, marks: [], xMin: Math.min.apply(null, dte), xMax: Math.max.apply(null, dte) });
    $('et').innerHTML = '<thead><tr><th>Expiration</th><th>DTE</th><th>Straddle</th><th>Expected move</th><th>Implied 68% range</th><th>Implied 95% range</th><th class="l">Shape</th></tr></thead><tbody>' +
      list.map(function (e, i) {
        var s = st[i], d = e.ex.d, sh = e.ex.shape;
        return '<tr><td>' + e.date + '</td><td>' + e.dte + '</td><td>' + fmt(s) + '</td><td>±' + fmt(s) + ' (' + pct(s / e.ex.F) + ')</td><td>' + fmt(quantile(d, 0.16)) + ' – ' + fmt(quantile(d, 0.84)) + '</td><td>' + fmt(sh.q[0]) + ' – ' + fmt(sh.q[6]) + '</td><td class="l">' + (sh.fork ? '<span class="tag-fork">' + esc(forkLabel(sh.fork)) + '</span>' : esc(skewTag(sh.skew) || 'Close to symmetric')) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  // ---------- The Fork ----------
  function drawFork() {
    var host = $('chart-pane'), list = okList();
    if (!sel.length || sel.length > 1) sel = [list.filter(function (e) { return e.ex.shape.fork; })[0] || list.filter(function (e) { return e.dte >= 7; })[0] || list[0]];
    var e = sel[0], dg = e.ex.diag, f = e.ex.shape.fork;
    host.innerHTML = '<h2><span class="tk">' + esc(D.sym) + '</span> Fork Detection</h2>' +
      '<p class="lead">The Fork is when the options market prices two separate outcomes, usually around earnings, and the middle becomes the least likely place to land. Implied checks every expiration with three rules and a data gate.</p>' +
      '<div class="controls"><span class="ctl-select">Expiration Date</span>' + expButtons('fe', list, false) + '</div>' +
      '<div class="verdict">' + (f ? '<span class="chip fork big">Fork detected</span><b>' + esc(forkLabel(f)) + '</b>' : '<span class="chip big">One outcome</span><b>' + (dg.peaks < 2 ? 'The market prices a single peak at this expiration.' : 'Two bumps, but no Fork: ' + esc(dg.reason) + '.') + '</b>') + '</div>' +
      '<div class="dark-card"><div class="chart-host" id="fc"></div></div>' +
      '<div class="ptable"><h3>The rules</h3><div class="table-wrap"><table class="data" id="ft"></table></div><p style="margin-top:12px"><a class="link" href="/fork/">Build your own two-outcome market in the Fork lab →</a></p></div>';
    bindExp('fe', false, drawFork);
    ImpliedCharts.density($('fc'), { d: e.ex.d, q: e.ex.shape.q, fork: f, F: e.ex.F, spot: D.S });
    var rows = [['Smaller peak at least 25% of the taller', '≥ 25%', dg.height, dg.height != null && dg.height >= FORK_HEIGHT],
      ['Peaks at least 3% of the forward apart', '≥ 3%', dg.separation, dg.separation != null && dg.separation >= FORK_SEPARATION],
      ['Valley below 70% of the smaller peak', '< 70%', dg.valley, dg.valley != null && dg.valley < FORK_VALLEY]];
    $('ft').innerHTML = '<thead><tr><th class="l">Rule</th><th>Needs</th><th>This expiration</th><th>Result</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td class="l">' + r[0] + '</td><td>' + r[1] + '</td><td>' + (r[2] == null ? 'one peak' : pct(r[2])) + '</td><td>' + (r[2] == null ? '—' : r[3] ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>') + '</td></tr>'; }).join('') +
      '<tr><td class="l">Data gate: peaks inside the quoted strikes, enough quotes between them, quotes cover most of the probability</td><td>all</td><td>' + esc(dg.reason) + '</td><td>' + (f ? '<span class="pass">Pass</span>' : dg.peaks < 2 ? '—' : /fork/.test(dg.reason) ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>') + '</td></tr></tbody>';
  }

  // ---------- Overview ----------
  var ovRange = 252;
  function drawOverview() {
    var n = Math.min(ovRange, D.close.length - 1), cl = D.close.slice(-n - 1), tm = D.time.slice(-n - 1), xs = cl.map(function (_, i) { return i; });
    var chg = cl[cl.length - 1] / cl[0] - 1, perf = $('ov-perf');
    perf.textContent = (chg >= 0 ? '+' : '') + pct(chg, 2); perf.className = 'perf ' + (chg >= 0 ? 'up' : 'down');
    Pl.line($('ov-chart'), { series: [{ x: xs, y: cl, color: chg >= 0 ? '#16a34a' : '#ef4444', width: 2, fill: 0.08 }], yAuto: true, height: 300,
      xFmt: function (v) { var t = tm[Math.max(0, Math.min(tm.length - 1, Math.round(v)))]; return M.short(t > 1e12 ? t / 1000 : t); }, yFmt: function (v) { return v < 100 ? v.toFixed(1) : Math.round(v); }, tipFmt: function (s, v) { return fmt(v); },
      xMin: 0, xMax: xs.length - 1, marks: [] });
    var all = D.close.slice(-252), last = D.close[D.close.length - 1], prev = D.close[D.close.length - 2];
    $('ov-title').innerHTML = '<span class="tk">' + esc(D.sym) + '</span> Overview';
    var stat = function (k, v) { return '<div><span>' + k + '</span><b>' + v + '</b></div>'; };
    $('ov-stats').innerHTML = stat('Last close', fmt(last)) + stat('Day change', (last >= prev ? '+' : '') + pct(last / prev - 1, 2)) + stat('52 week high', fmt(Math.max.apply(null, all))) + stat('52 week low', fmt(Math.min.apply(null, all))) +
      stat('Expirations listed', D.expiries.length) + stat('Expirations modelled', D.expiries.filter(function (e) { return e.ok; }).length) + stat('Strikes per side', 40) + stat('Quoted spot', fmt(D.S));
    var ok = okList(), n30 = ok.slice().sort(function (a, b) { return Math.abs(a.dte - 30) - Math.abs(b.dte - 30); })[0], far = ok.filter(function (e) { return e.dte <= 91; }).pop() || ok[ok.length - 1];
    var wk = ok.filter(function (e) { return e.dte >= 5 && M.straddle(e); })[0], fk = ok.filter(function (e) { return e.ex.shape.fork; })[0], sh = far.ex.shape, tag = skewTag(sh.skew);
    $('ov-text').innerHTML = 'As of ' + M.short(D.time[D.time.length - 1] > 1e12 ? D.time[D.time.length - 1] / 1000 : D.time[D.time.length - 1]) + ', <b class="tk">' + esc(D.sym) + '</b> options price a <b>95% range of ' + fmt(sh.q[0]) + ' – ' + fmt(sh.q[6]) + '</b> by ' + far.date + ', around a median of <b>' + fmt(sh.q[3]) + '</b>. ' +
      (tag ? tag.replace(/^(\w+) tail ([\d.]+)× (\w+)$/, function (m, a, k, b) { return 'The ' + a.toLowerCase() + ' tail is ' + k + '× the ' + b + '. '; }) : 'The two tails are close to symmetric. ') +
      (fk ? 'At ' + fk.date + ' the market prices <b>two outcomes</b>: ' + fmt(fk.ex.shape.fork.low) + ' or ' + fmt(fk.ex.shape.fork.high) + ', with ' + fmt(fk.ex.shape.fork.valley) + ' in between the least likely.' : 'No expiration shows a Fork.');
    $('ov-implied').innerHTML = stat('ATM implied volatility (' + n30.dte + 'd)', pct(M.atmIv(n30))) + stat('Straddle expected move (' + (wk ? wk.dte : '—') + 'd)', wk ? '±' + fmt(M.straddle(wk).price) : '—') +
      stat('Skew ratio (to ' + far.dte + 'd)', sh.skew.toFixed(2)) + stat('Fork', fk ? fk.date : 'None');
  }

  // ---------- Option chain ----------
  function drawChain() {
    var select = $('ch-exp');
    if (!select.options.length) {
      select.innerHTML = D.expiries.map(function (e) { return '<option value="' + e.key + '">' + e.date + ' (' + e.dte + 'd)</option>'; }).join('');
      var de = dflt();
      if (de) select.value = de.key;
      select.addEventListener('change', drawChain);
    }
    var e = D.expiries.filter(function (x) { return x.key === select.value; })[0];
    var used = {}; if (e.ex) e.ex.pts.forEach(function (p) { used[p.K.toFixed(2)] = p.iv; });
    var F = e.ex && isFinite(e.ex.F) ? e.ex.F : D.S, keys = Object.keys(e.byStrike).sort(function (a, b) { return a - b; });
    var atm = keys.reduce(function (b, k) { return Math.abs(k - F) < Math.abs(b - F) ? k : b; }, keys[0]);
    var q = function (o, k) { return o && o[k] != null ? Number(o[k]).toFixed(2) : '—'; };
    $('ch-info').textContent = (e.ex ? 'Forward ' + fmt(F) + ' · ' + e.ex.pts.length + ' of ' + keys.length + ' strikes used' : '') + (e.ok ? '' : ' · not modelled: ' + (e.ex ? e.ex.reason : 'no data'));
    $('ch-table').innerHTML = '<thead><tr><th>Call bid</th><th>Call ask</th><th>Call IV</th><th style="text-align:center">Strike</th><th>Put bid</th><th>Put ask</th><th>Put IV</th></tr></thead><tbody>' +
      keys.map(function (k) {
        var r = e.byStrike[k] || {}, K = Number(k), iv = used[K.toFixed(2)], callSide = K >= F;
        var cls = (k === atm ? 'atm ' : '') + (iv != null ? 'used' : '');
        return '<tr class="' + cls + '"><td>' + q(r.C, 'b') + '</td><td>' + q(r.C, 'a') + '</td><td>' + (iv != null && callSide ? pct(iv) : '') + '</td><td style="text-align:center"><b>' + K.toFixed(K < 100 ? 2 : 1) + '</b></td><td>' + q(r.P, 'b') + '</td><td>' + q(r.P, 'a') + '</td><td>' + (iv != null && !callSide ? pct(iv) : '') + '</td></tr>';
      }).join('') + '</tbody>';
  }

  // ---------- Tabs and chart chips ----------
  var CHARTS = { prob: drawProb, cloud: drawCloud, skew: drawSkew, em: drawEM, fork: drawFork };
  function showTab(t) {
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === t); });
    document.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== t; });
    if (t === 'overview') drawOverview(); else if (t === 'chain') drawChain(); else if (t === 'charts') CHARTS[chart]();
    setUrl();
  }
  function showChart(c) {
    chart = CHARTS[c] ? c : 'prob';
    document.querySelectorAll('[data-chart]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-chart') === chart); });
    CHARTS[chart](); setUrl();
  }
  document.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
  document.querySelectorAll('[data-chart]').forEach(function (b) { b.addEventListener('click', function () { if (chart === 'fork' || b.getAttribute('data-chart') === 'fork') sel = []; showChart(b.getAttribute('data-chart')); }); });
  document.querySelectorAll('#ov-ranges [data-r]').forEach(function (b) { b.addEventListener('click', function () { ovRange = +b.getAttribute('data-r'); document.querySelectorAll('#ov-ranges [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); drawOverview(); }); });

  // ---------- Load ----------
  M.load(symParam).then(function (d) {
    D = d;
    document.title = d.sym + ' Option Charts · Implied';
    $('s-logo').textContent = d.sym.slice(0, 4);
    $('s-name').textContent = d.name;
    $('s-sym').textContent = d.sym + ' · ' + d.kind;
    document.querySelectorAll('[data-sym]').forEach(function (n) { n.textContent = d.sym; });
    var last = d.close[d.close.length - 1], prev = d.close[d.close.length - 2], ch = last - prev;
    $('s-px').innerHTML = last.toFixed(2) + '<small>USD</small>';
    $('s-chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + ' (' + (ch >= 0 ? '+' : '') + pct(ch / prev, 2) + ')'; $('s-chg').className = 'chg ' + (ch >= 0 ? 'up' : 'down');
    var lt = d.time[d.time.length - 1]; $('s-asof').textContent = 'Last candle: ' + M.ymd(lt > 1e12 ? lt / 1000 : lt) + ' · options modelled in your browser';
    if (d.custom) $('s-src').textContent = 'Your saved chain · from TrendSpider';
    if (!okList().length) { $('chart-pane').innerHTML = '<div class="notice warn"><i></i><span>No expiration in this chain could be modelled (too few liquid strikes).</span></div>'; return; }
    chart = CHARTS[chart] ? chart : 'prob';
    document.querySelectorAll('[data-chart]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-chart') === chart); });
    showTab(['overview', 'charts', 'chain', 'ts'].indexOf(tab) >= 0 ? tab : 'charts');
  }).catch(function (e) {
    $('s-name').textContent = 'Could not load this ticker';
    $('chart-pane').innerHTML = '<div class="notice err"><i></i><span>' + esc(e.message || e) + ' <a class="link" href="/analyze/">Analyze a chain</a></span></div>';
  });
})();
