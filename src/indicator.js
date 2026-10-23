// ============================================================================
// Implied — TrendSpider glue: settings, fetch, run the model, paint.
// Runs after src/core.js in the built script. Every call below follows
// TrendSpider's scripting reference (platform-docs.trendspider.com/scripting).
// Two platform rules shape the paint section:
//   - every paint(), fill() and paint_overlay() call runs on every execution,
//   - line names never change (the platform keys saved lines by name),
// so anything that varies (Fork prices, skew wording) goes in the overlay.
// ============================================================================

describe_indicator('Implied', 'price', { shortName: 'Implied' });

// ---------- Settings ----------
const EXPIRIES = input.number('Expirations to project', 4, { min: 1, max: 8 });
const RATE_PCT = input.number('Risk-free rate (%)', 4.0, { min: 0, max: 15 });
const MAX_SPREAD = input.number('Max bid-ask spread (fraction of mid)', 0.5, { min: 0.05, max: 2 });
const MIN_STRIKES = input.number('Min usable strikes per expiry', 8, { min: 5, max: 60 });
const SHOW_FORK = input.boolean('Show Fork', true);

// The second argument of options_data_for_all_expirations is the number of
// strikes on each side of the price (max 40); the call returns every expiry.
const STRIKES_EACH_SIDE = 40;
// paint_projection paints at most 100 values, starting at the last candle.
const MAX_PROJECTION = 100;
// Projection bars are indexed by calendar days to expiry, as in TrendSpider's
// own Expected Move from Options script. 'trading' indexes weekdays only.
const PROJECTION_DAYS = 'calendar';

const RATE = RATE_PCT / 100;
const COLORS = { band: '#5b8def', median: '#9aa0b4', fork: '#ffb347', valley: '#7d8296' };

assert(String(current.resolution).toUpperCase() === 'D', 'Implied runs on the Daily timeframe only.');

// ---------- Fetch ----------
const NO_DATA = 'No options data for ' + current.ticker + '. Implied needs a ticker with listed options and an OPRA subscription.';
const [schedule, chain] = await Promise.all([
  request.options_schedule(current.ticker),
  request.options_data_for_all_expirations(current.ticker, STRIKES_EACH_SIDE, ['b', 'a', 'l'], 'all'),
]);
assert(schedule && !schedule.error && Array.isArray(schedule) && schedule.length > 0,
  NO_DATA + (schedule && schedule.error ? ' (' + schedule.error + ')' : ''));
assert(chain && !chain.error && chain.resultByExpiration,
  NO_DATA + (chain && chain.error ? ' (' + chain.error + ')' : ''));

const expiries = schedule
  .filter(e => e && e.expiration && Number(e.expiration.dte) >= 1)
  .sort((a, b) => a.expiration.dte - b.expiration.dte)
  .slice(0, EXPIRIES);
assert(expiries.length > 0, NO_DATA);

const lastClose = close[close.length - 1];
const quotedSpot = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
const SPOT = quotedSpot > 0 ? quotedSpot : lastClose;
assert(SPOT > 0, NO_DATA);

// ---------- Model, per expiry ----------
const expiryShapes = [];
for (const e of expiries) {
  const byStrike = chain.resultByExpiration[e.expiration.code];
  if (!byStrike) continue;
  const dte = Number(e.expiration.dte);
  let shape = null;
  try {
    shape = modelExpiry(byStrike, SPOT, dte / 365, RATE, MAX_SPREAD, MIN_STRIKES);
  } catch (err) {
    shape = null; // a bad expiry is skipped; the others still draw
  }
  if (shape && shape.q.every(Number.isFinite)) expiryShapes.push(Object.assign({ dte, byStrike }, shape));
}
assert(expiryShapes.length > 0, 'Not enough liquid strikes on ' + current.ticker + ' to build a distribution.');

// ---------- Project ----------
const lastDte = expiryShapes[expiryShapes.length - 1].dte;
const projTimeline = projectionTimeline(PROJECTION_DAYS, time[time.length - 1], lastDte);
const bandValues = projectQuantiles(expiryShapes, SPOT, lastClose, projTimeline.times)
  .map(vals => vals.slice(0, MAX_PROJECTION));

// ---------- Paint: bands ----------
const BAND_NAMES = ['Implied 2.5%', 'Implied 10%', 'Implied 25%', 'Implied median', 'Implied 75%', 'Implied 90%', 'Implied 97.5%'];
const bands = bandValues.map((vals, j) => paint_projection(vals, {
  name: BAND_NAMES[j],
  color: j === 3 ? COLORS.median : COLORS.band,
  style: j === 3 ? 'dotted' : 'line',
  thickness: j === 3 ? 2 : 1,
  hidden: j !== 3,
}));
// Non-overlapping bands (tails, 80% range, core). The opacities are what the
// spec's stacked 7% / 10% / 16% fills compound to, without double-drawing.
fill(bands[0], bands[1], COLORS.band, 0.07, 'Implied lower tail');
fill(bands[5], bands[6], COLORS.band, 0.07, 'Implied upper tail');
fill(bands[1], bands[2], COLORS.band, 0.16, 'Implied lower 80%');
fill(bands[4], bands[5], COLORS.band, 0.16, 'Implied upper 80%');
fill(bands[2], bands[4], COLORS.band, 0.30, 'Implied core 50%');

// ---------- Paint: the Fork ----------
// Short ticks on the last three bars up to each forked expiry: one series per
// mark, always painted (all null when there is no Fork or it is switched off).
const forkShapes = expiryShapes.filter(s => s.fork);
const markLength = Math.min(MAX_PROJECTION, projTimeline.times.length);
const forkMarks = { high: Array(markLength).fill(null), low: Array(markLength).fill(null), valley: Array(markLength).fill(null) };
if (SHOW_FORK) {
  for (const s of forkShapes) {
    const bar = projTimeline.barOfDte[s.dte];
    for (let i = Math.max(1, bar - 2); i <= bar && i < markLength; i++) {
      forkMarks.high[i] = s.fork.high;
      forkMarks.low[i] = s.fork.low;
      forkMarks.valley[i] = s.fork.valley;
    }
  }
}
paint_projection(forkMarks.high, { name: 'Fork upper outcome', color: COLORS.fork, thickness: 3 });
paint_projection(forkMarks.low, { name: 'Fork lower outcome', color: COLORS.fork, thickness: 3 });
paint_projection(forkMarks.valley, { name: 'Fork least likely', color: COLORS.valley, style: 'dotted', thickness: 2 });

// ---------- Paint: summary overlay ----------
// The one place for text that changes: the Fork prices, the skew sentence and
// a small chart of the distribution at the expiry that matters most (the first
// Fork if there is one, otherwise the farthest expiry).
const focus = (SHOW_FORK && forkShapes[0]) || expiryShapes[expiryShapes.length - 1];
paint_overlay('Implied summary', { position: 'top_left' }, summaryOverlay(focus, expiryShapes, lastDte > MAX_PROJECTION - 1));

function summaryOverlay(s, all, clipped) {
  const text = (t, extra) => Object.assign({ text: t, color: 'var(--text-color)', fontSize: '12px', padding: '2px 10px', textAlign: 'left' }, extra || {});
  const d = densityFor(s);
  const tag = skewTag(all[all.length - 1].skew);
  const rows = [
    { cells: [text('IMPLIED · ' + s.dte + '-DAY DISTRIBUTION', { fontWeight: '600', color: 'var(--text-accent-color)', paddingTop: '8px' })] },
  ];
  if (d) {
    rows.push({ cells: [{ padding: '0 6px', chart: {
      width: '240px', height: '96px', type: 'line',
      data: { labels: d.labels, datasets: [{ data: d.values, fill: true, borderColor: COLORS.band, backgroundColor: 'rgba(91,141,239,0.25)', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 5, font: { size: 10 } }, grid: { display: false } }, y: { display: false } } },
    } }] });
  }
  rows.push({ cells: [text('Median ' + formatPrice(s.q[3]) + ' · 95% range ' + formatPrice(s.q[0]) + ' – ' + formatPrice(s.q[6]))] });
  rows.push({ cells: [text(tag ? tag + ' (to ' + all[all.length - 1].dte + ' days)' : 'Close to symmetric')] });
  if (SHOW_FORK && s.fork) rows.push({ cells: [text(forkLabel(s.fork), { color: COLORS.fork, fontWeight: '600' })] });
  if (clipped) rows.push({ cells: [text('Cloud drawn to ' + (MAX_PROJECTION - 1) + ' days (platform limit)', { fontSize: '11px', opacity: 0.7 })] });
  rows.push({ cells: [text('Risk-neutral: the price of each outcome, not a forecast.', { fontSize: '10px', opacity: 0.6, paddingBottom: '8px' })] });
  return { background: 'var(--background-color)', border: 'solid 1px var(--border-color)', borderRadius: '8px', rows };
}

// Density at one expiry, resampled to 40 points between its 1st and 99th
// percentile for the overlay chart.
function densityFor(s) {
  const clean = cleanExpiry(s.byStrike, SPOT, s.T, RATE, MAX_SPREAD);
  const smile = fitSmile(clean.pts, s.T);
  const d = smile && density(clean.F, s.T, clean.D, smile);
  if (!d) return null;
  const lo = quantile(d, 0.01), hi = quantile(d, 0.99), labels = [], values = [];
  for (let i = 0; i < 40; i++) {
    const K = lo + (hi - lo) * i / 39;
    let j = 1;
    while (j < d.Ks.length - 1 && d.Ks[j] < K) j++;
    const t = (K - d.Ks[j - 1]) / (d.Ks[j] - d.Ks[j - 1]);
    labels.push(K < 100 ? K.toFixed(1) : Math.round(K).toString());
    values.push(+(d.pdf[j - 1] + t * (d.pdf[j] - d.pdf[j - 1])).toPrecision(4));
  }
  return { labels, values };
}
