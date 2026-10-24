// Regression tests for the issues found in the full audit: each one failed (or
// could not fail) before its fix. Grouped by the audit finding they pin down.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const fx = require('./fixtures.js');
const { runIndicator } = require('./runtime.js');

const r = 0.04;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a} (tol ${tol})`);
const overlayText = out => out.overlays.flatMap(o => o.definition.rows.flatMap(row => row.cells.map(c => c.text).filter(Boolean)));
const lastBar = s => { let i = s.length - 1; while (i > 0 && s[i] == null) i--; return i; };

// A density on a fine grid from two normal bumps: centers c1, c2 (fractions of
// F away from F), equal width, heights h1, h2.
function bumps(F, c1, c2, width, h1 = 1, h2 = 1) {
  const Ks = [], pdf = [];
  for (let i = 0; i < 2001; i++) {
    const K = F * (0.7 + 0.6 * i / 2000), z1 = (K / F - 1 - c1) / width, z2 = (K / F - 1 - c2) / width;
    Ks.push(K); pdf.push(h1 * Math.exp(-z1 * z1 / 2) + h2 * Math.exp(-z2 * z2 / 2));
  }
  return { Ks, pdf, cdf: Ks.map(() => 0) };
}

test('Fork rules: each threshold decides at its boundary (25% height, 3% apart, 70% valley)', () => {
  const F = 100;
  // Separation: peaks 2% apart never count as two; well apart with a deep valley do.
  assert.equal(core.forkDiagnostics(bumps(F, -0.01, 0.01, 0.004), F).fork, null);
  assert.ok(core.forkDiagnostics(bumps(F, -0.03, 0.03, 0.008), F).fork);
  // Valley: just below 70% of the smaller peak is a Fork, just above is not.
  const valleyAt = w => core.forkDiagnostics(bumps(F, -0.04, 0.04, w), F).valley;
  let lo = 0.01, hi = 0.06;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (valleyAt(m) < core.FORK_VALLEY) lo = m; else hi = m; }
  assert.ok(core.forkDiagnostics(bumps(F, -0.04, 0.04, lo * 0.99), F).fork, 'valley just under 70%');
  assert.equal(core.forkDiagnostics(bumps(F, -0.04, 0.04, hi * 1.01), F).fork, null, 'valley just over 70%');
  // Height: a second peak at 20% of the first is ignored, at 30% it counts.
  assert.equal(core.forkDiagnostics(bumps(F, -0.05, 0.05, 0.01, 1, 0.2), F).fork, null);
  assert.ok(core.forkDiagnostics(bumps(F, -0.05, 0.05, 0.01, 1, 0.3), F).fork);
  assert.deepEqual([core.FORK_HEIGHT, core.FORK_SEPARATION, core.FORK_VALLEY], [0.25, 0.03, 0.7]);
});

test('Fork data gate: peaks outside the quoted strikes, or with too few quotes between, are not a Fork', () => {
  const F = 100, d = bumps(F, -0.06, 0.06, 0.012);
  assert.ok(core.forkDiagnostics(d, F).fork, 'two clear peaks without a gate');
  const dense = Array.from({ length: 61 }, (_, i) => 85 + i * 0.5);
  assert.ok(core.forkDiagnostics(d, F, dense).fork, 'quotes all across both peaks');
  assert.equal(core.forkDiagnostics(d, F, dense.filter(k => k > 97)).fork, null, 'lower peak beyond the last quote');
  assert.equal(core.forkDiagnostics(d, F, [90, 100, 110]).reason, 'too few quotes between peaks');
});

test('total probability is measured before normalizing (raw mass ~1 on a flat smile)', () => {
  // At 90 days and 4% the discount factor is 0.990: a density that forgot to
  // undo it would hold 0.990 of the probability and fail this check.
  const T = 90 / 365, D = Math.exp(-r * T), F = 100;
  const d = core.density(F, T, D, () => 0.25 * 0.25 * T);
  near(d.mass, 1, 1e-3, 'raw mass');
  near(d.arbitrage, 0, 1e-9, 'no negative probability');
  assert.ok(1 - D > 5e-3, 'the check is sensitive to the discount');
});

test('density stays accurate on high-volatility, long-dated chains (log-strike grid)', () => {
  const S = 24, F = S * Math.exp(r * 91 / 365);
  for (const [vol, dte] of [[1.1, 56], [1.1, 91]]) {
    const T = dte / 365, D = Math.exp(-r * T), w = k => vol * vol * T + 0.15 * Math.sqrt(T) * (Math.sqrt(k * k + 0.09) - 0.3);
    const d = core.density(F, T, D, w);
    near(d.mass, 1, 0.01, `vol ${vol} dte ${dte} mass`);
    // exact CDF from the call price's slope
    const C = K => core.black76Call(F, K, T, Math.sqrt(w(Math.log(K / F)) / T), D);
    const cdf = K => 1 + (C(K * 1.000001) - C(K * 0.999999)) / (K * 0.000002) / D;
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      let lo = F * 1e-3, hi = F * 50;
      for (let i = 0; i < 100; i++) { const m = Math.sqrt(lo * hi); if (cdf(m) < p) lo = m; else hi = m; }
      const want = Math.sqrt(lo * hi), got = core.quantile(d, p);
      assert.ok(Math.abs(got / want - 1) < 0.01, `vol ${vol} dte ${dte} p${p}: ${got} vs ${want}`);
    }
  }
});

test('arbitrage-free smoothing: a 110% vol, 91-day chain gives no false Fork', () => {
  const S = 24, T = 91 / 365, { byStrike } = fx.expiryQuotes({ S, r, T, model: fx.smile(1.1, 0.3, 0.4), spreadPct: 0.04, range: 0.9, step: 0.5, seed: 3 });
  const shape = core.modelExpiry(byStrike, S, T, r, 0.5, 8);
  assert.ok(shape, 'modelled');
  assert.equal(shape.fork, null);
  assert.ok(shape.d.arbitrage <= core.MAX_ARBITRAGE);
});

test('risk-free rate enters the parity forward through the discount factor', () => {
  const S = 250, T = 60 / 365, q = 0.02;
  const { byStrike, F } = fx.expiryQuotes({ S, r, q, T, model: fx.smile(0.3, -0.3), spreadPct: 0.01, noise: 0, seed: 2 });
  const right = core.cleanExpiry(byStrike, S, T, r, 0.5).F, zero = core.cleanExpiry(byStrike, S, T, 0, 0.5).F;
  near(right / F, 1, 0.001, 'right rate recovers the forward');
  // F = K + (C - P) / D: a wrong rate moves it by (C - P)(1/D - 1), small near the money but not zero.
  assert.notEqual(zero, right, 'the rate is used');
  near(zero / F, 1, 0.005, 'and a wrong rate stays within 0.5%');
});

test("Lee's bound: extrapolated wings never steeper than |dw/dk| = 2 and never turn back", () => {
  const T = 30 / 365, pts = [];
  for (let k = -0.3; k <= 0.3 + 1e-9; k += 0.02) pts.push({ k, w: (0.3 + 4 * k * k) * T + 3 * Math.abs(k) * T, sdw: 1e-4 });
  const smile = core.fitSmile(pts, T);
  for (const k of [2, 4, 8]) {
    assert.ok((smile(k + 0.01) - smile(k)) / 0.01 <= 2 + 1e-9, `right slope at k=${k}`);
    assert.ok((smile(-k - 0.01) - smile(-k)) / 0.01 <= 2 + 1e-9, `left slope at k=${-k}`);
    assert.ok(smile(k + 1) >= smile(k) && smile(-k - 1) >= smile(-k), 'wings rise outward');
  }
});

test('wings stop at a run of rejected quotes; stray far strikes are ignored', () => {
  const S = 40, T = 60 / 365, { byStrike } = fx.expiryQuotes({ S, r, T, model: fx.smile(0.5), spreadPct: 0.03, noise: 0, range: 0.6, seed: 1 });
  for (const K of ['24.00', '25.00', '26.00']) byStrike[K].P = { b: 0, a: 0.05 }; // a dead zone of zero bids
  byStrike['18.00'].P = { b: 0.4, a: 0.45 }; // a stale print beyond it
  const pts = core.cleanExpiry(byStrike, S, T, r, 0.5).pts;
  assert.ok(pts.every(p => p.K > 26), `lowest strike used ${pts[0].K}`);
});

test('stale spot: parity forward wins; a forward far from spot skips the expiry', () => {
  const S = 100, T = 30 / 365, { byStrike, F } = fx.expiryQuotes({ S, r, T, model: fx.smile(0.3), spreadPct: 0.01, noise: 0, seed: 4 });
  near(core.cleanExpiry(byStrike, S * 1.1, T, r, 0.5).F / F, 1, 0.001, 'spot 10% stale');
  assert.equal(core.modelExpiry(byStrike, S * 0.7, T, r, 0.5, 8), null, 'spot 30% away: skipped');
});

test('normal CDF to double precision', () => {
  const ref = { '-5': 2.866515718791939e-7, '-1': 0.15865525393145705, '0.3': 0.6179114221889527, 2: 0.9772498680518208, 8: 0.9999999999999993 };
  for (const [x, v] of Object.entries(ref)) near(core.normCdf(Number(x)), v, 1e-13, `N(${x})`);
});

test('expiry codes match across formats (YYYYMMDD schedule, YYMMDD chain, or by date)', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY(), c = fx.candles(580);
  const ok = await runIndicator({ ticker: 'SPY', schedule, chain, ...c });
  assert.equal(ok.error, null);
  assert.ok(String(schedule[0].expiration.code).length === 8 && Object.keys(chain.resultByExpiration)[0].length === 6, 'fixtures use real formats');
  // codes that don't match, but year/month/day do
  const byDate = schedule.map(e => ({ expiration: { ...e.expiration, code: 'X' + e.expiration.day } }));
  assert.equal((await runIndicator({ ticker: 'SPY', schedule: byDate, chain, ...c })).error, null);
  // nothing matches: a message that says so, not "not enough liquid strikes"
  const none = schedule.map(e => ({ expiration: { dte: e.expiration.dte, code: 'X' + e.expiration.dte } }));
  const out = await runIndicator({ ticker: 'SPY', schedule: none, chain, ...c });
  assert.match(out.error, /^Options data for SPY did not include any expiration/);
});

test('an expiry every weekday: the default cloud still reaches weeks out', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY_DAILY(), c = fx.candles(580);
  assert.ok(schedule.length > 40);
  const four = await runIndicator({ ticker: 'SPY', schedule, chain, ...c });
  assert.equal(four.error, null);
  assert.ok(lastBar(four.projections[3].series) >= 55, 'default reaches ~60 days, got ' + lastBar(four.projections[3].series));
  const eight = await runIndicator({ ticker: 'SPY', schedule, chain, inputs: { 'Expirations to project': 8 }, ...c });
  assert.ok(lastBar(eight.projections[3].series) >= lastBar(four.projections[3].series));
});

test('last close differs from the quoted spot: panel, Fork ticks and cloud agree', async () => {
  for (const name of ['SPY', 'EARN']) {
    const { schedule, chain } = fx.SCENARIOS[name](), S = chain.underlyingSymbolQuote.lastPrice;
    const c = fx.candles(S * 0.97); // the last candle closed 3% below the live quote
    const out = await runIndicator({ ticker: name, schedule, chain, ...c });
    assert.equal(out.error, null);
    const title = overlayText(out)[0], day = Number(/· (\d+)-DAY/.exec(title)[1]);
    const medianLine = overlayText(out).find(t => t.startsWith('Median '));
    const shown = Number(/Median \$([\d.]+)/.exec(medianLine)[1]);
    near(shown, out.projections[3].series[day], 0.01, name + ' panel median vs chart');
    const [high, low] = out.projections.slice(7, 9);
    high.series.forEach((v, i) => {
      if (v == null) return;
      assert.ok(v <= out.projections[6].series[i] && low.series[i] >= out.projections[0].series[i], `${name} Fork tick inside the cloud at bar ${i}`);
    });
  }
});

test('expiries are placed from their timestamp, relative to the last candle', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const c = fx.candles(580);
  const late = { close: c.close, time: c.time.map(t => t - 2 * 86400) }; // last candle two days before "today"
  const out = await runIndicator({ ticker: 'SPY', schedule, chain, ...late });
  assert.equal(out.error, null);
  assert.equal(lastBar(out.projections[3].series), 49 + 2, 'the 49-day expiry is 51 days after the last candle');
});

test('expiry plan picks the nearest expiry to each horizon', () => {
  const days = [1, 2, 3, 6, 9, 13, 16, 30, 33, 58, 63];
  const plan = core.expiryPlan(days, 4).map(order => days[order[0]]);
  assert.deepEqual(plan, [6, 13, 30, 58]);
});

test('fitting is fast: under 50 ms per expiry on a liquid chain (about 5 ms alone; loose for busy CI runners)', () => {
  const T = 28 / 365, { byStrike } = fx.expiryQuotes({ S: 580, r, T, model: fx.smile(0.16, -0.35, 0.6), spreadPct: 0.02, step: 1, seed: 1 });
  const pts = core.cleanExpiry(byStrike, 580, T, r, 0.5).pts;
  core.fitSmile(pts, T);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) core.fitSmile(pts, T);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
});

// ---------- Mutation-testing gaps: each of these pins one rule that a
// deliberately broken copy of the code got past before. ----------

test('arbitrage-free smoothing is what removes the false Fork (cent-rounded far quotes, 110% vol, 91 days)', () => {
  const S = 24, T = 91 / 365, D = Math.exp(-r * T), F = S * Math.exp(r * T);
  const b = 0.5 * Math.sqrt(T / 0.25), w = k => 1.1 * 1.1 * T - b * 0.3 + b * (0.2 * k + Math.sqrt(k * k + 0.09));
  const byStrike = {};
  for (let K = 0.5; K <= 60; K += 0.5) {
    const c = core.black76Call(F, K, T, Math.sqrt(w(Math.log(K / F)) / T), D), p = c - D * (F - K);
    const q = th => { const h = Math.max(0.01, 0.04 * th), bid = Math.round(Math.max(0, th - h) * 100) / 100; return { b: bid, a: Math.max(bid + 0.01, Math.round((th + h) * 100) / 100) }; };
    byStrike[K.toFixed(2)] = { C: q(c), P: q(Math.max(0, p)) };
  }
  const plain = core.fitSmile(core.cleanExpiry(byStrike, S, T, r, 0.5).pts, T, 1);
  assert.ok(core.density(F, T, D, plain).arbitrage > 0.01, 'the GCV fit alone has negative probability');
  const shape = core.modelExpiry(byStrike, S, T, r, 0.5, 8);
  assert.ok(shape && shape.d.arbitrage <= 0.005, 'smoothed until arbitrage-free');
  assert.equal(shape.fork, null);
});

test('coverage gate: a shallow dip in a mostly extrapolated distribution is not a Fork', () => {
  const T = 90 / 365, { byStrike } = fx.expiryQuotes({ S: 24, r, T, model: fx.smile(1.1, 0.45, 0.6), spreadPct: 0.03, noise: 1, seed: 25 });
  const f = core.fitExpiry(byStrike, 24, T, r, 0.5, 8);
  const dg = core.forkDiagnostics(f.d, f.F, f.pts.map(p => p.K));
  assert.equal(dg.fork, null);
  assert.equal(dg.reason, 'quotes cover too little of the distribution');
});

test('expiry codes: YYYYMMDD schedule codes match YYMMDD chain keys without any date fields', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const codesOnly = schedule.map(e => ({ expiration: { code: e.expiration.code, dte: e.expiration.dte } }));
  const out = await runIndicator({ ticker: 'SPY', schedule: codesOnly, chain, ...fx.candles(580) });
  assert.equal(out.error, null);
  assert.equal(core.expiryKey(20261030), core.expiryKey('261030'));
  assert.equal(core.expiryKey('E7'), 'E7');
});

test("Lee's bound caps a wing that is steeper than 2 at the last quote", () => {
  const pts = [];
  for (let k = -0.3; k <= 0.3 + 1e-9; k += 0.02) pts.push({ k, w: 0.04 + 2.6 * Math.abs(k), sdw: 1e-4 });
  const smile = core.fitSmile(pts, 0.25);
  const slope = k => (smile(k + 0.001) - smile(k)) / 0.001;
  assert.ok(slope(0.29) > 2.2, 'the data itself is steeper than 2');
  assert.ok(Math.abs(slope(3) - 2) < 1e-6 && Math.abs(slope(-3.01) + 2) < 1e-6, `far wings ${slope(3)}, ${slope(-3.01)}`);
});

test('the risk-free rate setting reaches the model', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY(), c = fx.candles(580);
  const at4 = await runIndicator({ ticker: 'SPY', schedule, chain, ...c });
  const at0 = await runIndicator({ ticker: 'SPY', schedule, chain, inputs: { 'Risk-free rate (%)': 0 }, ...c });
  const m4 = at4.projections[3].series[49], m0 = at0.projections[3].series[49];
  assert.ok(Math.abs(m4 - m0) > 0.01, `median at 49 days: ${m4} vs ${m0}`);
});

test('Fork ticks cover the last three bars up to each forked expiry', async () => {
  const { schedule, chain } = fx.SCENARIOS.EARN();
  const out = await runIndicator({ ticker: 'EARN', schedule, chain, ...fx.candles(190) });
  const ticked = out.projections[7].series.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
  for (const bar of [8, 9, 10, 15, 16, 17]) assert.ok(ticked.includes(bar), `bar ${bar} in ${ticked}`);
});

test('implied vol above 500% is solved (short-dated binary-event options)', () => {
  for (const sig of [6, 8]) {
    const T = 7 / 365, F = 24, D = Math.exp(-0.04 * T);
    const price = core.black76Call(F, 30, T, sig, D);
    assert.ok(Math.abs(core.impliedVol(price, F, 30, T, D) / sig - 1) < 1e-4, `vol ${sig}`);
  }
});
