// Regression tests for the second audit: each pins a fix (nearest/Fork expiry
// selection, the chain's own spot, log-space skew, outlier quotes, failed
// requests, timestamps, the summary panel) or closes a gap mutation testing
// found (settings wiring, exact panel values, 0-DTE, neighbour fallback).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const fx = require('./fixtures.js');
const { runIndicator } = require('./runtime.js');

const r = 0.04;
const overlayText = out => out.overlays.flatMap(o => o.definition.rows.flatMap(row => row.cells.map(c => c.text).filter(Boolean)));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a} (tol ${tol})`);
const markBars = out => out.projections[7].series.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0);
const lastVal = s => { let i = s.length - 1; while (i > 0 && s[i] == null) i--; return s[i]; };

// An earnings stock whose event lands before a 2-day expiry: only that
// expiry prices two clear outcomes; by 9 days the valley has filled in.
function earningsSoon(jump) {
  const days = [2, 9, 16, 23, 30, 37, 44, 58];
  return fx.ticker({ S: 100, spreadPct: 0.02, step: 1,
    expiries: days.map(dte => ({ dte, model: dte >= 2 ? fx.mix(100, dte, jump, 0.3) : fx.smile(0.3) })) });
}

test('the nearest expiry is always modelled, so a Fork right after earnings is drawn (B1)', async () => {
  const { schedule, chain } = earningsSoon(0.05);
  const near = core.modelExpiry(chain.resultByExpiration[core.expiryKey(schedule[0].expiration.code)], 100, 2 / 365, r, 0.5, 8);
  assert.ok(near && near.fork, 'test case: the 2-day expiry prices two outcomes');
  const out = await runIndicator({ ticker: 'ERN', schedule, chain, ...fx.candles(100) });
  assert.equal(out.error, null);
  assert.deepEqual(markBars(out), [1, 2], 'Fork ticks on the bars up to the 2-day expiry');
  assert.ok(overlayText(out).some(t => /^Fork: /.test(t)));
});

test('a stale or after-hours quoted price does not move the cloud (B2)', async () => {
  const base = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [7, 14, 28, 49].map(dte => ({ dte, model: fx.smile(0.3, -0.2, 0.5) })) });
  const c = fx.candles(100);
  const clean = await runIndicator({ ticker: 'A', schedule: base.schedule, chain: base.chain, ...c });
  const stale = JSON.parse(JSON.stringify(base.chain)); stale.underlyingSymbolQuote.lastPrice = 92;
  const off = await runIndicator({ ticker: 'A', schedule: base.schedule, chain: stale, ...c });
  const m1 = lastVal(clean.projections[3].series), m2 = lastVal(off.projections[3].series);
  assert.ok(Math.abs(m2 / m1 - 1) < 0.005, `median ${m1} vs ${m2} with an 8% stale quote`);
});

test('skew is measured in log price: a flat smile reads symmetric, put skew reads downside (B3)', () => {
  const tagAt = model => {
    const T = 60 / 365, { byStrike } = fx.expiryQuotes({ S: 100, r, T, model, spreadPct: 0.01, noise: 0, seed: 1 });
    return core.skewTag(core.modelExpiry(byStrike, 100, T, r, 0.5, 8).skew);
  };
  assert.equal(tagAt(fx.smile(0.3)), null, 'flat 30%');
  assert.equal(tagAt(fx.smile(0.5)), null, 'flat 50%');
  assert.match(tagAt(fx.smile(0.4, -0.25, 0.5)), /^Downside tail/);
  assert.match(tagAt(fx.smile(0.6, 0.4, 0.5)), /^Upside tail/);
});

test('one stale quote with a tight spread is dropped, not fitted into a false Fork (B4)', () => {
  const T = 14 / 365, { byStrike } = fx.expiryQuotes({ S: 190, r, T, model: fx.smile(0.3, -0.2, 0.8), spreadPct: 0.02, step: 1, seed: 1 });
  const stale = JSON.parse(JSON.stringify(byStrike));
  stale['175.00'].P = { b: +(stale['175.00'].P.b * 0.7).toFixed(2), a: +(stale['175.00'].P.a * 0.7).toFixed(2) };
  const f = core.fitExpiry(stale, 190, T, r, 0.5, 8), clean = core.modelExpiry(byStrike, 190, T, r, 0.5, 8);
  assert.ok(f.ok && f.dropped >= 1, 'the stale quote is dropped');
  const shape = core.modelExpiry(stale, 190, T, r, 0.5, 8);
  assert.equal(shape.fork, null);
  shape.q.forEach((q, j) => assert.ok(Math.abs(q / clean.q[j] - 1) < 0.005, `quantile ${j}`));
});

test('a rejected request shows the no-data message instead of crashing (B6)', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const out = await runIndicator({ ticker: 'X', schedule: () => Promise.reject(new Error('timeout')), chain, ...fx.candles(580) });
  assert.match(out.error, /^No options data for X\..*\(timeout\)$/);
  assert.equal(out.projections.length, 10);
  const out2 = await runIndicator({ ticker: 'X', schedule, chain: () => Promise.reject(new Error('asset type')), ...fx.candles(580) });
  assert.match(out2.error, /\(asset type\)$/);
});

test('schedule timestamps in milliseconds place expiries like seconds do (B7)', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const ms = schedule.map(e => ({ expiration: Object.assign({}, e.expiration, { timestamp: e.expiration.timestamp * 1000 }) }));
  const a = await runIndicator({ ticker: 'SPY', schedule, chain, ...fx.candles(580) });
  const b = await runIndicator({ ticker: 'SPY', schedule: ms, chain, ...fx.candles(580) });
  assert.equal(b.error, null);
  assert.deepEqual(b.projections[3].series, a.projections[3].series);
});

test('summary panel: exact median and 95% range, tail weights, day count from the last candle (B8, G5)', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const c = fx.candles(580);
  const sel = core.selectExpiries({ schedule, resultByExpiration: chain.resultByExpiration, spot: 580, lastTime: c.time[c.time.length - 1], rate: r, maxSpread: 0.5, minStrikes: 8, count: 4, maxBars: 100, mode: 'calendar' });
  const s = sel.shapes[sel.shapes.length - 1], k = 580 / sel.spot;
  const out = await runIndicator({ ticker: 'SPY', schedule, chain, ...c });
  const text = overlayText(out);
  assert.ok(text.includes('IMPLIED · ' + s.day + '-DAY DISTRIBUTION'), text[0]);
  assert.ok(text.includes('Median ' + core.formatPrice(s.q[3] * k) + ' · 95% range ' + core.formatPrice(s.q[0] * k) + ' – ' + core.formatPrice(s.q[6] * k)));
  const pct = p => (p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
  assert.ok(text.includes('Below ' + core.formatPrice(0.9 * s.F * k) + ': ' + pct(s.tails.below) + ' · above ' + core.formatPrice(1.1 * s.F * k) + ': ' + pct(s.tails.above)), text.join(' | '));
  // the painted median at the far expiry equals the panel's median
  assert.ok(Math.abs(lastVal(out.projections[3].series) - s.q[3] * k) < 1e-6);
});

test('the panel says when the tails are extrapolated beyond the quoted strikes (B5)', async () => {
  const wide = fx.ticker({ S: 100, spreadPct: 0.02, range: 0.12, expiries: [7, 14, 28, 49].map(dte => ({ dte, model: fx.smile(0.35) })) });
  const out = await runIndicator({ ticker: 'W', schedule: wide.schedule, chain: wide.chain, ...fx.candles(100) });
  assert.ok(overlayText(out).some(t => /^Quotes cover \$.* the tails beyond are extrapolated\.$/.test(t)));
  const spy = await runIndicator({ ticker: 'SPY', ...fx.SCENARIOS.SPY(), ...fx.candles(580) });
  assert.ok(!overlayText(spy).some(t => /extrapolated/.test(t)), 'not shown when the quotes cover the 95% range');
});

test('every setting reaches the model: spread limit, minimum strikes, rate magnitude (G9)', async () => {
  const run = inputs => runIndicator({ ticker: 'SPY', ...fx.SCENARIOS.SPY(), ...fx.candles(580), inputs });
  const base = await run({});
  assert.match((await run({ 'Min usable strikes per expiry': 60 })).error, /^Not enough liquid strikes/);
  assert.match((await run({ 'Max bid-ask spread (fraction of mid)': 0.03 })).error, /^Not enough liquid strikes/); // SPY's quotes are ~4% wide
  // The forward comes from put-call parity, so the rate mostly enters through
  // discounting: 4% -> 14% moves the 49-day median by about 0.25%. A rate read
  // ten times too small would move it about 0.025%; ten times too big, 2.5%.
  const hi = await run({ 'Risk-free rate (%)': 14 });
  const shift = lastVal(hi.projections[3].series) / lastVal(base.projections[3].series) - 1;
  assert.ok(Math.abs(shift) > 0.001 && Math.abs(shift) < 0.01, `median shift ${shift}`);
});

test('a 0-DTE expiry with full quotes is still dropped; a junk expiry is replaced by its neighbour (G9)', async () => {
  const t = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [0, 6, 7, 14, 28, 49].map(dte => ({ dte, model: fx.smile(0.3) })) });
  const zeroKey = core.expiryKey(t.schedule[0].expiration.code);
  assert.ok(Object.keys(t.chain.resultByExpiration[zeroKey]).length > 20, 'test case: the 0-DTE expiry has quotes');
  const sel = o => core.selectExpiries(Object.assign({ schedule: t.schedule, resultByExpiration: t.chain.resultByExpiration, spot: 100, lastTime: fx.AS_OF / 1000, rate: r, maxSpread: 0.5, minStrikes: 8, count: 4, maxBars: 100, mode: 'calendar' }, o));
  assert.ok(!sel({}).shapes.some(s => s.dte === 0));
  // Break the 7-day expiry: the 6-day neighbour takes its place.
  const junk = JSON.parse(JSON.stringify(t.chain.resultByExpiration));
  junk[core.expiryKey(t.schedule[2].expiration.code)] = { '100.00': { C: { b: 0, a: 0 } } };
  const days = sel({ resultByExpiration: junk }).shapes.map(s => s.day);
  assert.ok(days.includes(6) && !days.includes(7), days.join(','));
});

test('quantile levels are the spec\'s seven', () => {
  assert.deepEqual(core.QS, [0.025, 0.10, 0.25, 0.50, 0.75, 0.90, 0.975]);
});

test('trading-day timeline skips weekends and NYSE holidays (G3)', () => {
  const wed = Date.UTC(2026, 10, 25) / 1000; // Wed 25 Nov 2026; Thanksgiving is the 26th
  const { barOfDay } = core.projectionTimeline('trading', wed, 6);
  assert.equal(barOfDay[1], 0, 'Thanksgiving is not a bar');
  assert.equal(barOfDay[2], 1, 'Friday is the first bar');
  assert.equal(barOfDay[5], 2, 'Monday is the second');
});

// ---------- Small exact tests for lines mutation testing showed unguarded ----------

test('label thresholds: skew tag at 1.15 / 0.87, prices with cents below $1,000', () => {
  assert.equal(core.skewTag(1.14), null); assert.match(core.skewTag(1.16), /^Upside tail 1\.2× downside$/);
  assert.equal(core.skewTag(0.88), null); assert.match(core.skewTag(0.86), /^Downside tail 1\.2× upside$/);
  assert.equal(core.formatPrice(999.994), '$999.99'); assert.equal(core.formatPrice(1000), '$1000'); assert.equal(core.formatPrice(5812.4), '$5812');
});

test('a quote with ask equal to bid is not a market', () => {
  assert.equal(core.quoteMid({ b: 1.2, a: 1.2 }, 0.5), null);
  assert.ok(core.quoteMid({ b: 1.2, a: 1.21 }, 0.5));
});

test('the parity forward is a median over five strikes: one bad pair near the money does not move it', () => {
  const S = 100, T = 30 / 365, { byStrike, F } = fx.expiryQuotes({ S, r, T, model: fx.smile(0.3), spreadPct: 0.01, noise: 0, seed: 1, step: 1 });
  const bad = JSON.parse(JSON.stringify(byStrike));
  bad['100.00'].C = { b: bad['100.00'].C.b + 1.5, a: bad['100.00'].C.a + 1.5 }; // a stale call at the money
  near(core.cleanExpiry(bad, S, T, r, 0.5).F / F, 1, 0.001);
});

test('an expiry at bar 99 is drawn, one at bar 100 is not', () => {
  const t = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [7, 99, 100].map(dte => ({ dte, model: fx.smile(0.3) })) });
  const days = core.selectExpiries({ schedule: t.schedule, resultByExpiration: t.chain.resultByExpiration, spot: 100, lastTime: fx.AS_OF / 1000, rate: r, maxSpread: 0.5, minStrikes: 8, count: 8, maxBars: 100, mode: 'calendar' })
    .candidates.map(c => c.day);
  assert.ok(days.includes(99) && !days.includes(100), days.join(','));
});

test('projected bands stay ordered even when expiries disagree, and the forward drifts in from the start', () => {
  const T1 = 10 / 365, T2 = 40 / 365, q = (F, w) => [-2, -1.3, -0.7, 0, 0.7, 1.3, 2].map(z => F * Math.exp(z * w));
  // the second expiry's 10% sits above the first's 25% in u-space: a naive
  // interpolation would cross lines in between
  const shapes = [{ F: 100, T: T1, q: q(100, 0.05) }, { F: 102, T: T2, q: q(102, 0.02) }];
  const times = []; for (let d = 0; d <= 40; d++) times.push(d / 365);
  const lines = core.projectQuantiles(shapes, 100, 100, times);
  for (let i = 1; i <= 40; i++) for (let j = 1; j < 7; j++) assert.ok(lines[j][i] >= lines[j - 1][i], `bar ${i} band ${j}`);
  // before the first expiry the median drifts from the anchor towards F (here F = S, so it stays near 100)
  const one = core.projectQuantiles([{ F: 105, T: T1, q: q(105, 0.05) }], 100, 100, times.slice(0, 11));
  near(one[3][5] / 100, Math.exp(Math.log(1.05) * 0.5), 0.002, 'median at half way grows with ln(F/S) * t/T');
});

test('candle times in milliseconds give the same cloud; no price history gives a clear message', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY(), c = fx.candles(580);
  const a = await runIndicator({ ticker: 'SPY', schedule, chain, ...c });
  const b = await runIndicator({ ticker: 'SPY', schedule, chain, close: c.close, time: c.time.map(t => t * 1000) });
  assert.deepEqual(b.projections[3].series, a.projections[3].series);
  const none = await runIndicator({ ticker: 'SPY', schedule, chain, close: c.close.map((v, i) => (i === c.close.length - 1 ? NaN : v)), time: c.time });
  assert.equal(none.error, 'Implied needs price history on the chart.');
});

test('settings ranges and colours match the spec', async () => {
  const out = await runIndicator({ ticker: 'SPY', ...fx.SCENARIOS.SPY(), ...fx.candles(580) });
  assert.deepEqual(out.inputs.filter(i => i.kind === 'number').map(i => [i.opts.min, i.opts.max]), [[1, 8], [0, 15], [0.05, 2], [5, 60]]);
  const med = out.projections[3], up = out.projections[7], va = out.projections[9];
  assert.deepEqual([med.color, med.style, up.color, va.color, va.style], ['#9aa0b4', 'dotted', '#ffb347', '#7d8296', 'dotted']);
  assert.ok(out.fills.every(f => f.color === '#5b8def'));
});

// ---------- Second mutation pass: each rule tested on its own ----------

const pick = (t, o) => core.selectExpiries(Object.assign({ schedule: t.schedule, resultByExpiration: t.chain.resultByExpiration, spot: 100, lastTime: fx.AS_OF / 1000, rate: r, maxSpread: 0.5, minStrikes: 8, count: 4, maxBars: 100, mode: 'calendar' }, o));

test('the spread limit keeps a quote exactly at the limit', () => {
  assert.ok(core.quoteMid({ b: 1, a: 3 }, 1), 'spread = mid: allowed at limit 1');
  assert.equal(core.quoteMid({ b: 1, a: 3.01 }, 1), null);
});

test('a density whose probability does not add up is rejected', () => {
  assert.equal(core.densityProblem({ mass: 1.02, arbitrage: 0 }), null);
  assert.equal(core.densityProblem({ mass: 0.9, arbitrage: 0 }), 'probability does not add up');
  assert.equal(core.densityProblem({ mass: 1, arbitrage: 0.01 }), 'quotes imply negative probability');
  assert.equal(core.densityProblem(null), 'no density');
});

test('grid-level noise is smoothed before peaks are counted: no Fork from a jagged valley', () => {
  const F = 100, d = bumpsWithNoise(F);
  assert.equal(core.forkDiagnostics(d, F).fork, null, 'smoothed valley 0.8 of the smaller peak; ±10% grid noise would push the raw valley to 0.65');
});
function bumpsWithNoise(F) {
  const Ks = [], pdf = [];
  for (let i = 0; i < 2001; i++) {
    const K = F * (0.7 + 0.6 * i / 2000), z1 = (K / F - 0.96) / 0.03, z2 = (K / F - 1.04) / 0.03;
    Ks.push(K); pdf.push((Math.exp(-z1 * z1 / 2) + Math.exp(-z2 * z2 / 2)) * (1 + (i % 2 ? 0.10 : -0.10)));
  }
  return { Ks, pdf, cdf: Ks.map(() => 0) };
}

test('a thin expiry at a horizon is replaced by its neighbour', () => {
  const t = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [7, 14, 15, 30, 60].map(dte => ({ dte, model: fx.smile(0.3) })) });
  const junk = JSON.parse(JSON.stringify(t.chain.resultByExpiration));
  junk[core.expiryKey(t.schedule[1].expiration.code)] = { '100.00': { C: { b: 0, a: 0 } } }; // break 14 days
  const days = pick(t, { resultByExpiration: junk }).shapes.map(s => s.day);
  assert.ok(days.includes(15) && !days.includes(14), days.join(','));
});

test('the nearest expiry is drawn even when no horizon would pick it', () => {
  // horizons 7/14/30/60 would pick 9, 16, 30, 60; the 3-day expiry is drawn too
  const t = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [3, 9, 16, 30, 60].map(dte => ({ dte, model: fx.smile(0.3) })) });
  assert.equal(pick(t).shapes[0].day, 3);
});

test('a Fork at an expiry no horizon picks is still drawn (Fork scan)', () => {
  // nearest = 3 days (before earnings, models fine), the event lands before
  // the 5-day expiry, and the 7-day horizon picks 8 days (closer to 7 in log-days).
  const t = fx.ticker({ S: 200, spreadPct: 0.02, step: 1,
    expiries: [3, 5, 8, 16, 30, 60].map(dte => ({ dte, model: dte >= 5 ? fx.mix(200, dte, 0.07, 0.25) : fx.smile(0.25) })) });
  const five = core.modelExpiry(t.chain.resultByExpiration[core.expiryKey(t.schedule[1].expiration.code)], 200, 5 / 365, r, 0.5, 8);
  assert.ok(five && five.fork, 'test case: 5 days prices two outcomes');
  const shapes = pick(t, { spot: 200 }).shapes;
  assert.equal(shapes[0].day, 3, 'the nearest expiry is the 3-day one');
  assert.ok(shapes.some(s => s.day === 5 && s.fork), shapes.map(s => s.day + (s.fork ? 'F' : '')).join(','));
});

test('the quoted spot still picks the near-the-money strikes when the chart history is far from it', async () => {
  // e.g. a split or a long-closed chart: candles 40% away from the chain
  const out = await runIndicator({ ticker: 'SPY', ...fx.SCENARIOS.SPY(), ...fx.candles(580 * 1.4) }); // beyond the 25% forward-gap guard
  assert.equal(out.error, null);
});

test('no projection is longer than the 100 values paint_projection accepts', async () => {
  const out = await runIndicator({ ticker: 'SPY', ...fx.SCENARIOS.SPY_DAILY(), ...fx.candles(580), inputs: { 'Expirations to project': 8 } });
  assert.ok(out.projections.every(p => p.length <= 100), out.projections.map(p => p.length).join(','));
});

test('panel: its chart spans the 1st to 99th percentile; the skew tag describes the farthest expiry', async () => {
  const { schedule, chain } = fx.SCENARIOS.EARN(), c = fx.candles(190);
  const out = await runIndicator({ ticker: 'EARN', schedule, chain, ...c });
  const sel = core.selectExpiries({ schedule, resultByExpiration: chain.resultByExpiration, spot: 190, lastTime: c.time[c.time.length - 1], rate: r, maxSpread: 0.5, minStrikes: 8, count: 4, maxBars: 100, mode: 'calendar' });
  const focus = sel.shapes.find(s => s.fork), far = sel.shapes[sel.shapes.length - 1], k = 190 / sel.spot;
  assert.notEqual(focus, far, 'test case: the panel focuses on a Fork expiry that is not the farthest');
  const chart = out.overlays[0].definition.rows.find(row => row.cells[0].chart).cells[0].chart.data.labels;
  near(Number(chart[0]), core.quantile(focus.d, 0.01) * k, 1, 'first label');
  near(Number(chart[chart.length - 1]), core.quantile(focus.d, 0.99) * k, 1, 'last label');
});

test('the skew tag describes the farthest expiry, not the Fork expiry the panel focuses on', async () => {
  const t = fx.ticker({ S: 100, spreadPct: 0.02, step: 1, expiries: [{ dte: 3, model: fx.smile(0.25) }, { dte: 10, model: fx.mix(100, 10, 0.08, 0.22) }, { dte: 38, model: fx.smile(0.3, -0.45, 0.6) }] });
  const c = fx.candles(100), out = await runIndicator({ ticker: 'T', schedule: t.schedule, chain: t.chain, ...c });
  const sel = core.selectExpiries({ schedule: t.schedule, resultByExpiration: t.chain.resultByExpiration, spot: 100, lastTime: c.time[c.time.length - 1], rate: r, maxSpread: 0.5, minStrikes: 8, count: 4, maxBars: 100, mode: 'calendar' });
  const focus = sel.shapes.find(s => s.fork), far = sel.shapes[sel.shapes.length - 1];
  assert.ok(focus && core.skewTag(far.skew) !== core.skewTag(focus.skew), 'test case: the two expiries read differently');
  assert.ok(overlayText(out).includes(core.skewTag(far.skew) + ' (to ' + far.day + ' days)'), overlayText(out).join(' | '));
});

test('0-DTE expiries are never candidates, even when the last candle is the day before', () => {
  const t = fx.ticker({ S: 100, spreadPct: 0.02, expiries: [1, 7, 14].map(dte => ({ dte, model: fx.smile(0.3) })) });
  const sched = JSON.parse(JSON.stringify(t.schedule)); sched[0].expiration.dte = 0; // expires today; the chart's last bar was yesterday
  assert.ok(!pick(t, { schedule: sched }).candidates.some(c => Number(c.x.dte) === 0));
});
