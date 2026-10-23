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
  request.options_data_for_all_expirations(current.ticker, STRIKES_EACH_SIDE, ['b', 'a'], 'all'),
]);
assert(schedule && !schedule.error && Array.isArray(schedule) && schedule.length > 0,
  NO_DATA + (schedule && schedule.error ? ' (' + schedule.error + ')' : ''));
assert(chain && !chain.error && chain.resultByExpiration,
  NO_DATA + (chain && chain.error ? ' (' + chain.error + ')' : ''));

const lastClose = close[close.length - 1];
const quotedSpot = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
const SPOT = quotedSpot > 0 ? quotedSpot : lastClose;
assert(SPOT > 0 && lastClose > 0, NO_DATA);
// The cloud starts at the last close; every price shown (bands, Fork ticks,
// summary panel) is on that same footing, scaled by lastClose / SPOT.
const SCALE = lastClose / SPOT;
const lastTimeRaw = Number(time[time.length - 1]);
const lastTime = lastTimeRaw > 1e12 ? lastTimeRaw / 1000 : lastTimeRaw; // seconds

// ---------- Match expirations to the chain ----------
// The schedule's codes (YYYYMMDD in TrendSpider's docs) and the chain's keys
// (YYMMDD) are compared on a normalized YYMMDD key; the expiration's
// year/month/day is a second way to build that key.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const chainByKey = {};
for (const key of Object.keys(chain.resultByExpiration)) chainByKey[expiryKey(key)] = chain.resultByExpiration[key];
function chainFor(x) {
  const byCode = chainByKey[expiryKey(x.code)];
  if (byCode) return byCode;
  const m = MONTHS[String(x.month || '').slice(0, 3).toLowerCase()] || Number(x.month);
  if (!(x.year > 0 && m > 0 && x.day > 0)) return null;
  const pad = v => String(v).padStart(2, '0');
  return chainByKey[pad(x.year % 100) + pad(m) + pad(x.day)] || null;
}
// Calendar days from the last candle to an expiry: from its timestamp when
// given, so weekends and holidays between the last bar and today don't shift
// the cloud; otherwise its days-to-expiry.
function daysOut(x) {
  const ts = Number(x.timestamp);
  if (ts > 0 && lastTime > 0) {
    const d = Math.round((ts - lastTime) / 86400);
    if (d >= 1) return d;
  }
  return Number(x.dte);
}

const horizon = projectionTimeline(PROJECTION_DAYS, lastTime, 400);
const candidates = schedule
  .filter(e => e && e.expiration && Number(e.expiration.dte) >= 1)
  .map(e => ({ x: e.expiration, byStrike: chainFor(e.expiration), day: daysOut(e.expiration) }))
  .filter(c => c.byStrike && c.day >= 1 && horizon.barOfDay[c.day] < MAX_PROJECTION)
  .sort((a, b) => a.day - b.day);
assert(candidates.length > 0, 'Options data for ' + current.ticker + ' did not include any expiration in the next ' + (MAX_PROJECTION - 1) + ' days.');

// ---------- Model: pick expiries by horizon ----------
// For each target horizon, model the nearest expiry; if it is too thin, try
// its neighbours. A ticker with an expiry every weekday still gets a cloud
// that reaches weeks out.
const modelled = new Map();
function shapeOf(i) {
  if (!modelled.has(i)) {
    const c = candidates[i], dte = Number(c.x.dte);
    let shape = null;
    try {
      shape = modelExpiry(c.byStrike, SPOT, dte / 365, RATE, MAX_SPREAD, MIN_STRIKES);
    } catch (err) {
      shape = null; // a bad expiry is skipped; another one takes its place
    }
    modelled.set(i, shape && shape.q.every(Number.isFinite) ? Object.assign({ dte, day: c.day }, shape) : null);
  }
  return modelled.get(i);
}
const chosen = new Set();
for (const order of expiryPlan(candidates.map(c => c.day), EXPIRIES)) {
  for (const i of order.slice(0, 4)) {
    if (chosen.has(i)) continue;
    if (shapeOf(i)) { chosen.add(i); break; }
  }
}
const expiryShapes = [...chosen].map(i => modelled.get(i)).sort((a, b) => a.day - b.day);
assert(expiryShapes.length > 0, 'Not enough liquid strikes on ' + current.ticker + ' to build a distribution.');

// ---------- Project ----------
// The model's clock (T) runs from now; the chart's runs from the last candle,
// so each expiry is placed at its own day offset.
const lastDay = expiryShapes[expiryShapes.length - 1].day;
const projTimeline = projectionTimeline(PROJECTION_DAYS, lastTime, lastDay);
const placed = expiryShapes.map(s => ({ F: s.F, q: s.q, T: s.day / 365 }));
const bandValues = projectQuantiles(placed, SPOT, lastClose, projTimeline.times)
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
    const bar = projTimeline.barOfDay[s.day];
    for (let i = Math.max(1, bar - 2); i <= bar && i < markLength; i++) {
      forkMarks.high[i] = s.fork.high * SCALE;
      forkMarks.low[i] = s.fork.low * SCALE;
      forkMarks.valley[i] = s.fork.valley * SCALE;
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
paint_overlay('Implied summary', { position: 'top_left' }, summaryOverlay(focus, expiryShapes));

function summaryOverlay(s, all) {
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
  rows.push({ cells: [text('Median ' + formatPrice(s.q[3] * SCALE) + ' · 95% range ' + formatPrice(s.q[0] * SCALE) + ' – ' + formatPrice(s.q[6] * SCALE))] });
  rows.push({ cells: [text(tag ? tag + ' (to ' + all[all.length - 1].dte + ' days)' : 'Close to symmetric')] });
  if (SHOW_FORK && s.fork) {
    const f = { low: s.fork.low * SCALE, high: s.fork.high * SCALE, valley: s.fork.valley * SCALE };
    rows.push({ cells: [text(forkLabel(f), { color: COLORS.fork, fontWeight: '600' })] });
  }
  rows.push({ cells: [text('Risk-neutral: the price of each outcome, not a forecast.', { fontSize: '10px', opacity: 0.6, paddingBottom: '8px' })] });
  return { background: 'var(--background-color)', border: 'solid 1px var(--border-color)', borderRadius: '8px', rows };
}

// The expiry's density (already computed by modelExpiry), resampled to 40
// points between its 1st and 99th percentile for the overlay chart.
function densityFor(s) {
  const d = s.d;
  if (!d) return null;
  const lo = quantile(d, 0.01), hi = quantile(d, 0.99), labels = [], values = [];
  for (let i = 0; i < 40; i++) {
    const K = lo + (hi - lo) * i / 39;
    let j = 1;
    while (j < d.Ks.length - 1 && d.Ks[j] < K) j++;
    const t = (K - d.Ks[j - 1]) / (d.Ks[j] - d.Ks[j - 1]);
    const shown = K * SCALE;
    labels.push(shown < 100 ? shown.toFixed(1) : Math.round(shown).toString());
    values.push(+(d.pdf[j - 1] + t * (d.pdf[j] - d.pdf[j - 1])).toPrecision(4));
  }
  return { labels, values };
}
