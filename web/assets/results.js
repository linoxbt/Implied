// Implied — shared presenter: draws a script run (cloud chart, legend chips,
// per-expiry table). Used by Home, Lab and Analyze.
(function (global) {
  'use strict';
  var fmt = function (v) { return ImpliedCharts.fmtPrice(v); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // Per-expiry numbers: the expiries the script picked, from the same core
  // selection step and settings, on the chart's footing (scaled to the last close).
  function expiryRows(run) {
    var settings = run.settings, close = run.close[run.close.length - 1];
    var chain = Implied.limitStrikes(run.chain, 40, close); // the script only receives 40 strikes per side
    var quoted = Number(chain && chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
    var spot = quoted > 0 ? quoted : close, t = Number(run.time[run.time.length - 1]);
    var sel = selectExpiries({
      schedule: run.schedule, resultByExpiration: chain && chain.resultByExpiration, spot: spot, lastTime: t > 1e12 ? t / 1000 : t,
      rate: settings.rate / 100, maxSpread: settings.spread, minStrikes: settings.minStrikes, count: settings.expirations,
      maxBars: Implied.MAX_PROJECTION, mode: 'calendar',
    });
    var k = close / spot;
    return sel.shapes.map(function (s) {
      return {
        day: s.day, F: s.F * k, used: s.strikes.length, total: Object.keys(chain.resultByExpiration[s.key] || {}).length,
        q: s.q.map(function (v) { return v * k; }), skew: s.skew,
        fork: settings.showFork !== false && s.fork ? { low: s.fork.low * k, high: s.fork.high * k, valley: s.fork.valley * k } : null,
      };
    });
  }

  // The text rows of the script's summary overlay, minus its title and footnote.
  function overlayLines(out) {
    var o = out.overlays && out.overlays[0];
    if (!o) return [];
    return o.definition.rows.map(function (r) { return r.cells[0] && r.cells[0].text; })
      .filter(function (t) { return t && !/^IMPLIED ·|^Risk-neutral/.test(t); });
  }

  function present(refs, run) {
    var out = run.out;
    if (refs.status) refs.status.textContent = out.error ? 'Script stopped with a message' : 'implied.js ran in ' + out.ms.toFixed(0) + ' ms · ' + out.projections.length + ' series · ' + out.fills.length + ' fills';
    if (out.error) {
      ImpliedCharts.clear(refs.chart);
      refs.chart.innerHTML = '<div class="on-chart-msg"><span>' + esc(out.error) + '<small>This is the message the indicator shows on the chart.</small></span></div>';
      if (refs.chips) refs.chips.innerHTML = '<span class="chip">' + (out.crash ? 'Script error' : 'On-chart message') + '</span>';
    } else {
      ImpliedCharts.cloud(refs.chart, { close: run.close, time: run.time, out: out, history: run.history || 90 });
      var lines = overlayLines(out);
      if (refs.chips) refs.chips.innerHTML = lines.map(function (l) {
        return '<span class="chip' + (l.indexOf('Fork') === 0 ? ' fork' : '') + '">' + esc(l) + '</span>';
      }).join('');
      if (out.overlays[0]) ImpliedCharts.overlay(refs.chart, out.overlays[0].definition);
    }
    if (refs.table) {
      var rows = out.error ? [] : expiryRows(run);
      refs.table.innerHTML = !rows.length ? '' : '<table class="data"><thead><tr><th>expiry</th><th>forward</th><th>strikes used</th><th>2.5%</th><th>median</th><th>97.5%</th><th>skew</th><th class="l">shape</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var tag = skewTag(r.skew);
          return '<tr><td>' + r.day + ' days</td><td>' + fmt(r.F) + '</td><td>' + r.used + ' of ' + r.total + '</td><td>' + fmt(r.q[0]) + '</td><td>' + fmt(r.q[3]) + '</td><td>' + fmt(r.q[6]) + '</td><td>' + r.skew.toFixed(2) + '</td><td class="l">' +
            (r.fork ? '<span class="tag-fork">' + esc(forkLabel(r.fork)) + '</span>' : esc(tag || 'close to symmetric')) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
  }

  global.ImpliedResults = { present: present, expiryRows: expiryRows, esc: esc };
})(window);
