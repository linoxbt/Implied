(function () {
  'use strict';
  var r = 0.04, bar = document.getElementById('bar'), go = document.getElementById('go');
  var tick = function () { return new Promise(function (res) { setTimeout(res, 0); }); };
  function set(k, result, ok) {
    var tr = document.querySelector('tr[data-k="' + k + '"]');
    tr.children[2].textContent = result;
    tr.children[3].innerHTML = ok ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';
  }
  function mix(S, dte, j, sig, w) {
    var F = S * Math.exp(r * dte / 365);
    return { kind: 'mix', parts: [{ w: w, F: F * Math.exp(-j), sig: sig }, { w: 1 - w, F: F * Math.exp(j), sig: sig }] };
  }
  function shapeOf(model, S, dte, spread, seed, noise) {
    var T = dte / 365, q = Implied.expiryQuotes({ S: S, r: r, T: T, model: model, spreadPct: spread, noise: noise, seed: seed, range: 0.35 });
    return modelExpiry(q.byStrike, S, T, r, 0.5, 8);
  }

  async function run() {
    go.disabled = true; go.textContent = 'Running…';
    document.querySelectorAll('#results tbody tr').forEach(function (tr) { tr.children[2].textContent = '…'; tr.children[3].textContent = '…'; });
    var jobs = [], done = 0;

    // Fork detection
    var hits = 0, total = 0;
    for (var seed = 1; seed <= 8; seed++) [0.01, 0.03, 0.05].forEach(function (sp) {
      [[7, 0.07, 0.5], [10, 0.08, 0.6], [14, 0.09, 0.5], [21, 0.10, 0.4]].forEach(function (c) {
        var s = seed; jobs.push(function () { total++; var sh = shapeOf(mix(190, c[0], c[1], 0.2, c[2]), 190, c[0], sp, s, 1); if (sh && sh.fork) hits++; });
      });
    });
    // False Forks
    var falses = 0, modelled = 0;
    var models = [[{ kind: 'smile', atm: 0.15, skew: -0.55, curv: 1.2 }, 580], [{ kind: 'smile', atm: 1.1, skew: 0.45, curv: 0.6 }, 24], [{ kind: 'smile', atm: 0.3, skew: -0.2, curv: 0.8 }, 190], [{ kind: 'smile', atm: 0.6, skew: -0.3, curv: 4 }, 45]];
    for (var s2 = 1; s2 <= 6; s2++) [0.01, 0.05].forEach(function (sp) {
      models.forEach(function (m) { [3, 7, 30, 90].forEach(function (dte) {
        var s = s2; jobs.push(function () { var sh = shapeOf(m[0], m[1], dte, sp, s, 1); if (!sh) return; modelled++; if (sh.fork) falses++; });
      }); });
    });
    var all = jobs.length + 4;
    for (var i = 0; i < jobs.length; i++) {
      jobs[i](); done++;
      if (i % 6 === 0) { bar.style.width = (done / all * 100) + '%'; await tick(); }
    }
    set('fork', hits + ' of ' + total + ' (' + (hits / total * 100).toFixed(0) + '%)', hits / total >= 0.95);
    set('false', falses + ' of ' + modelled, falses === 0);

    // Flat smile accuracy
    var T = 30 / 365, q = Implied.expiryQuotes({ S: 100, r: r, T: T, model: { kind: 'smile', atm: 0.25 }, spreadPct: 0.01, noise: 0, seed: 1, range: 0.35 });
    var ex = Implied.explain(q.byStrike, 100, T, r, 0.5);
    var expected = ex.F * Math.exp(-0.25 * 0.25 * T / 2), med = ex.shape.q[3], err = Math.abs(med / expected - 1);
    set('median', (err * 100).toFixed(3) + '% off', err < 0.002);
    // The raw Breeden-Litzenberger integral, before the density is normalized
    var area = ex.d.mass;
    set('area', area.toFixed(4), Math.abs(area - 1) < 0.001);
    done++; bar.style.width = (done / all * 100) + '%'; await tick();

    var put = shapeOf({ kind: 'smile', atm: 0.2, skew: -0.5, curv: 1 }, 100, 30, 0.02, 1, 0.5);
    var call = shapeOf({ kind: 'smile', atm: 0.8, skew: 0.5, curv: 0.5 }, 25, 30, 0.05, 1, 0.5);
    set('skew', 'put ' + put.skew.toFixed(2) + ' · call ' + call.skew.toFixed(2), put.skew < 1 && call.skew > 1);
    done++; bar.style.width = (done / all * 100) + '%'; await tick();

    // On-chart messages, through the real script
    var spy = Implied.synth(Object.assign({ seed: 3 }, Implied.PRESETS.index)), c = Implied.candles(580, 260, 3);
    var ill = Implied.synth({ S: 12, vol: 60, skew: 0, curv: 0, move: 0, eDay: 9, spreadPct: 90, count: 2, seed: 4 }), c2 = Implied.candles(12, 260, 4);
    var cases = [
      [{ ticker: 'BTCUSD', schedule: [], chain: {}, close: c.close, time: c.time }, /^No options data for BTCUSD/],
      [{ ticker: 'SPY', schedule: spy.schedule, chain: { error: 'OPRA subscription required' }, close: c.close, time: c.time }, /\(OPRA subscription required\)$/],
      [{ ticker: 'SPY', resolution: 'W', schedule: spy.schedule, chain: spy.chain, close: c.close, time: c.time }, /^Implied runs on the Daily timeframe only\.$/],
      [{ ticker: 'ILLIQ', schedule: ill.schedule, chain: ill.chain, close: c2.close, time: c2.time }, /^Not enough liquid strikes on ILLIQ/],
    ];
    var okMsgs = 0;
    for (var j = 0; j < cases.length; j++) { var o = await Implied.runScript(cases[j][0]); if (o.error && cases[j][1].test(o.error) && !o.crash) okMsgs++; }
    set('msgs', okMsgs + ' of 4', okMsgs === 4);
    done++; bar.style.width = (done / all * 100) + '%';

    var big = Implied.synth(Object.assign({ seed: 9 }, Implied.PRESETS.index, { count: 8 }));
    var o8 = await Implied.runScript({ ticker: 'BIG', schedule: big.schedule, chain: big.chain, close: c.close, time: c.time, inputs: { 'Expirations to project': 8 } });
    set('speed', o8.error ? o8.error : o8.ms.toFixed(0) + ' ms', !o8.error && o8.ms < 1000);
    bar.style.width = '100%';
    go.disabled = false; go.textContent = 'Run again';
  }
  go.addEventListener('click', run);
})();
