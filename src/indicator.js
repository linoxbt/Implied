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
const CARRY_BAND = 0.1; // see buildCloud
// Projection bars are indexed by calendar days to expiry, as in TrendSpider's
// own Expected Move from Options script. 'trading' indexes weekdays only.
const PROJECTION_DAYS = 'calendar';

const RATE = RATE_PCT / 100;
const COLORS = { band: '#5b8def', median: '#9aa0b4', fork: '#ffb347', valley: '#7d8296' };

// ---------- Fetch and model ----------
// Every paint call below runs on every execution, even when there is nothing
// to draw (TrendSpider registers lines from the paint calls it sees), so a
// problem is recorded here, the empty series are painted, and the message is
// raised at the very end.
const NO_DATA = 'No options data for ' + current.ticker + '. Implied needs a ticker with listed options and an OPRA subscription.';
function Stop(message) { this.message = message; }
function need(cond, message) { if (!cond) throw new Stop(message); }

async function buildCloud() {
  need(String(current.resolution).toUpperCase() === 'D', 'Implied runs on the Daily timeframe only.');
  const lastClose = Number(close[close.length - 1]);
  need(lastClose > 0, 'Implied needs price history on the chart.');
  let schedule, chain;
  try {
    [schedule, chain] = await Promise.all([
      request.options_schedule(current.ticker),
      request.options_data_for_all_expirations(current.ticker, STRIKES_EACH_SIDE, ['b', 'a'], 'all'),
    ]);
  } catch (err) {
    need(false, NO_DATA + ' (' + String((err && err.message) || err) + ')'); // a failed request, not a crash
  }
  need(schedule && !schedule.error && Array.isArray(schedule) && schedule.length > 0,
    NO_DATA + (schedule && schedule.error ? ' (' + schedule.error + ')' : ''));
  need(chain && !chain.error && chain.resultByExpiration,
    NO_DATA + (chain && chain.error ? ' (' + chain.error + ')' : ''));

  const quotedSpot = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice);
  const spot = quotedSpot > 0 ? quotedSpot : lastClose;
  const lastTime = Number(time[time.length - 1]); // seconds or milliseconds; core handles both

  // Expiries are matched to the chain on a normalized YYMMDD key and placed by
  // their own timestamp; for each target horizon the nearest expiry that
  // models cleanly is kept (see selectExpiries in core). A ticker with an
  // expiry every weekday still gets a cloud that reaches weeks out.
  const { candidates, shapes, spot: chainSpot } = selectExpiries({
    schedule, resultByExpiration: chain.resultByExpiration, spot, lastTime, rate: RATE,
    maxSpread: MAX_SPREAD, minStrikes: MIN_STRIKES, count: EXPIRIES, maxBars: MAX_PROJECTION, mode: PROJECTION_DAYS,
  });
  need(candidates.length > 0, 'Options data for ' + current.ticker + ' did not include any expiration in the next ' + (MAX_PROJECTION - 1) + (PROJECTION_DAYS === 'trading' ? ' trading days.' : ' days.'));
  need(shapes.length > 0, 'Not enough liquid strikes on ' + current.ticker + ' to build a distribution.');

  // The model's clock (T) runs from now; the chart's runs from the last
  // candle, so each expiry is placed at its own day offset. The cloud starts
  // at the last close; every price shown (bands, Fork ticks, summary panel)
  // is on that same footing (see refSpot below), never on a stale quoted price.
  const timeline = projectionTimeline(PROJECTION_DAYS, lastTime, shapes[shapes.length - 1].day);
  const placed = shapes.map(s => ({ F: s.F, q: s.q, T: s.day / 365 }));
  // Candidates were limited to bars below MAX_PROJECTION, so every series fits.
  // When the chart's last close and the chain's spot agree within CARRY_BAND,
  // they describe the same market and the chain's own forwards are drawn as
  // they are, so a dividend or borrow cost before the first expiry stays in
  // the cloud. Further apart (a split, a chart left on an old session), the
  // chain is rescaled onto the chart.
  const refSpot = Math.abs(lastClose / chainSpot - 1) <= CARRY_BAND ? lastClose : chainSpot;
  const bands = projectQuantiles(placed, refSpot, lastClose, timeline.times);
  return { problem: null, shapes, timeline, bands, scale: lastClose / refSpot };
}

let cloud;
try {
  cloud = await buildCloud();
} catch (err) {
  if (!(err instanceof Stop)) throw err;
  cloud = { problem: err.message, shapes: [], timeline: { times: [0], barOfDay: { 0: 0 } }, bands: QS.map(() => [null]), scale: 1 };
}
const expiryShapes = cloud.shapes, projTimeline = cloud.timeline, bandValues = cloud.bands, SCALE = cloud.scale;

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
paint_overlay('Implied summary', { position: 'top_left' }, focus ? summaryOverlay(focus, expiryShapes) : messageOverlay(cloud.problem));

// Nothing to draw: show why, after every paint call has run.
assert(!cloud.problem, cloud.problem);

function messageOverlay(message) {
  return { background: 'var(--background-color)', border: 'solid 1px var(--border-color)', borderRadius: '8px',
    rows: [{ cells: [{ text: 'IMPLIED · ' + message, color: 'var(--text-color)', fontSize: '12px', padding: '8px 10px', textAlign: 'left' }] }] };
}

function summaryOverlay(s, all) {
  const text = (t, extra) => Object.assign({ text: t, color: 'var(--text-color)', fontSize: '12px', padding: '2px 10px', textAlign: 'left' }, extra || {});
  const d = densityFor(s);
  const tag = skewTag(all[all.length - 1].skew);
  const rows = [
    { cells: [text('IMPLIED · ' + s.day + '-DAY DISTRIBUTION', { fontWeight: '600', color: 'var(--text-accent-color)', paddingTop: '8px' })] },
  ];
  if (d) {
    rows.push({ cells: [{ padding: '0 6px', chart: {
      width: '240px', height: '96px', type: 'line',
      data: { labels: d.labels, datasets: [{ data: d.values, fill: true, borderColor: COLORS.band, backgroundColor: 'rgba(91,141,239,0.25)', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 5, font: { size: 10 } }, grid: { display: false } }, y: { display: false } } },
    } }] });
  }
  rows.push({ cells: [text('Median ' + formatPrice(s.q[3] * SCALE) + ' · 95% range ' + formatPrice(s.q[0] * SCALE) + ' – ' + formatPrice(s.q[6] * SCALE))] });
  const farDay = all[all.length - 1].day;
  rows.push({ cells: [text(tag ? tag + ' (to ' + farDay + (farDay === 1 ? ' day)' : ' days)') : 'Close to symmetric')] });
  rows.push({ cells: [text('Below ' + formatPrice(0.9 * s.F * SCALE) + ': ' + pct(s.tails.below) + ' · above ' + formatPrice(1.1 * s.F * SCALE) + ': ' + pct(s.tails.above))] });
  if (SHOW_FORK && s.fork) {
    const f = { low: s.fork.low * SCALE, high: s.fork.high * SCALE, valley: s.fork.valley * SCALE };
    rows.push({ cells: [text(forkLabel(f), { color: COLORS.fork, fontWeight: '600' })] });
  }
  // Bands beyond the quoted strikes come from the smile's extrapolated wings.
  if (s.q[0] < s.quoted.lo || s.q[6] > s.quoted.hi) {
    rows.push({ cells: [text('Quotes cover ' + formatPrice(s.quoted.lo * SCALE) + ' – ' + formatPrice(s.quoted.hi * SCALE) + '; the tails beyond are extrapolated.', { fontSize: '10px', opacity: 0.75 })] });
  }
  rows.push({ cells: [text('Risk-neutral: the price of each outcome, not a forecast.', { fontSize: '10px', opacity: 0.6, paddingBottom: '8px' })] });
  return { background: 'var(--background-color)', border: 'solid 1px var(--border-color)', borderRadius: '8px', rows };
}

// The expiry's density (already computed by modelExpiry), resampled to 40
// points between its 1st and 99th percentile for the overlay chart.
function pct(p) { return p < 0.01 ? '<1%' : Math.round(p * 100) + '%'; }

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
