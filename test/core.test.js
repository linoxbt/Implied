// Unit tests for the pure math in src/core.js (spec: "Unit tests").
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const fx = require('./fixtures.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a} (tol ${tol})`);

test('normCdf matches reference values to 1e-6', () => {
  const ref = { '-3': 0.0013498980316301, '-1': 0.15865525393145707, 0: 0.5, 1: 0.8413447460685429, 3: 0.9986501019683699 };
  for (const [x, v] of Object.entries(ref)) near(core.normCdf(Number(x)), v, 1e-6, `N(${x})`);
});

test('Black-76 / implied vol round trip on the OTM side, K/F 0.6-1.6, 7-180 days', () => {
  // The pipeline only solves IV on out-of-the-money quotes (puts below F are
  // converted with parity), so the round trip is tested the same way.
  let worst = 0;
  for (const m of [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6]) for (const dte of [7, 30, 90, 180]) for (const sig of [0.1, 0.25, 0.6, 1.2]) {
    const F = 100, K = F * m, T = dte / 365, D = Math.exp(-0.04 * T);
    const call = core.black76Call(F, K, T, sig, D);
    const otm = K >= F ? call : call - D * (F - K); // put price
    if (otm < 1e-4) continue; // below a tick: no market would quote it
    const iv = core.impliedVol(K >= F ? call : otm + D * (F - K), F, K, T, D);
    assert.notEqual(iv, null, `IV failed at K/F=${m} dte=${dte} sig=${sig}`);
    worst = Math.max(worst, Math.abs(iv - sig));
  }
  assert.ok(worst < 1e-4, `worst IV error ${worst}`);
});

test('impliedVol rejects prices with no time value or above the forward', () => {
  const T = 0.1, D = Math.exp(-0.004);
  assert.equal(core.impliedVol(D * 20, 100, 80, T, D), null); // exactly intrinsic
  assert.equal(core.impliedVol(D * 100, 100, 80, T, D), null); // at the upper bound
  assert.equal(core.impliedVol(NaN, 100, 80, T, D), null);
});

test('natural spline interpolates its knots and is linear-exact', () => {
  const xs = [0, 1, 2, 3, 4], ys = xs.map(x => 2 * x + 1);
  const s = core.naturalSpline(xs, ys);
  for (const x of [0, 0.5, 1.7, 3.9, 4]) near(s.value(x), 2 * x + 1, 1e-12);
  near(s.slope(2.2), 2, 1e-12);
});

test('LU solver solves a small system and flags a singular one', () => {
  const solve = core.luFactor([[4, 1, 0], [1, 3, 1], [0, 1, 2]]);
  const x = solve([5, 5, 3]);
  [1, 1, 1].forEach((v, i) => near(x[i], v, 1e-12));
  assert.equal(core.luFactor([[1, 2], [2, 4]]), null);
});

test('quoteMid drops zero bids, inverted and too-wide quotes', () => {
  assert.equal(core.quoteMid({ b: 0, a: 1 }, 0.5), null);
  assert.equal(core.quoteMid({ b: 1.2, a: 1.1 }, 0.5), null);
  assert.equal(core.quoteMid({ b: 1, a: 3 }, 0.5), null);
  assert.equal(core.quoteMid(undefined, 0.5), null);
  const q = core.quoteMid({ b: '1.00', a: '1.10' }, 0.5); // string fields are accepted
  near(q.mid, 1.05, 1e-12); near(q.half, 0.05, 1e-12);
});

test('parity forward recovers a dividend-adjusted forward within 0.1%', () => {
  for (const q of [0, 0.02, 0.05]) {
    const S = 250, r = 0.045, T = 60 / 365;
    const { byStrike, F } = fx.expiryQuotes({ S, r, q, T, model: { kind: 'smile', atm: 0.3, skew: -0.3 }, spreadPct: 0.02, seed: 11 });
    const out = core.cleanExpiry(byStrike, S, T, r, 0.5);
    near(out.F / F, 1, 0.001, `q=${q}`);
  }
});

test('junk input never throws', () => {
  const junk = {
    abc: { C: { b: 1, a: 2 } }, '-5': { C: { b: 1, a: 2 } }, 0: null, 100: { C: { b: 0, a: 0 }, P: { b: 2, a: 1 } },
    105: { C: { b: 'x', a: null } }, 110: {}, 115: { P: { b: 1, a: 1.1 } }, 120: 'garbage',
  };
  assert.doesNotThrow(() => core.cleanExpiry(junk, 100, 0.1, 0.04, 0.5));
  assert.doesNotThrow(() => core.cleanExpiry(undefined, 100, 0.1, 0.04, 0.5));
  assert.equal(core.modelExpiry(junk, 100, 0.1, 0.04, 0.5, 8), null);
  assert.equal(core.fitSmile([], 0.1), null);
  assert.equal(core.fitSmile([{ k: 0, w: 0.01, sdw: 0.001 }, { k: 0, w: 0.01, sdw: 0.001 }, { k: 0, w: 0.01, sdw: 0.001 }, { k: 0, w: 0.01, sdw: 0.001 }], 0.1), null);
});

test('labels: price formatting, Fork label, skew tag thresholds', () => {
  assert.equal(core.formatPrice(182.456), '$182.46');
  assert.equal(core.formatPrice(5812.6), '$5813');
  assert.equal(core.forkLabel({ low: 182, high: 201, valley: 190 }), 'Fork: $182.00 / $201.00 · least likely $190.00');
  assert.equal(core.skewTag(1.0), null);
  assert.equal(core.skewTag(1.15), null);
  assert.equal(core.skewTag(0.87), null);
  assert.equal(core.skewTag(1.3), 'Upside tail 1.3× downside');
  assert.equal(core.skewTag(1 / 1.4), 'Downside tail 1.4× upside');
  assert.equal(core.skewTag(NaN), null);
});
