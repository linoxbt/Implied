// Implied — ticker data for the site: a simulated chain, each expiry
// modelled with the same core functions the indicator uses, and the real
// script's output for the projection.
(function (global) {
  'use strict';
  var R = 0.04, SPREAD = 0.5, MIN_STRIKES = 8;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ymd(ts) { var d = new Date(ts * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function short(ts) { var d = new Date(ts * 1000); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
  var normCdf = global.normCdf;

  function find(sym) {
    sym = String(sym || '').toUpperCase();
    return Implied.TICKERS.filter(function (t) { return t.sym === sym; })[0] || null;
  }

  // Lazily modelled expiries.
  function expiries(data) {
    var S = data.S, chain = Implied.limitStrikes(data.chain, 40, data.close[data.close.length - 1]);
    var lastT = Number(data.time[data.time.length - 1]); if (lastT > 1e12) lastT /= 1000;
    var list = (data.schedule || []).filter(function (e) { return e && e.expiration && Number(e.expiration.dte) >= 1; })
      .map(function (e) {
        var x = e.expiration, key = expiryKey(x.code), byStrike = chain.resultByExpiration && chain.resultByExpiration[key];
        var ts = Number(x.timestamp) > 0 ? Number(x.timestamp) : lastT + Number(x.dte) * 86400;
        return { x: x, key: key, dte: Number(x.dte), T: Number(x.dte) / 365, ts: ts, date: ymd(ts), label: short(ts), byStrike: byStrike, _ex: undefined };
      })
      .filter(function (e) { return e.byStrike; })
      .sort(function (a, b) { return a.dte - b.dte; });
    list.forEach(function (e) {
      Object.defineProperty(e, 'ex', { get: function () {
        if (e._ex === undefined) { try { e._ex = Implied.explain(e.byStrike, S, e.T, R, SPREAD, MIN_STRIKES); } catch (err) { e._ex = null; } }
        return e._ex;
      } });
      Object.defineProperty(e, 'ok', { get: function () { return !!(e.ex && e.ex.d); } });
    });
    return list;
  }

  function load(sym) {
    var t = find(sym);
    if (!t) return Promise.reject(Object.assign(new Error('unknown ticker'), { unknown: String(sym || '').toUpperCase() }));
    var p = Object.assign({ seed: 7 }, Implied.PRESETS[t.preset]), d = Implied.synth(p);
    var c = Implied.candles(p.S, 260, 5 + Implied.TICKERS.indexOf(t) * 4, undefined, undefined, p.vol / 100);
    var data = { sym: t.sym, name: t.name, kind: t.kind, preset: t.preset, schedule: d.schedule, chain: d.chain, close: c.close, time: c.time };
    var q = Number(data.chain && data.chain.underlyingSymbolQuote && data.chain.underlyingSymbolQuote.lastPrice);
    data.S = q > 0 ? q : data.close[data.close.length - 1];
    data.r = R;
    data.expiries = expiries(data);
    return Implied.runScript({ ticker: data.sym, schedule: data.schedule, chain: data.chain, close: data.close, time: data.time }).then(function (out) { data.out = out; return data; });
  }

  // ATM implied vol from the fitted smile; lognormal density and CDF with it.
  function atmIv(e) { return e.ok ? Math.sqrt(e.ex.smile(0) / e.T) : null; }
  function lognormal(e, K) {
    var s = atmIv(e), F = e.ex.F, v = s * Math.sqrt(e.T), z = (Math.log(K / F) + v * v / 2) / v;
    return { pdf: Math.exp(-z * z / 2) / (K * v * 2.5066282746), cdf: normCdf(z) };
  }
  function sigmaPrice(e, n) { var s = atmIv(e), v = s * Math.sqrt(e.T); return e.ex.F * Math.exp(-v * v / 2 + n * v); }
  // The at-the-money straddle (mid prices) at the strike nearest the forward.
  function straddle(e) {
    var F = e.ok ? e.ex.F : NaN, best = null;
    Object.keys(e.byStrike).forEach(function (k) {
      var row = e.byStrike[k], K = Number(k);
      if (!row || !row.C || !row.P || !(row.C.a > 0) || !(row.P.a > 0)) return;
      if (!best || Math.abs(K - F) < Math.abs(best.K - F)) best = { K: K, c: (row.C.b + row.C.a) / 2, p: (row.P.b + row.P.a) / 2 };
    });
    return best && { K: best.K, price: best.c + best.p };
  }

  global.ImpliedMarket = { load: load, atmIv: atmIv, lognormal: lognormal, sigmaPrice: sigmaPrice, straddle: straddle, short: short, ymd: ymd };
})(window);
