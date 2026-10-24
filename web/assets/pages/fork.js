(function () {
  'use strict';
  var S = 190, r = 0.04, ids = ['move', 'vol', 'dte', 'w', 'spr'];
  var fmt = { move: function (v) { return +v ? '±' + v + '%' : 'none'; }, vol: function (v) { return v + '%'; }, dte: function (v) { return v + ' days'; }, w: function (v) { return v + '% / ' + (100 - v) + '%'; }, spr: function (v) { return v + '%'; } };

  function meter(id, frac) { document.querySelector('#' + id + ' i').style.left = Math.max(0, Math.min(100, frac * 100)) + '%'; }

  var t;
  function run() {
    var v = {}; ids.forEach(function (id) { v[id] = +document.getElementById(id).value; document.querySelector('output[data-for="' + id + '"]').textContent = fmt[id](v[id]); });
    var T = v.dte / 365, F0 = S * Math.exp(r * T), j = v.move / 100, wd = v.w / 100;
    var model = j > 0 ? { kind: 'mix', parts: [{ w: wd, F: F0 * Math.exp(-j), sig: v.vol / 100 }, { w: 1 - wd, F: F0 * Math.exp(j), sig: v.vol / 100 }] } : { kind: 'smile', atm: v.vol / 100 };
    var q = Implied.expiryQuotes({ S: S, r: r, T: T, model: model, spreadPct: v.spr / 100, seed: 5, range: 0.45 });
    var t0 = performance.now(), ex = Implied.explain(q.byStrike, S, T, r, 0.5), ms = performance.now() - t0;
    var verdict = document.getElementById('verdict');
    if (!ex.d) { ImpliedCharts.clear(document.getElementById('chart')); ['r1', 'r2', 'r3'].forEach(function (id) { document.getElementById(id).textContent = '—'; }); verdict.innerHTML = '<div class="notice warn" style="flex:1"><i></i><span>Skipped: ' + esc(ex.reason || 'too few liquid strikes') + '.</span></div>'; return; }
    var fork = ex.shape.fork, dg = ex.diag; // the indicator's own Fork rules, with how close each came
    ImpliedCharts.density(document.getElementById('chart'), { d: ex.d, q: ex.shape.q, fork: fork, F: ex.F, spot: S,
      truth: document.getElementById('truth').checked ? Implied.trueDensity(model, ex.F, T, r, ex.d.Ks[0], ex.d.Ks[ex.d.Ks.length - 1]) : null });
    document.getElementById('status').textContent = ex.pts.length + ' strikes · modelled in ' + ms.toFixed(0) + ' ms';
    verdict.innerHTML = fork
      ? '<span class="chip fork" style="font-size:14px;padding:8px 12px;">Fork detected</span><b style="font-size:18px">' + esc(forkLabel(fork)) + '</b>'
      : '<span class="chip light" style="font-size:14px;padding:8px 12px">One outcome</span><b style="font-size:18px">' + (dg.peaks < 2 || dg.height < FORK_HEIGHT ? 'The market prices a single peak.' : 'Two peaks, but no Fork: ' + esc(dg.reason) + '.') + '</b>';
    if (dg.peaks < 2 || dg.height < FORK_HEIGHT) { // a bump under 25% of the main peak is wing noise, not a peak
      document.getElementById('r1').textContent = 'one peak'; document.getElementById('r2').textContent = '—'; document.getElementById('r3').textContent = '—';
      meter('m1', 1); meter('m2', 0); meter('m3', 0);
    } else {
      document.getElementById('r1').textContent = (dg.valley * 100).toFixed(0) + '%';
      document.getElementById('r2').textContent = (dg.separation * 100).toFixed(1) + '%';
      document.getElementById('r3').textContent = (dg.height * 100).toFixed(0) + '%';
      meter('m1', dg.valley); meter('m2', Math.min(1, dg.separation / 0.15)); meter('m3', dg.height);
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  ids.concat(['truth']).forEach(function (id) { document.getElementById(id).addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 60); }); });
  run();
})();
