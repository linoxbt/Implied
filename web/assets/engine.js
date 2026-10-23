// Implied — browser engine.
// 1. runScript: runs the real, unmodified implied.js against a stand-in for
//    TrendSpider's runtime and records what it paints (as test/runtime.js does in Node).
// 2. synth: builds option chains in TrendSpider's response shape, priced from a
//    known distribution, so every page can show the script working on demand.
// Needs core.js loaded first (black76Call and friends are globals).
(function (global) {
  'use strict';
  var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  var scriptText = null;

  function loadScript() {
    if (scriptText) return Promise.resolve(scriptText);
    return fetch('/implied.js').then(function (r) {
      if (!r.ok) throw new Error('Could not load implied.js');
      return r.text();
    }).then(function (t) { scriptText = t; return t; });
  }

  function IndicatorError(msg) { this.message = msg; }

  var STYLES = ['line', 'column', 'stacked_column', 'dotted', 'ladder', 'labels_above', 'labels_below', 'area', 'arearange', 'columnrange', 'candles', 'boxplot', 'bubble'];

  // request.options_data_for_all_expirations(ticker, n, ...) returns n strikes
  // on each side of the price (max 40) for every expiry; mirror that here.
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

  async function runScript(opts) {
    var code = await loadScript();
    var close = opts.close, time = opts.time, inputs = opts.inputs || {};
    var out = { name: null, placement: null, inputs: [], projections: [], fills: [], overlays: [], error: null, requests: [] };
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
        options_schedule: async function (t) { out.requests.push(['options_schedule', t]); return opts.schedule; },
        options_data_for_all_expirations: async function () {
          var args = [].slice.call(arguments);
          out.requests.push(['options_data_for_all_expirations'].concat(args));
          return limitStrikes(opts.chain, args[1], close[close.length - 1]);
        },
      },
      close: close, time: time,
      series_of: function (v) { return new Array(close.length).fill(v); },
      paint_projection: function (series, o) {
        o = o || {};
        rule(Array.isArray(series), 'paint_projection needs an array');
        rule(!o.style || STYLES.indexOf(o.style) >= 0, 'unknown style ' + o.style);
        var id = { i: out.projections.length };
        out.projections.push(Object.assign({ series: series.slice(0, 100), length: series.length }, o));
        ids.set(id, out.projections.length - 1);
        return id;
      },
      fill: function (a, b, color, opacity, title) { out.fills.push({ a: ids.get(a), b: ids.get(b), color: color, opacity: opacity, title: title }); },
      paint_overlay: function (name, params, definition) { out.overlays.push({ name: name, params: params, definition: JSON.parse(JSON.stringify(definition)) }); },
    };
    var names = Object.keys(g);
    var fn = new AsyncFunction(names.join(','), '"use strict";\n' + code);
    var t0 = performance.now();
    try { await fn.apply(null, names.map(function (n) { return g[n]; })); }
    catch (e) { if (e instanceof IndicatorError) out.error = e.message; else { out.error = 'Script error: ' + (e && e.message || e); out.crash = true; } }
    out.ms = performance.now() - t0;
    return out;
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
    if (model.kind === 'mix') {
      var mean = model.parts.reduce(function (a, p) { return a + p.w * p.F; }, 0);
      return model.parts.reduce(function (a, p) { return a + p.w * black76Call(p.F * F / mean, K, T, p.sig, D); }, 0);
    }
    var k = Math.log(K / F);
    var sig = Math.max(0.03, model.atm + (model.skew || 0) * k + (model.curv || 0) * k * k);
    return black76Call(F, K, T, sig, D);
  }

  function strikeStep(S) { return S < 25 ? 0.5 : S < 200 ? 1 : S < 500 ? 2.5 : 5; }

  function expiryQuotes(o) {
    var rand = rng(o.seed || 1), r = o.r, T = o.T, S = o.S;
    var D = Math.exp(-r * T), F = S * Math.exp((r - (o.q || 0)) * T);
    var step = strikeStep(S), out = {};
    var range = o.range || 0.4;
    var lo = Math.ceil(S * (1 - range) / step) * step, hi = Math.floor(S * (1 + range) / step) * step;
    var spread = o.spreadPct, noise = o.noise == null ? 0.5 : o.noise, minHalf = 0.01;
    function quote(theo) {
      var half = Math.max(minHalf, spread * theo);
      var m = Math.max(0, theo + (rand() - 0.5) * noise * half * 2);
      var b = round2(Math.max(0, m - half)), a = round2(Math.max(b + 0.01, m + half));
      return { b: b, a: a, l: round2(m) };
    }
    for (var K = lo; K <= hi + 1e-9; K += step) {
      var c = trueCall(o.model, F, K, T, D), p = c - D * (F - K);
      out[(Math.round(K * 100) / 100).toFixed(2)] = { C: quote(c), P: quote(Math.max(0, p)) };
    }
    return { byStrike: out, F: F, D: D };
  }

  var EXPIRY_LADDER = [7, 14, 21, 28, 49, 77, 105, 140];

  // params: { S, vol, skew, curv, move, eDay, spreadPct, seed, r, expiries }
  function synth(params) {
    var S = params.S, r = params.r == null ? 0.04 : params.r;
    var ladder = (params.ladder || EXPIRY_LADDER).slice(0, params.count || 8);
    var schedule = [], res = {}, models = {};
    ladder.forEach(function (dte, i) {
      var T = dte / 365, F = S * Math.exp(r * T), model;
      if (params.move > 0 && dte >= params.eDay) {
        var j = params.move / 100, w = params.weight == null ? 0.5 : params.weight;
        model = { kind: 'mix', parts: [{ w: w, F: F * Math.exp(-j), sig: params.vol / 100 }, { w: 1 - w, F: F * Math.exp(j), sig: params.vol / 100 }] };
      } else {
        model = { kind: 'smile', atm: params.vol / 100, skew: params.skew, curv: params.curv };
      }
      var code = 'E' + dte;
      schedule.push({ expiration: { dte: dte, code: code } });
      res[code] = expiryQuotes({ S: S, r: r, T: T, model: model, spreadPct: params.spreadPct / 100, noise: params.noise, seed: (params.seed || 7) + i * 101 }).byStrike;
      models[code] = model;
    });
    return { schedule: schedule, chain: { underlyingSymbolQuote: { lastPrice: S }, resultByExpiration: res }, models: models };
  }

  function candles(S, n, seed, drift) {
    n = n || 260;
    var rand = rng(seed || 3), close = [], time = [];
    var now = new Date(); now.setUTCHours(20, 0, 0, 0);
    var t = now.getTime() / 1000;
    for (var d = 0; time.length < n; d++) {
      var ts = t - d * 86400, dow = new Date(ts * 1000).getUTCDay();
      if (dow !== 0 && dow !== 6) time.unshift(ts);
    }
    var p = 100;
    for (var i = 0; i < n; i++) { p *= Math.exp((rand() - 0.5) * 0.032 + (drift == null ? 0.0004 : drift)); close.push(p); }
    var k = S / close[n - 1];
    return { close: close.map(function (c) { return c * k; }), time: time };
  }

  var PRESETS = {
    index: { label: 'Index', S: 580, vol: 16, skew: -0.35, curv: 0.6, move: 0, eDay: 9, spreadPct: 2, count: 4 },
    earnings: { label: 'Earnings', S: 190, vol: 22, skew: -0.2, curv: 0.8, move: 8, eDay: 9, spreadPct: 3, count: 4 },
    meme: { label: 'High IV', S: 24, vol: 110, skew: 0.45, curv: 0.6, move: 0, eDay: 9, spreadPct: 6, count: 4 },
    bell: { label: 'Bell curve', S: 100, vol: 25, skew: 0, curv: 0, move: 0, eDay: 9, spreadPct: 2, count: 4 },
  };

  // Model one expiry step by step (for the explorer and density views).
  function explain(byStrike, S, T, r, maxSpread) {
    var clean = cleanExpiry(byStrike, S, T, r, maxSpread);
    var smile = clean.pts.length >= 4 ? fitSmile(clean.pts, T) : null;
    var d = smile ? density(clean.F, T, clean.D, smile) : null;
    var shape = d ? describeShape(d, clean.F) : null;
    return { F: clean.F, D: clean.D, pts: clean.pts, smile: smile, d: d, shape: shape, total: Object.keys(byStrike || {}).length };
  }

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

  global.Implied = { runScript: runScript, limitStrikes: limitStrikes, loadScript: loadScript, rng: rng, trueCall: trueCall, expiryQuotes: expiryQuotes, synth: synth, candles: candles, PRESETS: PRESETS, EXPIRY_LADDER: EXPIRY_LADDER, explain: explain, trueDensity: trueDensity };
})(window);
