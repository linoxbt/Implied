// Model accuracy: price a chain from a known distribution, run the real
// pipeline on its bid/ask quotes, compare what comes back with the truth.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const fx = require('./fixtures.js');

const r = 0.04;

// True density straight from the model's call prices (no quotes, no fit).
function trueDensity(model, F, T) {
  const D = Math.exp(-r * T), N = 1201, lo = F * 0.4, hi = F * 1.8, h = (hi - lo) / (N - 1);
  const Ks = [], raw = [];
  for (let i = 0; i < N; i++) {
    const K = lo + i * h;
    Ks.push(K);
    raw.push(Math.max(0, (fx.trueCall(model, F, K + h, T, D) - 2 * fx.trueCall(model, F, K, T, D) + fx.trueCall(model, F, K - h, T, D)) / (h * h) / D));
  }
  let a = 0;
  for (let i = 1; i < N; i++) a += 0.5 * (raw[i] + raw[i - 1]) * h;
  const pdf = raw.map(v => v / a), cdf = [0];
  for (let i = 1; i < N; i++) cdf.push(cdf[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * h);
  return { Ks, pdf, cdf };
}

function fitted(model, { S = 100, dte = 30, spreadPct = 0.02, noise = 0.5, seed = 1 } = {}) {
  const T = dte / 365;
  const { byStrike } = fx.expiryQuotes({ S, r, T, model, spreadPct, noise, seed });
  const { F, D, pts } = core.cleanExpiry(byStrike, S, T, r, 0.5);
  const smile = core.fitSmile(pts, T);
  return { F, T, D, pts, smile, d: core.density(F, T, D, smile) };
}

const mix = (S, dte, jump, sig, w = 0.5) => {
  const F = S * Math.exp(r * dte / 365);
  return { kind: 'mix', parts: [{ w, F: F * Math.exp(-jump), sig }, { w: 1 - w, F: F * Math.exp(jump), sig }] };
};

test('flat 25% smile: density matches the lognormal, integrates to 1, median = F·e^(-σ²T/2)', () => {
  const sig = 0.25, { F, T, d } = fitted({ kind: 'smile', atm: sig }, { spreadPct: 0.01, noise: 0 });
  let area = 0;
  for (let i = 1; i < d.Ks.length; i++) area += 0.5 * (d.pdf[i] + d.pdf[i - 1]) * (d.Ks[i] - d.Ks[i - 1]);
  assert.ok(Math.abs(area - 1) < 0.001, `area ${area}`);
  const med = core.quantile(d, 0.5), expected = F * Math.exp(-sig * sig * T / 2);
  assert.ok(Math.abs(med / expected - 1) < 0.002, `median ${med} vs ${expected}`);
  // pointwise against the analytic lognormal pdf, relative to its peak
  const v = sig * Math.sqrt(T), mu = Math.log(F) - v * v / 2;
  let worst = 0, peak = 0;
  d.Ks.forEach((K, i) => {
    const ln = Math.exp(-((Math.log(K) - mu) ** 2) / (2 * v * v)) / (K * v * Math.sqrt(2 * Math.PI));
    peak = Math.max(peak, ln); worst = Math.max(worst, Math.abs(d.pdf[i] - ln));
  });
  assert.ok(worst / peak < 0.02, `max pdf error ${(100 * worst / peak).toFixed(2)}% of peak`);
  assert.equal(core.fork(d, F), null);
});

test('put-skew smile gives a skew ratio below 1; call skew above 1', () => {
  const put = fitted({ kind: 'smile', atm: 0.2, skew: -0.5, curv: 1 });
  const call = fitted({ kind: 'smile', atm: 0.8, skew: 0.5, curv: 0.5 }, { S: 25, spreadPct: 0.05 });
  assert.ok(core.describeShape(put.d, put.F).skew < 1);
  assert.ok(core.describeShape(call.d, call.F).skew > 1);
});

test('quantiles track the true distribution on a skewed smile (probability error < 1 point)', () => {
  // Truth from the exact CDF, CDF(K) = (dPut/dK) / D, which needs no density grid.
  const model = { kind: 'smile', atm: 0.2, skew: -0.3, curv: 0.5 };
  for (const dte of [7, 30, 90]) {
    const { F, T, D, d } = fitted(model, { S: 500, dte, spreadPct: 0.02, noise: 0.5, seed: dte });
    const put = K => fx.trueCall(model, F, K, T, D) - D * (F - K);
    const trueCdf = K => (put(K * 1.00001) - put(K * 0.99999)) / (K * 0.00002) / D;
    for (const p of core.QS) {
      let lo = F * 0.5, hi = F * 1.5;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (trueCdf(m) < p) lo = m; else hi = m; }
      const want = (lo + hi) / 2, got = core.quantile(d, p);
      assert.ok(Math.abs(core.cdfAt(d, want) - p) < 0.01, `dte ${dte} p${p}: CDF ${core.cdfAt(d, want).toFixed(4)} at true quantile ${want.toFixed(2)}`);
      assert.ok(Math.abs(got / want - 1) < 0.015, `dte ${dte} p${p}: ${got.toFixed(2)} vs ${want.toFixed(2)}`);
    }
  }
});

test('bimodal: 50/50 mixture 10% apart returns both peaks within 1% and a valley between', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const model = mix(150, 10, 0.05, 0.15);
    const { F, T, d } = fitted(model, { S: 150, dte: 10, spreadPct: 0.02, seed });
    const truth = core.fork(trueDensity(model, F, T), F), got = core.fork(d, F);
    assert.ok(truth, 'the test distribution must itself be two-peaked');
    assert.ok(got, `seed ${seed}: Fork not detected`);
    assert.ok(Math.abs(got.low / truth.low - 1) < 0.01, `low ${got.low} vs ${truth.low}`);
    assert.ok(Math.abs(got.high / truth.high - 1) < 0.01, `high ${got.high} vs ${truth.high}`);
    assert.ok(got.valley > got.low && got.valley < got.high);
  }
});

test('bimodal through the production path (data gate and smoothing check): 50/50, 10% apart, 1-3% spreads', () => {
  // The same case as above, but through modelExpiry, which is what the
  // indicator draws: every gate applies, quotes are cut to 40 strikes a side.
  const engine = require('../web/assets/engine.js');
  let found = 0, total = 0;
  for (const spreadPct of [0.01, 0.02, 0.03]) for (let seed = 1; seed <= 10; seed++) {
    const S = 150, dte = 14, T = dte / 365, model = mix(S, dte, 0.05, 0.15);
    const chain = { underlyingSymbolQuote: { lastPrice: S }, resultByExpiration: { x: fx.expiryQuotes({ S, r, T, model, spreadPct, seed }).byStrike } };
    const shape = core.modelExpiry(engine.limitStrikes(chain, 40, S).resultByExpiration.x, S, T, r, 0.5, 8);
    total++; if (shape && shape.fork) found++;
  }
  assert.equal(found, total, `${found} of ${total} drawn as a Fork`);
});

test('Fork detection: realistic earnings mixtures across spreads, weights and seeds', () => {
  let hits = 0, total = 0;
  for (let seed = 1; seed <= 8; seed++) for (const spreadPct of [0.01, 0.03, 0.05]) {
    for (const [dte, jump, w] of [[7, 0.07, 0.5], [10, 0.08, 0.6], [14, 0.09, 0.5], [21, 0.10, 0.4]]) {
      const model = mix(190, dte, jump, 0.20, w);
      const { F, T, d } = fitted(model, { S: 190, dte, spreadPct, noise: 1, seed });
      assert.ok(core.fork(trueDensity(model, F, T), F), 'test case must be two-peaked');
      total++; if (core.fork(d, F)) hits++;
    }
  }
  assert.ok(hits / total >= 0.95, `Fork found in ${hits}/${total}`);
});

test('no false Forks on one-outcome chains (skews, smiles, noisy quotes, short and long dated)', () => {
  const models = [
    [{ kind: 'smile', atm: 0.15, skew: -0.55, curv: 1.2 }, 580],
    [{ kind: 'smile', atm: 1.1, skew: 0.45, curv: 0.6 }, 24],
    [{ kind: 'smile', atm: 0.3, skew: -0.2, curv: 0.8 }, 190],
    [{ kind: 'smile', atm: 0.6, skew: -0.3, curv: 4 }, 45],
  ];
  let falses = 0, total = 0;
  for (let seed = 1; seed <= 6; seed++) for (const spreadPct of [0.01, 0.05]) for (const [model, S] of models) {
    for (const dte of [3, 7, 30, 90]) {
      const T = dte / 365;
      const { byStrike } = fx.expiryQuotes({ S, r, T, model, spreadPct, noise: 1, seed });
      const shape = core.modelExpiry(byStrike, S, T, r, 0.5, 8);
      if (!shape) continue;
      total++; if (shape.fork) falses++;
    }
  }
  assert.ok(total > 150, `only ${total} expiries modelled`);
  assert.equal(falses, 0, `${falses}/${total} false Forks`);
});

test('modelExpiry returns null when an expiry has too few liquid strikes', () => {
  const T = 30 / 365;
  const { byStrike } = fx.expiryQuotes({ S: 12, r, T, model: { kind: 'smile', atm: 0.6 }, spreadPct: 0.9 });
  assert.equal(core.modelExpiry(byStrike, 12, T, r, 0.5, 8), null);
});
