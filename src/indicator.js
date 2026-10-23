// ============================================================================
// Implied — TrendSpider glue: settings, fetch, run the model, paint.
// Runs after src/core.js in the built script. Every TrendSpider call here is
// confirmed from TrendSpider's published code unless marked VERIFY (see
// docs/verify-in-trendspider.md).
// ============================================================================

describe_indicator('Implied', 'price'); // VERIFY: 2nd argument places it on the price chart

// ---------- Settings ----------
const EXPIRIES = input.number('Expirations to project', 4, { min: 1, max: 8 });
const RATE_PCT = input.number('Risk-free rate (%)', 4.0, { min: 0, max: 15 });
const MAX_SPREAD = input.number('Max bid-ask spread (fraction of mid)', 0.5, { min: 0.05, max: 2 });
const MIN_STRIKES = input.number('Min usable strikes per expiry', 8, { min: 5, max: 60 });
const SHOW_FORK = input.number('Show Fork (1 = on, 0 = off)', 1, { min: 0, max: 1 }); // VERIFY: input.boolean, if it exists

// VERIFY: does a projection bar mean a calendar day (TrendSpider's own Expected
// Move script indexes by dte) or a trading day? Switch to 'trading' if bars skip weekends.
const PROJECTION_DAYS = 'calendar';

const r = RATE_PCT / 100;
const COLORS = { band: '#5b8def', median: '#9aa0b4', fork: '#ffb347', valley: '#7d8296' };

assert(/^(d|1d|day|daily)$/i.test(String(current.resolution)), 'Implied runs on the Daily timeframe only.');

// ---------- Fetch ----------
const NO_DATA = 'No options data for ' + current.ticker + '. Implied needs a ticker with listed options and an OPRA subscription.';
const schedule = await request.options_schedule(current.ticker);
assert(schedule && !schedule.error && Array.isArray(schedule) && schedule.length > 0,
  NO_DATA + (schedule && schedule.error ? ' (' + schedule.error + ')' : ''));

const expiries = schedule
  .filter(e => e && e.expiration && Number(e.expiration.dte) >= 1)
  .sort((a, b) => a.expiration.dte - b.expiration.dte)
  .slice(0, EXPIRIES);
assert(expiries.length > 0, NO_DATA);

// VERIFY: the 2nd argument (TrendSpider's script passes 6) and whether it counts 0-DTE expiries.
// One extra covers a 0-DTE expiry at the front, which the filter above drops.
const chain = await request.options_data_for_all_expirations(current.ticker, EXPIRIES + 1, ['l', 'a', 'b'], 'all');
assert(chain && !chain.error && chain.resultByExpiration,
  NO_DATA + (chain && chain.error ? ' (' + chain.error + ')' : ''));

const lastClose = close[close.length - 1];
const quoted = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
const S = quoted > 0 ? quoted : lastClose;
assert(S > 0, NO_DATA);

// ---------- Model, per expiry ----------
const shapes = [];
for (const e of expiries) {
  const byStrike = chain.resultByExpiration[e.expiration.code];
  if (!byStrike) continue;
  const dte = Number(e.expiration.dte);
  let shape = null;
  try {
    shape = modelExpiry(byStrike, S, dte / 365, r, MAX_SPREAD, MIN_STRIKES);
  } catch (err) {
    shape = null; // a bad expiry is skipped; the others still draw
  }
  if (shape && shape.q.every(Number.isFinite)) shapes.push(Object.assign({ dte }, shape));
}
assert(shapes.length > 0, 'Not enough liquid strikes on ' + current.ticker + ' to build a distribution.');

// ---------- Project ----------
const maxDte = shapes[shapes.length - 1].dte;
const timeline = projectionTimeline(PROJECTION_DAYS, time[time.length - 1], maxDte);
const values = projectQuantiles(shapes, S, lastClose, timeline.times);
const lines = values.map(vals => {
  const s = series_of(null);
  vals.forEach((v, i) => { s[i] = v; });
  return s;
});

// ---------- Paint ----------
const far = shapes[shapes.length - 1];
const tag = skewTag(far.skew);
const P = QS.map((q, j) => paint_projection(lines[j], {
  color: j === 3 ? COLORS.median : COLORS.band,
  name: j === 3 ? 'Implied median' + (tag ? ' · ' + tag : '') : 'Implied ' + (q * 100).toFixed(1) + '%',
  style: j === 3 ? 'dotted' : 'solid',
  hidden: j !== 3,
}));
// Non-overlapping bands, so each shows its own opacity: tails, 80% range, core.
fill(P[0], P[1], COLORS.band, 0.07);
fill(P[5], P[6], COLORS.band, 0.07);
fill(P[1], P[2], COLORS.band, 0.10);
fill(P[4], P[5], COLORS.band, 0.10);
fill(P[2], P[4], COLORS.band, 0.16);

// Fork: short ticks on the last three bars up to each forked expiry. All
// expiries share one series per mark, so the paint count stays fixed at three.
// VERIFY: a text-label function for future bars; until then the label rides in
// the series name, which the legend and hover show.
const forks = shapes.filter(s => s.fork);
if (SHOW_FORK && forks.length) {
  const marks = { high: series_of(null), low: series_of(null), valley: series_of(null) };
  for (const s of forks) {
    const bar = timeline.barOfDte[s.dte];
    for (let i = Math.max(1, bar - 2); i <= bar; i++) {
      marks.high[i] = s.fork.high;
      marks.low[i] = s.fork.low;
      marks.valley[i] = s.fork.valley;
    }
  }
  paint_projection(marks.high, { color: COLORS.fork, name: forkLabel(forks[0].fork) });
  paint_projection(marks.low, { color: COLORS.fork, name: 'Fork: lower outcome' });
  paint_projection(marks.valley, { color: COLORS.valley, name: 'Fork: least likely zone', style: 'dashed' });
}
