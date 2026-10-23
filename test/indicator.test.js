// End to end: run the built dist/implied.js in the mock TrendSpider runtime.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runIndicator } = require('./runtime.js');
const fx = require('./fixtures.js');

async function scenario(name, extra = {}) {
  const { schedule, chain } = fx.SCENARIOS[name]();
  const c = fx.candles(chain.underlyingSymbolQuote.lastPrice);
  return runIndicator({ ticker: name, schedule, chain, ...c, ...extra });
}

const median = out => out.projections[3];
const lastBar = s => { let i = s.length - 1; while (i > 0 && s[i] == null) i--; return i; };

test('built script is self-contained and placed on the price chart', () => {
  const src = fs.readFileSync(path.join(__dirname, '../dist/implied.js'), 'utf8');
  assert.ok(!/module\.exports|require\(/.test(src));
  assert.ok(src.includes('#TSBuild26'));
});

test('SPY: seven quantile lines, five bands, downside skew tag, no Fork', async () => {
  const out = await scenario('SPY');
  assert.equal(out.error, null);
  assert.equal(out.name, 'Implied');
  assert.equal(out.placement, 'price');
  assert.equal(out.projections.length, 7);
  assert.deepEqual(out.projections.map(p => p.hidden), [true, true, true, false, true, true, true]);
  assert.equal(median(out).style, 'dotted');
  assert.match(median(out).name, /^Implied median · Downside tail \d\.\d× upside$/);
  assert.deepEqual(out.fills.map(f => [f.a, f.b, f.opacity]),
    [[0, 1, 0.07], [5, 6, 0.07], [1, 2, 0.16], [4, 5, 0.16], [2, 4, 0.30]]);
  // starts at the last close, runs out to the last expiry (49 days), ordered
  const S = 580;
  out.projections.forEach(p => assert.ok(Math.abs(p.series[0] - S) < 1e-9));
  assert.equal(lastBar(median(out).series), 49);
  for (let i = 1; i <= 49; i++) for (let j = 1; j < 7; j++) assert.ok(out.projections[j].series[i] >= out.projections[j - 1].series[i]);
  // downside tail wider than upside at the far expiry
  const at = j => out.projections[j].series[49];
  assert.ok(at(3) - at(0) > at(6) - at(3));
});

test('earnings stock: Fork painted with a readable label at the post-earnings expiries', async () => {
  const out = await scenario('EARN');
  assert.equal(out.error, null);
  assert.equal(out.projections.length, 10);
  const [high, low, valley] = out.projections.slice(7);
  assert.match(high.name, /^Fork: \$\d+\.\d\d \/ \$\d+\.\d\d · least likely \$\d+\.\d\d$/);
  assert.equal(high.color, '#ffb347');
  assert.equal(valley.style, 'dashed');
  // ticks at expiry bars 10 and 17 (three bars each), nothing at the 3-day pre-earnings expiry
  const ticked = high.series.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
  assert.ok(ticked.includes(10) && ticked.includes(17), `ticked bars ${ticked}`);
  assert.ok(!ticked.includes(3));
  for (const i of ticked) assert.ok(low.series[i] < valley.series[i] && valley.series[i] < high.series[i]);
  const lo = low.series[10], hi = high.series[10];
  assert.ok(lo < 190 * 0.95 && hi > 190 * 1.05, `peaks ${lo}, ${hi}`);
});

test('Show Fork = 0 hides the Fork marks', async () => {
  const out = await scenario('EARN', { inputs: { 'Show Fork (1 = on, 0 = off)': 0 } });
  assert.equal(out.projections.length, 7);
});

test('high-IV stock: upside tail tag, fat right tail', async () => {
  const out = await scenario('MEME');
  assert.equal(out.error, null);
  assert.match(median(out).name, /Upside tail/);
  const i = lastBar(median(out).series), at = j => out.projections[j].series[i];
  assert.ok(at(6) - at(3) > 1.5 * (at(3) - at(0)));
});

test('illiquid ticker: clear message, nothing painted', async () => {
  const out = await scenario('ILLIQ');
  assert.equal(out.error, 'Not enough liquid strikes on ILLIQ to build a distribution.');
  assert.equal(out.projections.length, 0);
  assert.equal(out.fills.length, 0);
});

test('no options listed (crypto, futures): "No options data" message', async () => {
  const c = fx.candles(60000);
  for (const schedule of [[], null, { error: 'Symbol has no options' }]) {
    const out = await runIndicator({ ticker: 'BTCUSD', schedule, chain: {}, ...c });
    assert.match(out.error, /^No options data for BTCUSD\. Implied needs a ticker with listed options and an OPRA subscription\./);
    assert.equal(out.projections.length, 0);
  }
});

test('no OPRA entitlement: chain request error is shown with its text', async () => {
  const { schedule } = fx.SCENARIOS.SPY();
  const out = await runIndicator({ ticker: 'SPY', schedule, chain: { error: 'OPRA subscription required' }, ...fx.candles(580) });
  assert.match(out.error, /No options data for SPY.*\(OPRA subscription required\)$/);
});

test('non-Daily timeframe: Daily-only message before any request', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  for (const resolution of ['W', '60', '1h']) {
    const out = await runIndicator({ ticker: 'SPY', resolution, schedule, chain, ...fx.candles(580) });
    assert.equal(out.error, 'Implied runs on the Daily timeframe only.');
    assert.equal(out.requests.length, 0);
  }
  for (const resolution of ['D', '1D', 'day']) {
    const out = await runIndicator({ ticker: 'SPY', resolution, schedule, chain, ...fx.candles(580) });
    assert.equal(out.error, null, resolution);
  }
});

test('0-DTE expiries are dropped; settings limit expiries; missing expiries are skipped', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const zero = [{ expiration: { dte: 0, code: 'E0' } }, ...schedule];
  const two = await runIndicator({ ticker: 'SPY', schedule: zero, chain, inputs: { 'Expirations to project': 2 }, ...fx.candles(580) });
  assert.equal(two.error, null);
  assert.equal(lastBar(median(two).series), 14);
  assert.equal(two.requests[1][2], 3); // EXPIRIES + 1

  const partial = { ...chain, resultByExpiration: { ...chain.resultByExpiration } };
  delete partial.resultByExpiration.E14;
  partial.resultByExpiration.E28 = { 1: 'junk' };
  const out = await runIndicator({ ticker: 'SPY', schedule, chain: partial, ...fx.candles(580) });
  assert.equal(out.error, null);
  assert.equal(lastBar(median(out).series), 49);
});

test('spot price missing from the chain falls back to the last close', async () => {
  const { schedule, chain } = fx.SCENARIOS.SPY();
  const out = await runIndicator({ ticker: 'SPY', schedule, chain: { ...chain, underlyingSymbolQuote: {} }, ...fx.candles(580) });
  assert.equal(out.error, null);
});

test('declares exactly five settings with the spec defaults', async () => {
  const out = await scenario('SPY');
  assert.deepEqual(out.inputs.map(i => [i.label, i.def]), [
    ['Expirations to project', 4], ['Risk-free rate (%)', 4.0], ['Max bid-ask spread (fraction of mid)', 0.5],
    ['Min usable strikes per expiry', 8], ['Show Fork (1 = on, 0 = off)', 1]]);
});

test('performance: 8 expiries model and paint well under a second, one request of each kind', async () => {
  const { schedule, chain } = fx.ticker({
    S: 450, spreadPct: 0.02,
    expiries: [3, 7, 14, 21, 28, 45, 63, 91].map(dte => ({ dte, model: { kind: 'smile', atm: 0.25, skew: -0.4, curv: 1 } })),
  });
  const out = await runIndicator({ ticker: 'BIG', schedule, chain, inputs: { 'Expirations to project': 8 }, ...fx.candles(450) });
  assert.equal(out.error, null);
  assert.ok(out.ms < 1000, `${out.ms.toFixed(0)} ms`);
  assert.deepEqual(out.requests.map(r => r[0]), ['options_schedule', 'options_data_for_all_expirations']);
  assert.ok(out.projections.length <= 10 && out.fills.length === 5);
});
