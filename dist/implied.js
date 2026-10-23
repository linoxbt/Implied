// Implied v1.0.0 — the options market's implied price distribution, painted into the future.
// Open source (Apache-2.0): https://github.com/linoxbt/Implied
// Built file: edit src/core.js and src/indicator.js, then run `npm run build`.
// #TSBuild26

// ============================================================================
// Implied — core math
// Pure functions only: no TrendSpider globals, no I/O. The build concatenates
// this file with src/indicator.js into dist/implied.js; the Node tests load it
// directly through the export block at the bottom.
// ============================================================================

const QS = [0.025, 0.10, 0.25, 0.50, 0.75, 0.90, 0.975];
const INV_SQRT_2PI = 0.3989422804014327;

// ---------- Normal distribution and Black-76 ----------

function normPdf(x) {
  return INV_SQRT_2PI * Math.exp(-x * x / 2);
}

function normCdf(x) { // Abramowitz-Stegun 26.2.17, |error| < 7.5e-8
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = normPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

// Undiscounted-forward call price, discounted by D = e^(-rT).
function black76Call(F, K, T, sig, D) {
  if (!(sig > 0) || !(T > 0)) return D * Math.max(F - K, 0);
  const v = sig * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * v * v) / v;
  return D * (F * normCdf(d1) - K * normCdf(d1 - v));
}

function vega76(F, K, T, sig, D) {
  const v = sig * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * v * v) / v;
  return D * F * Math.sqrt(T) * normPdf(d1);
}

// Implied volatility by bisection. Returns null when the price carries no
// time value (deep in the money) or sits outside the attainable range.
function impliedVol(price, F, K, T, D) {
  const intrinsic = D * Math.max(F - K, 0);
  if (!(price > intrinsic + 1e-10 * F) || !(price < D * F)) return null;
  let lo = 0.005, hi = 5;
  if (black76Call(F, K, T, lo, D) > price || black76Call(F, K, T, hi, D) < price) return null;
  for (let i = 0; i < 100 && hi - lo > 1e-7; i++) {
    const m = (lo + hi) / 2;
    if (black76Call(F, K, T, m, D) > price) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// ---------- Small linear-algebra helpers ----------

// LU factorization with partial pivoting; returns a solver b -> x, or null if singular.
function luFactor(A) {
  const n = A.length, M = A.map(row => row.slice()), perm = Array.from({ length: n }, (_, i) => i);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let q = c + 1; q < n; q++) if (Math.abs(M[q][c]) > Math.abs(M[piv][c])) piv = q;
    if (Math.abs(M[piv][c]) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv], M[c]]; [perm[c], perm[piv]] = [perm[piv], perm[c]];
    for (let q = c + 1; q < n; q++) {
      const f = M[q][c] /= M[c][c];
      if (f !== 0) for (let k = c + 1; k < n; k++) M[q][k] -= f * M[c][k];
    }
  }
  return b => {
    const x = perm.map(i => b[i]);
    for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) x[i] -= M[i][k] * x[k];
    for (let i = n - 1; i >= 0; i--) {
      for (let k = i + 1; k < n; k++) x[i] -= M[i][k] * x[k];
      x[i] /= M[i][i];
    }
    return x;
  };
}

// Natural cubic spline through (xs, ys), xs strictly increasing.
function naturalSpline(xs, ys) {
  const n = xs.length, h = [], al = [0], l = [1], mu = [0], z = [0];
  const b = Array(n).fill(0), c = Array(n).fill(0), d = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i]);
  for (let i = 1; i < n - 1; i++) al.push(3 / h[i] * (ys[i + 1] - ys[i]) - 3 / h[i - 1] * (ys[i] - ys[i - 1]));
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (al[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  const seg = x => {
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xs[m] <= x) lo = m; else hi = m - 1; }
    return lo;
  };
  return {
    value(x) { const i = seg(x), u = x - xs[i]; return ys[i] + u * (b[i] + u * (c[i] + u * d[i])); },
    slope(x) { const i = seg(x), u = x - xs[i]; return b[i] + u * (2 * c[i] + 3 * u * d[i]); },
  };
}

// ---------- Clean: quotes -> forward + OTM implied vols ----------

function quoteMid(q, maxSpread) {
  if (!q) return null;
  const b = Number(q.b), a = Number(q.a);
  if (!(b > 0) || !(a > b)) return null;
  const m = (a + b) / 2;
  if ((a - b) / m > maxSpread) return null;
  return { mid: m, half: (a - b) / 2 };
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// byStrike: { [strike]: { C: {b, a, l}, P: {b, a, l} } } for one expiry.
// Returns { F, D, pts } where pts are OTM strikes with solved IV, sorted by strike.
function cleanExpiry(byStrike, S, T, r, maxSpread) {
  const D = Math.exp(-r * T);
  const rows = [];
  for (const key of Object.keys(byStrike || {})) {
    const K = Number(key), row = byStrike[key];
    if (!(K > 0) || !row || typeof row !== 'object') continue;
    rows.push({ K, c: quoteMid(row.C, maxSpread), p: quoteMid(row.P, maxSpread) });
  }
  rows.sort((x, y) => x.K - y.K);

  // Forward from put-call parity at the strikes nearest spot: F = K + (C - P) / D.
  const near = rows.filter(x => x.c && x.p)
    .sort((x, y) => Math.abs(x.K - S) - Math.abs(y.K - S)).slice(0, 5);
  let F = near.length ? median(near.map(x => x.K + (x.c.mid - x.p.mid) / D)) : S / D;
  if (!(F > 0) || Math.abs(F / S - 1) > 0.25) F = S / D;

  const pts = [];
  for (const x of rows) {
    // Out-of-the-money side only; puts converted to call prices with parity.
    const q = x.K >= F ? x.c : x.p;
    if (!q) continue;
    const call = x.K >= F ? q.mid : q.mid + D * (F - x.K);
    const iv = impliedVol(call, F, x.K, T, D);
    if (iv == null) continue;
    const vega = vega76(F, x.K, T, iv, D);
    if (!(vega > 1e-8 * F)) continue;
    // One-sigma noise of total variance w = iv^2 T implied by half the bid-ask spread.
    const sdw = 2 * iv * T * Math.max(q.half, 0.005) / vega;
    pts.push({ K: x.K, k: Math.log(x.K / F), iv, w: iv * iv * T, sdw });
  }
  return { F, D, pts };
}

// ---------- Model: smoothing-spline smile w(k) ----------
//
// Total variance w is smoothed on a uniform grid in log-moneyness k with a
// second-difference penalty (Whittaker smoother), each quote weighted by the
// variance noise its bid-ask spread implies. The penalty weight is chosen per
// chain by generalized cross-validation, so tight chains keep their detail and
// noisy ones are smoothed harder (opts.method 'chi2' instead takes the
// smoothest fit inside the spreads; kept for comparison). A natural cubic
// spline through the grid values gives a curve with continuous curvature, so
// the density (its second derivative in strike) has no kinks. Unlike a global
// polynomial it can follow the "frown" a two-outcome market produces.

const FIT_NODES = 48;
const FIT_GCV_GAMMA = 2; // >1 penalizes flexibility more than plain GCV (Kim & Gu 2004)
const FIT_SD_FLOOR = 0.005; // relative to ATM total variance

function fitSmile(pts, T, opts = {}) {
  const n = pts.length;
  if (n < 4) return null;
  const kMin = pts[0].k, kMax = pts[n - 1].k;
  if (!(kMax - kMin > 1e-6)) return null;
  const scale = median(pts.map(p => p.w));
  if (!(scale > 0)) return null;

  const M = FIT_NODES, hk = (kMax - kMin) / (M - 1);
  const grid = Array.from({ length: M }, (_, j) => kMin + j * hk);
  const A0 = Array.from({ length: M }, () => Array(M).fill(0));
  const P = Array.from({ length: M }, () => Array(M).fill(0));
  const rhs = Array(M).fill(0);
  const obs = pts.map(p => {
    const j = Math.min(M - 2, Math.max(0, Math.floor((p.k - kMin) / hk)));
    const f = Math.min(1, Math.max(0, (p.k - grid[j]) / hk));
    const sd = Math.max(p.sdw / scale, FIT_SD_FLOOR);
    return { j, f, y: p.w / scale, wt: 1 / (sd * sd) };
  });
  for (const o of obs) {
    const b0 = 1 - o.f, b1 = o.f;
    A0[o.j][o.j] += o.wt * b0 * b0; A0[o.j][o.j + 1] += o.wt * b0 * b1;
    A0[o.j + 1][o.j] += o.wt * b0 * b1; A0[o.j + 1][o.j + 1] += o.wt * b1 * b1;
    rhs[o.j] += o.wt * b0 * o.y; rhs[o.j + 1] += o.wt * b1 * o.y;
  }
  const pen = 1 / (hk * hk * hk); // integral of squared curvature: sum (d2/hk^2)^2 * hk
  for (let j = 1; j < M - 1; j++) {
    const e = [[j - 1, 1], [j, -2], [j + 1, 1]];
    for (const [a, ea] of e) for (const [b, eb] of e) P[a][b] += pen * ea * eb;
  }

  const solve = (lam, withTrace) => {
    const A = A0.map((row, a) => row.map((v, b) => v + lam * P[a][b] + (a === b ? 1e-12 : 0)));
    const lu = luFactor(A);
    if (!lu) return null;
    const z = lu(rhs);
    let chi2 = 0;
    for (const o of obs) { const e = o.y - ((1 - o.f) * z[o.j] + o.f * z[o.j + 1]); chi2 += o.wt * e * e; }
    let trace = 0;
    if (withTrace) for (let c = 0; c < M; c++) trace += lu(A0.map(row => row[c]))[c]; // tr((A0 + lam P)^-1 A0)
    return { z, chi2, trace };
  };

  let best = null;
  if (opts.method === 'chi2') {
    let loL = -14, hiL = 4;
    best = solve(Math.pow(10, loL));
    if (!best) return null;
    const target = Math.max((opts.chi2 ?? 1) * n, 1.25 * best.chi2);
    const top = solve(Math.pow(10, hiL));
    if (top && top.chi2 <= target) best = top;
    else for (let i = 0; i < 30; i++) {
      const mid = (loL + hiL) / 2, s = solve(Math.pow(10, mid));
      if (s && s.chi2 <= target) { best = s; loL = mid; } else hiL = mid;
    }
  } else {
    // Generalized cross-validation: pick the penalty that best predicts
    // left-out quotes, so the smoothing adapts to how noisy this chain is.
    let bestScore = Infinity;
    for (let L = -12; L <= 4; L += 0.5) {
      const s = solve(Math.pow(10, L), true);
      if (!s) continue;
      const dof = n - (opts.gamma ?? FIT_GCV_GAMMA) * s.trace;
      if (!(dof > 0.5)) continue;
      const score = n * s.chi2 / (dof * dof);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (!best) return null;
  }

  const ws = best.z.map(v => v * scale);
  const spline = naturalSpline(grid, ws);
  const floor = 1e-4 * T; // 1% volatility
  // Linear wings from the edge slopes; Lee's moment bound keeps |dw/dk| <= 2,
  // and the wings may not turn back toward the money.
  const sLo = Math.min(0, Math.max(-2, spline.slope(kMin)));
  const sHi = Math.max(0, Math.min(2, spline.slope(kMax)));
  const wLo = ws[0], wHi = ws[M - 1];
  return k => Math.max(floor,
    k < kMin ? wLo + sLo * (k - kMin) : k > kMax ? wHi + sHi * (k - kMax) : spline.value(k));
}

// ---------- Density (Breeden-Litzenberger) ----------

const GRID_N = 241;

function density(F, T, D, smile) {
  const sd0 = Math.sqrt(smile(0));
  if (!(sd0 > 0)) return null;
  const sdLo = Math.sqrt(Math.max(smile(0), smile(-2.5 * sd0)));
  const sdHi = Math.sqrt(Math.max(smile(0), smile(2.5 * sd0)));
  const lo = F * Math.exp(-5 * sdLo), hi = F * Math.exp(5 * sdHi);
  const h = (hi - lo) / (GRID_N - 1);
  const C = K => K <= 0 ? D * F : black76Call(F, K, T, Math.sqrt(smile(Math.log(K / F)) / T), D);
  const Cs = [];
  for (let i = -1; i <= GRID_N; i++) Cs.push(C(lo + i * h));
  const Ks = [], raw = [];
  for (let i = 0; i < GRID_N; i++) {
    Ks.push(lo + i * h);
    const v = (Cs[i + 2] - 2 * Cs[i + 1] + Cs[i]) / (h * h) / D;
    raw.push(Number.isFinite(v) && v > 0 ? v : 0);
  }
  let area = 0;
  for (let i = 1; i < GRID_N; i++) area += 0.5 * (raw[i] + raw[i - 1]) * h;
  if (!(area > 0) || !Number.isFinite(area)) return null;
  const pdf = raw.map(v => v / area), cdf = [0];
  for (let i = 1; i < GRID_N; i++) cdf.push(cdf[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * h);
  return { Ks, pdf, cdf, mass: area };
}

// ---------- Shape ----------

function quantile(d, p) {
  for (let i = 1; i < d.cdf.length; i++) if (d.cdf[i] >= p) {
    const t = (p - d.cdf[i - 1]) / ((d.cdf[i] - d.cdf[i - 1]) || 1);
    return d.Ks[i - 1] + t * (d.Ks[i] - d.Ks[i - 1]);
  }
  return d.Ks[d.Ks.length - 1];
}

function cdfAt(d, x) {
  if (x <= d.Ks[0]) return 0;
  const n = d.Ks.length;
  if (x >= d.Ks[n - 1]) return 1;
  for (let i = 1; i < n; i++) if (d.Ks[i] >= x) {
    const t = (x - d.Ks[i - 1]) / (d.Ks[i] - d.Ks[i - 1]);
    return d.cdf[i - 1] + t * (d.cdf[i] - d.cdf[i - 1]);
  }
  return 1;
}

// Two-outcome detection. A peak counts if it is >= 25% of the tallest and at
// least 3% of F from any taller peak; the Fork needs the valley between the
// two tallest peaks below 70% of the smaller one.
function fork(d, F) {
  const g = [0.06, 0.24, 0.40, 0.24, 0.06], n = d.pdf.length;
  const s = d.pdf.map((_, i) => g.reduce((a, w, j) => a + w * d.pdf[Math.min(n - 1, Math.max(0, i + j - 2))], 0));
  const top = Math.max(...s);
  const peaks = [];
  for (let i = 1; i < n - 1; i++) if (s[i] > s[i - 1] && s[i] >= s[i + 1] && s[i] >= 0.25 * top) peaks.push(i);
  peaks.sort((a, b) => s[b] - s[a]);
  const kept = [];
  for (const i of peaks) if (kept.every(j => Math.abs(d.Ks[i] - d.Ks[j]) > 0.03 * F)) kept.push(i);
  if (kept.length < 2) return null;
  const [a, b] = kept.slice(0, 2).sort((x, y) => x - y);
  let v = a;
  for (let i = a; i <= b; i++) if (s[i] < s[v]) v = i;
  if (s[v] >= 0.7 * Math.min(s[a], s[b])) return null;
  return { low: d.Ks[a], high: d.Ks[b], valley: d.Ks[v] };
}

function describeShape(d, F) {
  const q = QS.map(p => quantile(d, p));
  const q025 = q[0], q50 = q[3], q975 = q[6];
  return {
    q,
    fork: fork(d, F),
    skew: (q975 - q50) / ((q50 - q025) || 1e-12),
    leftTail: cdfAt(d, 0.9 * F),
    rightTail: 1 - cdfAt(d, 1.1 * F),
  };
}

// One expiry, end to end: chain slice -> shape, or null when too thin.
function modelExpiry(byStrike, S, T, r, maxSpread, minStrikes) {
  const { F, D, pts } = cleanExpiry(byStrike, S, T, r, maxSpread);
  if (pts.length < minStrikes) return null;
  const smile = fitSmile(pts, T);
  if (!smile) return null;
  const d = density(F, T, D, smile);
  if (!d) return null;
  return Object.assign({ T, F, strikes: pts.length }, describeShape(d, F));
}

// ---------- Project: expiry shapes -> one value per future bar ----------

// Time axis of the projection. Bar 0 is the last candle. In 'calendar' mode
// every calendar day is a bar (what TrendSpider's own Expected Move script
// assumes); in 'trading' mode only weekdays are bars. t is always calendar
// time in years, so the model's clock is the same either way.
function projectionTimeline(mode, lastTimeSec, maxDte) {
  const times = [0], barOfDte = { 0: 0 };
  if (mode !== 'trading') {
    for (let d = 1; d <= maxDte; d++) { times.push(d / 365); barOfDte[d] = d; }
    return { times, barOfDte };
  }
  const ms = lastTimeSec > 1e12 ? lastTimeSec : lastTimeSec * 1000;
  const start = new Date(Number.isFinite(ms) ? ms : Date.now());
  let bar = 0;
  for (let d = 1; d <= maxDte; d++) {
    const dow = new Date(start.getTime() + d * 86400000).getUTCDay();
    if (dow !== 0 && dow !== 6) { bar++; times.push(d / 365); }
    barOfDte[d] = bar;
  }
  return { times, barOfDte };
}

// Each quantile is carried in normalized space u = ln(q / F) / sqrt(T) and
// re-expanded with sqrt(t), so the cloud widens like the square root of time.
// Before the first expiry u is held at its first-expiry value (sqrt(t) alone
// pins the cloud to the anchor at t = 0); between expiries u and ln(F / S)
// are interpolated linearly in t. The cloud starts at `anchor` (the last
// close) and reaches each expiry's quantiles, scaled by anchor / S.
function projectQuantiles(shapes, S, anchor, times) {
  const lines = QS.map(() => [anchor]);
  const ell = shapes.map(s => Math.log(s.F / S));
  const u = shapes.map(s => s.q.map(q => Math.log(q / s.F) / Math.sqrt(s.T)));
  const last = shapes[shapes.length - 1].T;
  for (let i = 1; i < times.length; i++) {
    const t = times[i];
    if (t > last + 1e-9) { lines.forEach(l => l.push(null)); continue; }
    let n = shapes.findIndex(s => s.T >= t - 1e-9);
    const p = n - 1;
    let lv, uv;
    if (p < 0) {
      lv = ell[n] * t / shapes[n].T;
      uv = u[n];
    } else {
      const a = (t - shapes[p].T) / (shapes[n].T - shapes[p].T);
      lv = ell[p] + a * (ell[n] - ell[p]);
      uv = u[n].map((un, j) => u[p][j] + a * (un - u[p][j]));
    }
    const vals = uv.map(x => anchor * Math.exp(lv + x * Math.sqrt(t))).sort((a, b) => a - b);
    vals.forEach((v, j) => lines[j].push(v));
  }
  return lines;
}

// ---------- Labels ----------

function formatPrice(p) {
  return '$' + (p < 1000 ? p.toFixed(2) : Math.round(p).toString());
}

function forkLabel(f) {
  return 'Fork: ' + formatPrice(f.low) + ' / ' + formatPrice(f.high) + ' · least likely ' + formatPrice(f.valley);
}

// Skew ratio = upside tail / downside tail (97.5-50 vs 50-2.5).
function skewTag(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio > 1.15) return 'Upside tail ' + ratio.toFixed(1) + '× downside';
  if (ratio < 0.87) return 'Downside tail ' + (1 / ratio).toFixed(1) + '× upside';
  return null;
}

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
