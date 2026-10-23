(function () {
  'use strict';
  var S = 190, r = 0.04, ids = ['move', 'vol', 'dte', 'w', 'spr'];
  var fmt = { move: function (v) { return '±' + v + '%'; }, vol: function (v) { return v + '%'; }, dte: function (v) { return v + ' days'; }, w: function (v) { return v + '% / ' + (100 - v) + '%'; }, spr: function (v) { return v + '%'; } };

  // Same rules as fork() in core.js, but reporting how close each one came.
  function diagnose(d, F) {
    var g = [0.06, 0.24, 0.40, 0.24, 0.06], n = d.pdf.length;
    var s = d.pdf.map(function (_, i) { return g.reduce(function (a, w, j) { return a + w * d.pdf[Math.min(n - 1, Math.max(0, i + j - 2))]; }, 0); });
    var top = Math.max.apply(null, s), peaks = [];
    for (var i = 1; i < n - 1; i++) if (s[i] > s[i - 1] && s[i] >= s[i + 1]) peaks.push(i);
    peaks.sort(function (a, b) { return s[b] - s[a]; });
    var kept = [];
    peaks.forEach(function (i) { if (kept.every(function (j) { return Math.abs(d.Ks[i] - d.Ks[j]) > 0.005 * F; })) kept.push(i); });
    if (kept.length < 2) return { peaks: 1 };
    var a = Math.min(kept[0], kept[1]), b = Math.max(kept[0], kept[1]), v = a;
    for (var k = a; k <= b; k++) if (s[k] < s[v]) v = k;
    return { peaks: 2, ratio: s[v] / Math.min(s[a], s[b]), sep: Math.abs(d.Ks[b] - d.Ks[a]) / F, height: Math.min(s[a], s[b]) / top };
  }
  function meter(id, frac) { document.querySelector('#' + id + ' i').style.left = Math.max(0, Math.min(100, frac * 100)) + '%'; }

  var t;
  function run() {
    var v = {}; ids.forEach(function (id) { v[id] = +document.getElementById(id).value; document.querySelector('output[data-for="' + id + '"]').textContent = fmt[id](v[id]); });
    var T = v.dte / 365, F0 = S * Math.exp(r * T), j = v.move / 100, wd = v.w / 100;
    var model = j > 0 ? { kind: 'mix', parts: [{ w: wd, F: F0 * Math.exp(-j), sig: v.vol / 100 }, { w: 1 - wd, F: F0 * Math.exp(j), sig: v.vol / 100 }] } : { kind: 'smile', atm: v.vol / 100 };
    var q = Implied.expiryQuotes({ S: S, r: r, T: T, model: model, spreadPct: v.spr / 100, seed: 5, range: 0.45 });
    var t0 = performance.now(), ex = Implied.explain(q.byStrike, S, T, r, 0.5), ms = performance.now() - t0;
    var verdict = document.getElementById('verdict');
    if (!ex.d) { verdict.innerHTML = '<div class="notice warn" style="flex:1"><i></i><span>Too few liquid strikes to model this expiry.</span></div>'; return; }
    var fork = ex.shape.fork, dg = diagnose(ex.d, ex.F);
    ImpliedCharts.density(document.getElementById('chart'), { d: ex.d, q: ex.shape.q, fork: fork, F: ex.F, spot: S,
      truth: document.getElementById('truth').checked ? Implied.trueDensity(model, ex.F, T, r, ex.d.Ks[0], ex.d.Ks[ex.d.Ks.length - 1]) : null });
    document.getElementById('status').textContent = ex.pts.length + ' strikes · modelled in ' + ms.toFixed(0) + ' ms';
    verdict.innerHTML = fork
      ? '<span class="chip fork" style="font-size:14px;padding:8px 12px;background:#fff7ec;border-color:#ffd9a3;color:#9a5a00">Fork detected</span><b style="font-size:18px">' + ImpliedResults_esc(forkLabel(fork)) + '</b>'
      : '<span class="chip light" style="font-size:14px;padding:8px 12px">One outcome</span><b style="font-size:18px">' + (dg.peaks < 2 ? 'The market prices a single peak.' : 'Two bumps, but not a clear split.') + '</b>';
    if (dg.peaks < 2) {
      document.getElementById('r1').textContent = 'one peak'; document.getElementById('r2').textContent = '—'; document.getElementById('r3').textContent = '—';
      meter('m1', 1); meter('m2', 0); meter('m3', 0);
    } else {
      document.getElementById('r1').textContent = (dg.ratio * 100).toFixed(0) + '%';
      document.getElementById('r2').textContent = (dg.sep * 100).toFixed(1) + '%';
      document.getElementById('r3').textContent = (dg.height * 100).toFixed(0) + '%';
      meter('m1', dg.ratio); meter('m2', Math.min(1, dg.sep / 0.15)); meter('m3', dg.height);
    }
  }
  function ImpliedResults_esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  ids.concat(['truth']).forEach(function (id) { document.getElementById(id).addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 60); }); });
  run();
})();
