// Synthetic option chains in TrendSpider's response shape, priced from a known
// distribution so tests can compare what Implied recovers against the truth.
'use strict';
const core = require('../src/core.js');

function rng(seed) { // mulberry32, deterministic
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = x => Math.round(x * 100) / 100;

// Model of one expiry's true distribution:
//   { kind: 'smile', atm, skew, curv }       lognormal family with an IV smile in k
//   { kind: 'mix', parts: [{w, F, sig}] }    mixture of lognormals (two outcomes)
function trueCall(model, F, K, T, D) {
  if (model.kind === 'mix') { // part forwards are rescaled so the mixture's mean is F (no arbitrage)
    const mean = model.parts.reduce((a, p) => a + p.w * p.F, 0);
    return model.parts.reduce((a, p) => a + p.w * core.black76Call(p.F * F / mean, K, T, p.sig, D), 0);
  }
  const k = Math.log(K / F);
  const sig = Math.max(0.03, model.atm + (model.skew || 0) * k + (model.curv || 0) * k * k);
  return core.black76Call(F, K, T, sig, D);
}

function strikeStep(S) {
  if (S < 25) return 0.5;
  if (S < 200) return 1;
  if (S < 500) return 2.5;
  return 5;
}

// Build one expiry: { [strike]: { C: {b, a, l}, P: {b, a, l} } }
function expiryQuotes({ S, r, T, q = 0, model, spreadPct = 0.03, minHalf = 0.01, noise = 0.5, seed = 1, range = 0.35 }) {
  const rand = rng(seed);
  const D = Math.exp(-r * T), F = S * Math.exp((r - q) * T);
  const step = strikeStep(S), out = {};
  const lo = Math.ceil(S * (1 - range) / step) * step, hi = Math.floor(S * (1 + range) / step) * step;
  for (let K = lo; K <= hi + 1e-9; K += step) {
    const c = trueCall(model, F, K, T, D);
    const p = c - D * (F - K);
    const quote = theo => {
      const half = Math.max(minHalf, spreadPct * theo);
      const m = Math.max(0, theo + (rand() - 0.5) * noise * half * 2);
      const b = round2(Math.max(0, m - half)), a = round2(Math.max(b + 0.01, m + half));
      return { b, a, l: round2(m) };
    };
    out[(Math.round(K * 100) / 100).toFixed(2)] = { C: quote(c), P: quote(Math.max(0, p)) };
  }
  return { byStrike: out, F, D };
}

// A whole ticker: schedule + chain, as TrendSpider's request functions return them.
function ticker({ S, r = 0.04, q = 0, expiries, seed = 7, spreadPct, noise }) {
  const schedule = [], resultByExpiration = {};
  expiries.forEach((e, i) => {
    const code = 'E' + e.dte;
    schedule.push({ expiration: { dte: e.dte, code } });
    resultByExpiration[code] = expiryQuotes({
      S, r, q, T: e.dte / 365, model: e.model, seed: seed + i * 101,
      spreadPct: e.spreadPct ?? spreadPct, noise: e.noise ?? noise,
    }).byStrike;
  });
  return { schedule, chain: { underlyingSymbolQuote: { lastPrice: S }, resultByExpiration } };
}

// Daily candles ending today, for the mock chart.
function candles(S, n = 300, seed = 3) {
  const rand = rng(seed), close = [], time = [];
  let p = S * 0.9;
  const now = Date.UTC(2026, 9, 23) / 1000;
  for (let i = n - 1, d = 0; i >= 0; d++) {
    const ts = now - d * 86400, dow = new Date(ts * 1000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    time.unshift(ts); i--;
  }
  for (let i = 0; i < n; i++) { p *= Math.exp((rand() - 0.5) * 0.03 + 0.0004); close.push(p); }
  const k = S / close[n - 1];
  return { close: close.map(c => c * k), time };
}

const SCENARIOS = {
  // Equity index: steep put skew, 4 weeklies/monthlies.
  SPY: () => ticker({
    S: 580, q: 0.013, spreadPct: 0.02,
    expiries: [7, 14, 28, 49].map(dte => ({ dte, model: { kind: 'smile', atm: 0.16, skew: -0.35, curv: 0.6 } })),
  }),
  // Earnings between the 1st and 2nd expiry: the 2nd+ expiries price two outcomes.
  EARN: () => {
    const S = 190, sig = 0.22;
    const mix = dte => {
      const T = dte / 365, F = S * Math.exp(0.04 * T), jump = 0.08;
      return { kind: 'mix', parts: [
        { w: 0.5, F: F * Math.exp(-jump), sig }, { w: 0.5, F: F * Math.exp(jump), sig }] };
    };
    return ticker({
      S, spreadPct: 0.03,
      expiries: [
        { dte: 3, model: { kind: 'smile', atm: 0.30, skew: -0.2, curv: 0.8 } },
        { dte: 10, model: mix(10) }, { dte: 17, model: mix(17) }, { dte: 38, model: mix(38) },
      ],
    });
  },
  // Meme stock: very high IV, call skew (fat right tail), wide spreads.
  MEME: () => ticker({
    S: 24, spreadPct: 0.06,
    expiries: [7, 14, 28, 56].map(dte => ({ dte, model: { kind: 'smile', atm: 1.1, skew: 0.45, curv: 0.6 } })),
  }),
  // Illiquid: a handful of strikes, every quote too wide.
  ILLIQ: () => ticker({
    S: 12, spreadPct: 0.9,
    expiries: [30, 60].map(dte => ({ dte, model: { kind: 'smile', atm: 0.6 } })),
  }),
};

module.exports = { rng, trueCall, expiryQuotes, ticker, candles, SCENARIOS };
