(function () {
  'use strict';
  var r = 0.04, preset = 'earnings', data = null, sel = document.getElementById('expiry');
  var chip = function (t, cls) { return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + t + '</span>'; };
  var $ = function (id) { return document.getElementById(id); };

  function build() {
    var p = Object.assign({ seed: 7 }, Implied.PRESETS[preset]);
    data = Implied.synth(p);
    data.S = p.S;
    data.candles = Implied.candles(p.S, 260, 9);
    sel.innerHTML = data.schedule.map(function (e, i) { return '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + e.expiration.dte + ' days</option>'; }).join('');
    step(); paint();
  }
  function step() {
    var e = data.schedule[+sel.value], T = e.expiration.dte / 365, byStrike = data.chain.resultByExpiration[expiryKey(e.expiration.code)];
    var ex = Implied.explain(byStrike, data.S, T, r, 0.5);
    ImpliedCharts.quotes($('c1'), { byStrike: byStrike, F: ex.F, pts: ex.pts });
    $('k1').innerHTML = chip(ex.total + ' strikes listed') + chip(ex.pts.length + ' used', 'ok') + chip('spot ' + ImpliedCharts.fmtPrice(data.S)) + chip(isFinite(ex.F) ? 'forward ' + ImpliedCharts.fmtPrice(ex.F) : 'no usable forward');
    if (!ex.d) { ImpliedCharts.clear($('c2')); ImpliedCharts.clear($('c3')); $('c2').innerHTML = $('c3').innerHTML = '<div class="on-chart-msg"><span>Skipped: ' + ImpliedResults.esc(ex.reason || 'too few liquid strikes') + '.</span></div>'; return; }
    ImpliedCharts.smile($('c2'), { pts: ex.pts, smile: ex.smile, T: T, F: ex.F });
    ImpliedCharts.density($('c3'), { d: ex.d, q: ex.shape.q, fork: ex.shape.fork, F: ex.F, spot: data.S });
    var tag = skewTag(ex.shape.skew);
    $('k3').innerHTML = chip('median ' + ImpliedCharts.fmtPrice(ex.shape.q[3])) + chip('95% range ' + ImpliedCharts.fmtPrice(ex.shape.q[0]) + '–' + ImpliedCharts.fmtPrice(ex.shape.q[6])) +
      (tag ? chip(tag) : chip('close to symmetric')) + (ex.shape.fork ? chip(forkLabel(ex.shape.fork), 'fork') : '');
  }
  var seq = 0;
  async function paint() {
    var my = ++seq, c = data.candles;
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: data.schedule, chain: data.chain, close: c.close, time: c.time });
    if (my !== seq) return;
    ImpliedResults.present({ chart: $('c4'), chips: $('k4'), status: $('status') }, { out: out, close: c.close, time: c.time, schedule: data.schedule, chain: data.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 } });
  }
  sel.addEventListener('change', step);
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      preset = b.getAttribute('data-preset');
      document.querySelectorAll('[data-preset]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      build();
    });
  });
  build();
})();
