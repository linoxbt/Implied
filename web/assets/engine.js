// Implied — engine shared by the website, the test suite and tools/replay.js.
// 1. A stand-in for TrendSpider's script runtime: runs the real, unmodified
//    implied.js and records what it paints, checking the API rules the
//    script relies on (40 strikes per side, valid styles, named and unique
//    lines), trims projections to 100 values as the platform does, and keeps
//    overlays as JSON copies. That names stay the same from run to run is
//    checked by a test across scenarios. It is a model of
//    TrendSpider's runtime, not the runtime itself: the assumptions still to
//    confirm live are listed in docs/verify-in-trendspider.md.
// 2. Synthetic option chains in TrendSpider's response shape (real-format
//    expiry codes, optional gaps and one-sided strikes), priced from a known
//    distribution.
// In the browser it reads core.js's functions from the page; in Node it
// requires src/core.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../src/core.js'), true);
  else root.Implied = factory(root, false);
})(typeof self !== 'undefined' ? self : this, function (core, isNode) {
  'use strict';
  var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  var now = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };

  // ---------- The runtime stand-in ----------
  var STYLES = ['line', 'column', 'stacked_column', 'dotted', 'ladder', 'labels_above', 'labels_below', 'area', 'arearange', 'columnrange', 'candles', 'boxplot', 'bubble'];
  var MAX_PROJECTION = 100;

  function IndicatorError(msg) { this.message = msg; }

  // request.options_data_for_all_expirations(ticker, n, ...) returns n strikes
  // on each side of the price (max 40) for every expiry.
  function limitStrikes(chain, n, fallbackSpot) {
    if (!chain || !chain.resultByExpiration) return chain;
    var S = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice) || fallbackSpot;
    var k = Math.min(40, Math.max(1, Number(n) || 0)), out = {};
    Object.keys(chain.resultByExpiration).forEach(function (code) {
      var byStrike = chain.resultByExpiration[code] || {};
      var keys = Object.keys(byStrike).filter(function (x) { return Number(x) > 0; }).sort(function (a, b) { return a - b; });
      var below = keys.filter(function (x) { return Number(x) < S; }).slice(-k), above = keys.filter(function (x) { return Number(x) >= S; }).slice(0, k);
      out[code] = {};
      below.concat(above).forEach(function (x) { out[code][x] = byStrike[x]; });
    });
    return Object.assign({}, chain, { resultByExpiration: out });
  }

  // The globals TrendSpider gives a script, in the order the site's
  // pre-built script function (assets/implied-fn.js) takes them.
  var GLOBALS = ['describe_indicator', 'current', 'input', 'assert', 'request', 'close', 'time', 'series_of', 'paint_projection', 'fill', 'paint_overlay'];

  // Runs `code` (the text of implied.js, or the same script pre-wrapped as an
  // async function of GLOBALS) with the given chart and data.
  // opts: { ticker, resolution, schedule, chain, close, time, inputs, rethrow }
  // A failed assert() becomes out.error (the on-chart message). Any other
  // exception is a crash: rethrown when opts.rethrow, else out.crash = true.
  async function runCode(code, opts) {
    var close = opts.close, time = opts.time, inputs = opts.inputs || {};
    var out = { name: null, placement: null, inputs: [], projections: [], fills: [], overlays: [], error: null, crash: false, requests: [] };
    var ids = new Map();
    function rule(cond, msg) { if (!cond) throw new Error('TrendSpider rule broken: ' + msg); }
    function declare(kind, label, def, o) { out.inputs.push({ kind: kind, label: label, def: def, opts: o }); return label in inputs ? inputs[label] : def; }
    var g = {
      describe_indicator: function (name, placement) { out.name = name; out.placement = placement; },
      current: { ticker: opts.ticker || 'DEMO', resolution: opts.resolution || 'D' },
      input: {
        number: function (l, d, o) { return declare('number', l, d, o); },
        boolean: function (l, d, o) { return declare('boolean', l, d === undefined ? true : d, o); },
      },
      assert: function (cond, msg) { if (!cond) throw new IndicatorError(msg); },
      request: {
        options_schedule: async function (t) { out.requests.push(['options_schedule', t]); return typeof opts.schedule === 'function' ? opts.schedule() : opts.schedule; },
        options_data_for_all_expirations: async function () {
          var args = [].slice.call(arguments);
          out.requests.push(['options_data_for_all_expirations'].concat(args));
          var c = typeof opts.chain === 'function' ? opts.chain.apply(null, args) : opts.chain;
          return limitStrikes(c, args[1], close[close.length - 1]);
        },
      },
      close: close, time: time,
      series_of: function (v) { return new Array(close.length).fill(v); },
      paint_projection: function (series, o) {
        o = o || {};
        rule(Array.isArray(series), 'paint_projection needs an array');
        rule(!o.style || STYLES.indexOf(o.style) >= 0, 'unknown style "' + o.style + '"');
        rule(typeof o.name === 'string' && o.name && !out.projections.some(function (p) { return p.name === o.name; }), 'line names must be set and unique ("' + o.name + '")');
        var id = { i: out.projections.length };
        out.projections.push(Object.assign({ series: series.slice(0, MAX_PROJECTION), length: series.length }, o));
        ids.set(id, out.projections.length - 1);
        return id;
      },
      fill: function (a, b, color, opacity, title) {
        rule(ids.has(a) && ids.has(b), 'fill() needs two painted lines');
        out.fills.push({ a: ids.get(a), b: ids.get(b), color: color, opacity: opacity, title: title });
      },
      paint_overlay: function (name, params, definition) {
        rule(typeof name === 'string' && definition && Array.isArray(definition.rows), 'paint_overlay(name, params, { rows })');
        out.overlays.push({ name: name, params: params, definition: JSON.parse(JSON.stringify(definition)) });
      },
    };
    var fn = typeof code === 'function' ? code : new AsyncFunction(GLOBALS.join(','), '"use strict";\n' + code);
    var t0 = now();
    try {
      await fn.apply(null, GLOBALS.map(function (n) { return g[n]; }));
    } catch (e) {
      if (e instanceof IndicatorError) out.error = e.message;
      else if (opts.rethrow) throw e;
      else { out.error = 'Script error: ' + (e && e.message || e); out.crash = true; }
    }
    out.ms = now() - t0;
    return out;
  }

  // Browser: the site loads implied.js pre-wrapped as a function
  // (assets/implied-fn.js, built from dist/implied.js), so pages never need
  // eval and the CSP can forbid it. If that file failed to load, say so.
  async function runScript(opts) {
    var fn = typeof self !== 'undefined' && self.__impliedScript;
    if (typeof fn !== 'function') {
      return { error: 'Could not load implied.js. Check your connection and reload the page.', crash: true, projections: [], fills: [], overlays: [], inputs: [], requests: [], ms: 0 };
    }
    return runCode(fn, opts);
  }

  // ---------- Synthetic chains ----------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var round2 = function (x) { return Math.round(x * 100) / 100; };

  // model: { kind:'smile', atm, skew, curv } or { kind:'mix', parts:[{w, F, sig}] }
  function trueCall(model, F, K, T, D) {
    if (model.kind === 'mix') { // part forwards rescaled so the mixture's mean is F (no arbitrage)
      var mean = model.parts.reduce(function (a, p) { return a + p.w * p.F; }, 0);
      return model.parts.reduce(function (a, p) { return a + p.w * core.black76Call(p.F * F / mean, K, T, p.sig, D); }, 0);
    }
    var k = Math.log(K / F);
    var sig = Math.max(0.03, model.atm + (model.skew || 0) * k + (model.curv || 0) * k * k);
    return core.black76Call(F, K, T, sig, D);
  }

  function strikeStep(S) { return S < 25 ? 0.5 : S < 200 ? 1 : S < 500 ? 2.5 : 5; }

  // One expiry's quotes: { [strike]: { C: {b, a}, P: {b, a} } }.
  // o: { S, r, T, q, model, spreadPct, noise, seed, range, step, gaps, oneSided }
  //    gaps: share of strikes missing; oneSided: share of strikes with only a call or a put.
  function expiryQuotes(o) {
    var rand = rng(o.seed || 1), r = o.r, T = o.T, S = o.S;
    var D = Math.exp(-r * T), F = S * Math.exp((r - (o.q || 0)) * T);
    var step = o.step || strikeStep(S), out = {};
    var range = o.range || 0.35;
    var lo = Math.ceil(S * (1 - range) / step) * step, hi = Math.floor(S * (1 + range) / step) * step;
    var spread = o.spreadPct, noise = o.noise == null ? 0.5 : o.noise, minHalf = 0.01;
    function quote(theo) {
      var half = Math.max(minHalf, spread * theo);
      var m = Math.max(0, theo + (rand() - 0.5) * noise * half * 2);
      var b = round2(Math.max(0, m - half)), a = round2(Math.max(b + 0.01, m + half));
      return { b: b, a: a };
    }
    for (var K = lo; K <= hi + 1e-9; K += step) {
      var c = trueCall(o.model, F, K, T, D), p = c - D * (F - K);
      var row = { C: quote(c), P: quote(Math.max(0, p)) };
      if (o.gaps && rand() < o.gaps) continue;
      if (o.oneSided && rand() < o.oneSided) delete row[rand() < 0.5 ? 'C' : 'P'];
      out[(Math.round(K * 100) / 100).toFixed(2)] = row;
    }
    return { byStrike: out, F: F, D: D };
  }

  // Expiry identity as TrendSpider gives it: the schedule's code is YYYYMMDD
  // (a number) with year/month/day/timestamp; the chain's key is YYMMDD.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function expiryOf(asOfMs, dte) {
    var t = new Date(asOfMs + dte * 86400000), y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
    var pad = function (v) { return String(v).padStart(2, '0'); };
    return {
      expiration: { day: d, month: MONTHS[m - 1], year: y, code: Number(y + pad(m) + pad(d)), dte: dte, timestamp: Date.UTC(y, m - 1, d, 5) / 1000 },
      key: pad(y % 100) + pad(m) + pad(d),
    };
  }

  // A ticker: { schedule, chain } with real-format expiry codes.
  // p: { S, r, q, asOf (ms, UTC midnight of the last candle), expiries: [{ dte, model, spreadPct?, noise? }],
  //      seed, spreadPct, noise, step, gaps, oneSided, range, spot (quoted lastPrice; defaults to S) }
  function ticker(p) {
    var r = p.r == null ? 0.04 : p.r, asOf = p.asOf || todayUtc();
    var schedule = [], res = {};
    p.expiries.forEach(function (e, i) {
      var id = expiryOf(asOf, e.dte);
      schedule.push({ expiration: id.expiration });
      res[id.key] = expiryQuotes({
        S: p.S, r: r, q: p.q, T: e.dte / 365, model: e.model, seed: (p.seed || 7) + i * 101,
        spreadPct: e.spreadPct != null ? e.spreadPct : p.spreadPct, noise: e.noise != null ? e.noise : p.noise,
        step: p.step, gaps: p.gaps, oneSided: p.oneSided, range: p.range,
      }).byStrike;
    });
    return { schedule: schedule, chain: { underlyingSymbolQuote: { lastPrice: p.spot || p.S }, resultByExpiration: res } };
  }

  // The last weekday (UTC midnight): the simulated chart's last candle.
  // Expiries are placed whole weeks out from it (on that weekday, not always
  // a Friday), so days-to-expiry match the chart.
  function todayUtc() {
    var d = new Date(), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), dow = new Date(t).getUTCDay();
    return t - (dow === 6 ? 1 : dow === 0 ? 2 : 0) * 86400000;
  }

  // Daily candles ending at asOf (weekdays only), last close = S. vol is the
  // annualized volatility of the path (about 15% when omitted).
  function candles(S, n, seed, asOf, drift, vol) {
    n = n || 260;
    var rand = rng(seed || 3), close = [], time = [];
    var end = (asOf || todayUtc()) / 1000;
    for (var d = 0; time.length < n; d++) {
      var ts = end - d * 86400, dow = new Date(ts * 1000).getUTCDay();
      if (dow !== 0 && dow !== 6) time.unshift(ts);
    }
    var p = 100;
    var width = vol ? vol / Math.sqrt(252) * Math.sqrt(12) : 0.032; // a uniform step of this width has sd vol/sqrt(252)
    for (var i = 0; i < n; i++) { p *= Math.exp((rand() - 0.5) * width + (drift == null ? 0.0004 : drift)); close.push(p); }
    var k = S / close[n - 1];
    return { close: close.map(function (c) { return c * k; }), time: time };
  }

  // Website markets: an expiry every week for two months, then monthlies.
  var LADDER = [7, 14, 21, 28, 35, 42, 49, 56, 63, 77, 91];
  var PRESETS = {
    index: { label: 'Index', S: 580, vol: 16, skew: -0.35, curv: 0.6, move: 0, eDay: 9, spreadPct: 2, count: 4 },
    earnings: { label: 'Earnings', S: 190, vol: 22, skew: -0.2, curv: 0.8, move: 8, eDay: 9, spreadPct: 3, count: 4 },
    meme: { label: 'High IV', S: 24, vol: 110, skew: 0.45, curv: 0.6, move: 0, eDay: 9, spreadPct: 6, count: 4 },
    bell: { label: 'Bell curve', S: 100, vol: 25, skew: 0, curv: 0, move: 0, eDay: 9, spreadPct: 2, count: 4 },
  };

  // The website's simulated tickers (clearly not market data): symbol -> preset.
  var TICKERS = [
    { sym: 'XERN', name: 'Simulated two-outcome event stock', preset: 'earnings', kind: 'Stock' },
    { sym: 'XIDX', name: 'Simulated index ETF', preset: 'index', kind: 'ETF' },
    { sym: 'XHIV', name: 'Simulated high-IV stock', preset: 'meme', kind: 'Stock' },
    { sym: 'XBEL', name: 'Simulated flat-smile stock', preset: 'bell', kind: 'Stock' },
  ];

  // A website market from slider values: { S, vol (%), skew, curv, move (%), eDay, spreadPct (%), seed, weight }
  function synth(params) {
    var S = params.S, r = 0.04;
    var expiries = LADDER.map(function (dte) {
      var F = S * Math.exp(r * dte / 365), model;
      if (params.move > 0 && dte >= params.eDay) {
        var j = params.move / 100, w = params.weight == null ? 0.5 : params.weight;
        model = { kind: 'mix', parts: [{ w: w, F: F * Math.exp(-j), sig: params.vol / 100 }, { w: 1 - w, F: F * Math.exp(j), sig: params.vol / 100 }] };
      } else {
        model = { kind: 'smile', atm: params.vol / 100, skew: params.skew, curv: params.curv };
      }
      return { dte: dte, model: model };
    });
    return ticker({ S: S, r: r, expiries: expiries, spreadPct: params.spreadPct / 100, seed: params.seed || 7, asOf: params.asOf });
  }

  // One expiry, step by step, as the indicator models it (for the explorer
  // and the Fork page): the fit, the density, the shape and the Fork verdict.
  function explain(byStrike, S, T, r, maxSpread, minStrikes) {
    var f = core.fitExpiry(byStrike, S, T, r, maxSpread, minStrikes == null ? 8 : minStrikes);
    var strikes = f.pts.map(function (p) { return p.K; });
    var diag = f.ok ? core.fitForkDiagnostics(f) : null;
    var shape = f.ok ? Object.assign(core.describeShape(f.d, f.F, strikes), { fork: diag.fork }) : null;
    return { F: f.F, D: f.D, pts: f.pts, smile: f.smile, d: f.ok ? f.d : null, shape: shape, diag: diag, reason: f.reason, total: Object.keys(byStrike || {}).length };
  }

  // The density the quotes were priced from (dashed line on the Fork page).
  function trueDensity(model, F, T, r, lo, hi) {
    var D = Math.exp(-r * T), N = 400, h = (hi - lo) / (N - 1), Ks = [], pdf = [];
    for (var i = 0; i < N; i++) {
      var K = lo + i * h;
      Ks.push(K);
      pdf.push(Math.max(0, (trueCall(model, F, K + h, T, D) - 2 * trueCall(model, F, K, T, D) + trueCall(model, F, K - h, T, D)) / (h * h) / D));
    }
    var a = 0; for (var j = 1; j < N; j++) a += 0.5 * (pdf[j] + pdf[j - 1]) * h;
    return { Ks: Ks, pdf: pdf.map(function (v) { return v / (a || 1); }) };
  }

  return {
    GLOBALS: GLOBALS, runCode: runCode, runScript: runScript, limitStrikes: limitStrikes, STYLES: STYLES, MAX_PROJECTION: MAX_PROJECTION,
    rng: rng, trueCall: trueCall, expiryQuotes: expiryQuotes, expiryOf: expiryOf, ticker: ticker, candles: candles,
    synth: synth, PRESETS: PRESETS, TICKERS: TICKERS, explain: explain, trueDensity: trueDensity,
  };
});
