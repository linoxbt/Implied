// Implied — shared presenter: draws a script run (cloud chart, legend chips,
// per-expiry table). Used by Home, Lab and Analyze.
(function (global) {
  'use strict';
  var fmt = function (v) { return ImpliedCharts.fmtPrice(v); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // Per-expiry numbers, computed with the same core functions and settings the script uses.
  function expiryRows(schedule, chain, settings) {
    var S = Number(chain && chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
    var rows = (schedule || []).filter(function (e) { return e && e.expiration && e.expiration.dte >= 1; })
      .sort(function (a, b) { return a.expiration.dte - b.expiration.dte; }).slice(0, settings.expirations);
    return rows.map(function (e) {
      var byStrike = chain.resultByExpiration && chain.resultByExpiration[e.expiration.code], T = e.expiration.dte / 365;
      var clean = byStrike ? cleanExpiry(byStrike, S, T, settings.rate / 100, settings.spread) : { pts: [], F: NaN };
      var shape = null;
      try { shape = byStrike ? modelExpiry(byStrike, S, T, settings.rate / 100, settings.spread, settings.minStrikes) : null; } catch (err) { shape = null; }
      return { dte: e.expiration.dte, code: e.expiration.code, F: clean.F, used: clean.pts.length, total: byStrike ? Object.keys(byStrike).length : 0, shape: shape };
    });
  }

  function present(refs, run) {
    var out = run.out;
    if (refs.status) refs.status.textContent = out.error ? 'Script stopped with a message' : 'implied.js ran in ' + out.ms.toFixed(0) + ' ms · ' + out.projections.length + ' series · ' + out.fills.length + ' fills';
    if (out.error) {
      refs.chart.innerHTML = '<div class="on-chart-msg"><span>' + esc(out.error) + '<small>This is the message the indicator shows on the chart.</small></span></div>';
      if (refs.chips) refs.chips.innerHTML = '<span class="chip">' + (out.crash ? 'Script error' : 'On-chart message') + '</span>';
    } else {
      ImpliedCharts.cloud(refs.chart, { close: run.close, time: run.time, out: out, history: run.history || 90 });
      if (refs.chips) refs.chips.innerHTML = out.projections.filter(function (p) { return !p.hidden; }).map(function (p) {
        var cls = p.name.indexOf('Fork') === 0 ? ' fork' : '';
        return '<span class="chip' + cls + '">' + esc(p.name) + '</span>';
      }).join('');
    }
    if (refs.table) {
      var rows = expiryRows(run.schedule, run.chain, run.settings);
      refs.table.innerHTML = '<table class="data"><thead><tr><th>Expiry</th><th>Forward</th><th>Strikes used</th><th>2.5%</th><th>Median</th><th>97.5%</th><th>Skew</th><th class="l">Shape</th></tr></thead><tbody>' +
        rows.map(function (r) {
          if (!r.shape) return '<tr><td>' + r.dte + ' days</td><td>' + (isFinite(r.F) ? fmt(r.F) : '—') + '</td><td>' + r.used + ' of ' + r.total + '</td><td colspan="4" style="text-align:center;color:var(--ink-3)">skipped: too few liquid strikes</td><td class="l">—</td></tr>';
          var s = r.shape, tag = skewTag(s.skew);
          return '<tr><td>' + r.dte + ' days</td><td>' + fmt(r.F) + '</td><td>' + r.used + ' of ' + r.total + '</td><td>' + fmt(s.q[0]) + '</td><td>' + fmt(s.q[3]) + '</td><td>' + fmt(s.q[6]) + '</td><td>' + s.skew.toFixed(2) + '</td><td class="l">' +
            (s.fork ? '<span class="tag-fork">' + esc(forkLabel(s.fork)) + '</span>' : esc(tag || 'Close to symmetric')) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
  }

  global.ImpliedResults = { present: present, expiryRows: expiryRows, esc: esc };
})(window);
