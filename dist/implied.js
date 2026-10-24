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

// Cumulative normal to double precision (Hart 1968, as given by West 2005).
// A cheaper approximation leaves a kink at the money that the density, a
// second derivative of prices, turns into a small false peak.
function normCdf(x) {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-02 * z + 0.700383064443688;
      n = n * z + 6.37396220353165; n = n * z + 33.912866078383; n = n * z + 112.079291497871;
      n = n * z + 221.213596169931; n = n * z + 220.206867912376;
      let d = 8.83883476483184e-02 * z + 1.75566716318264;
      d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674;
      d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
      c = e * n / d;
    } else {
      let f = z + 0.65;
      f = z + 4 / f; f = z + 3 / f; f = z + 2 / f; f = z + 1 / f;
      c = e / f / 2.506628274631;
    }
  }
  return x <= 0 ? c : 1 - c;
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
  let lo = 0.005, hi = 20; // up to 2000%: short-dated options around a binary event
  if (black76Call(F, K, T, lo, D) > price || black76Call(F, K, T, hi, D) < price) return null;
  for (let i = 0; i < 100 && hi - lo > 1e-7; i++) {
    const m = (lo + hi) / 2;
    if (black76Call(F, K, T, m, D) > price) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// ---------- Small linear-algebra helpers ----------

// Cholesky factorization of a symmetric positive-definite pentadiagonal
// matrix given by its diagonals: d[i] = A[i][i], e[i] = A[i][i+1],
// f[i] = A[i][i+2]. Returns a solver (b, out) -> out, or null if the matrix is
// not positive definite. O(n) per factorization and per solve, no allocation
// per solve when `out` is passed.
function pentaCholesky(d, e, f) {
  const n = d.length, l0 = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = d[i] - (i >= 1 ? l1[i - 1] * l1[i - 1] : 0) - (i >= 2 ? l2[i - 2] * l2[i - 2] : 0);
    if (!(s > 0)) return null;
    l0[i] = Math.sqrt(s);
    l1[i] = i + 1 < n ? (e[i] - (i >= 1 ? l2[i - 1] * l1[i - 1] : 0)) / l0[i] : 0;
    l2[i] = i + 2 < n ? f[i] / l0[i] : 0;
  }
  const y = new Float64Array(n);
  return (b, out = new Float64Array(n)) => {
    for (let i = 0; i < n; i++) {
      y[i] = (b[i] - (i >= 1 ? l1[i - 1] * y[i - 1] : 0) - (i >= 2 ? l2[i - 2] * y[i - 2] : 0)) / l0[i];
    }
    for (let i = n - 1; i >= 0; i--) {
      out[i] = (y[i] - (i + 1 < n ? l1[i] * out[i + 1] : 0) - (i + 2 < n ? l2[i] * out[i + 2] : 0)) / l0[i];
    }
    return out;
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

// A wing ends at the second rejected quote in a row (zero bid, inverted,
// too wide, or no time value): isolated far strikes beyond such a gap are
// stale prints that would bend the smile with nothing in between.
const WING_MAX_REJECTS = 2;
// If parity and the quoted spot disagree by more than this, the chain or the
// spot is stale and the expiry is skipped rather than modelled on bad data.
const MAX_FORWARD_GAP = 0.25;

// byStrike: { [strike]: { C: {b, a}, P: {b, a} } } for one expiry.
// Returns { F, D, pts } where pts are OTM strikes with solved IV, sorted by
// strike. F is NaN (and pts empty) when no usable forward can be found.
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
  // Parity is trusted over the quoted spot, which can be stale after hours.
  const near = rows.filter(x => x.c && x.p)
    .sort((x, y) => Math.abs(x.K - S) - Math.abs(y.K - S)).slice(0, 5);
  let F = near.length ? median(near.map(x => x.K + (x.c.mid - x.p.mid) / D)) : S / D;
  if (!(F > 0) || !Number.isFinite(F) || (S > 0 && Math.abs(F / S - 1) > MAX_FORWARD_GAP)) return { F: NaN, D, pts: [] };

  const point = x => {
    // Out-of-the-money side only; puts converted to call prices with parity.
    const q = x.K >= F ? x.c : x.p;
    if (!q) return null;
    const call = x.K >= F ? q.mid : q.mid + D * (F - x.K);
    const iv = impliedVol(call, F, x.K, T, D);
    if (iv == null) return null;
    const vega = vega76(F, x.K, T, iv, D);
    if (!(vega > 1e-8 * F)) return null;
    // One-sigma noise of total variance w = iv^2 T implied by half the bid-ask spread.
    const sdw = 2 * iv * T * Math.max(q.half, 0.005) / vega;
    return { K: x.K, k: Math.log(x.K / F), iv, w: iv * iv * T, sdw };
  };
  // Walk outward from the forward on each side; stop a wing at the first run
  // of WING_MAX_REJECTS rejected quotes.
  const walk = side => {
    const out = [];
    let rejects = 0;
    for (const x of side) {
      const p = point(x);
      if (p) { out.push(p); rejects = 0; } else if (++rejects >= WING_MAX_REJECTS) break;
    }
    return out;
  };
  const below = walk(rows.filter(x => x.K < F).reverse()).reverse();
  const above = walk(rows.filter(x => x.K >= F));
  return { F, D, pts: below.concat(above) };
}

// ---------- Model: smoothing-spline smile w(k) ----------
//
// Total variance w is smoothed on a uniform grid in log-moneyness k with a
// second-difference penalty (Whittaker smoother), each quote weighted by the
// variance noise its bid-ask spread implies. The penalty weight is chosen per
// chain by generalized cross-validation, so tight chains keep their detail and
// noisy ones are smoothed harder. A natural cubic spline through the grid
// values gives a curve with continuous curvature, so the density (its second
// derivative in strike) has no kinks. Unlike a global polynomial it can follow
// the "frown" a two-outcome market produces.

const FIT_NODES = 48;
const FIT_GCV_GAMMA = 2; // >1 penalizes flexibility more than plain GCV (Kim & Gu 2004)
const FIT_SD_FLOOR = 0.005; // relative to ATM total variance

function fitSmile(pts, T, boost = 1) {
  const n = pts.length;
  if (n < 4) return null;
  const kMin = pts[0].k, kMax = pts[n - 1].k;
  if (!(kMax - kMin > 1e-6)) return null;
  const scale = median(pts.map(p => p.w));
  if (!(scale > 0)) return null;

  const M = FIT_NODES, hk = (kMax - kMin) / (M - 1);
  const grid = Array.from({ length: M }, (_, j) => kMin + j * hk);
  // Data term A0 (tridiagonal: a0 diagonal, a1 first off-diagonal) and the
  // second-difference penalty P (pentadiagonal: p0, p1, p2), as diagonals.
  const a0 = new Float64Array(M), a1 = new Float64Array(M), rhs = new Float64Array(M);
  const obs = pts.map(p => {
    const j = Math.min(M - 2, Math.max(0, Math.floor((p.k - kMin) / hk)));
    const f = Math.min(1, Math.max(0, (p.k - grid[j]) / hk));
    const sd = Math.max(p.sdw / scale, FIT_SD_FLOOR);
    return { j, f, y: p.w / scale, wt: 1 / (sd * sd) };
  });
  for (const o of obs) {
    const b0 = 1 - o.f, b1 = o.f;
    a0[o.j] += o.wt * b0 * b0; a0[o.j + 1] += o.wt * b1 * b1; a1[o.j] += o.wt * b0 * b1;
    rhs[o.j] += o.wt * b0 * o.y; rhs[o.j + 1] += o.wt * b1 * o.y;
  }
  const pen = 1 / (hk * hk * hk); // integral of squared curvature: sum (d2/hk^2)^2 * hk
  const p0 = new Float64Array(M), p1 = new Float64Array(M), p2 = new Float64Array(M);
  for (let j = 1; j < M - 1; j++) { // each interior node adds (1, -2, 1)ᵀ(1, -2, 1) at j-1..j+1
    p0[j - 1] += pen; p0[j] += 4 * pen; p0[j + 1] += pen;
    p1[j - 1] -= 2 * pen; p1[j] -= 2 * pen;
    p2[j - 1] += pen;
  }
  const ridge = 1e-12 * Math.max(1, ...a0);
  const d = new Float64Array(M), e = new Float64Array(M), f2 = new Float64Array(M);
  const col = new Float64Array(M), sol = new Float64Array(M);

  const solve = lam => {
    for (let i = 0; i < M; i++) { d[i] = a0[i] + lam * p0[i] + ridge; e[i] = a1[i] + lam * p1[i]; f2[i] = lam * p2[i]; }
    const chol = pentaCholesky(d, e, f2);
    if (!chol) return null;
    const z = chol(rhs);
    let chi2 = 0;
    for (const o of obs) { const r = o.y - ((1 - o.f) * z[o.j] + o.f * z[o.j + 1]); chi2 += o.wt * r * r; }
    let trace = 0; // tr((A0 + lam P)^-1 A0), one solve per column of A0
    for (let c = 0; c < M; c++) {
      col.fill(0);
      col[c] = a0[c];
      if (c > 0) col[c - 1] = a1[c - 1];
      if (c + 1 < M) col[c + 1] = a1[c];
      trace += chol(col, sol)[c];
    }
    return { z, chi2, trace };
  };

  // Generalized cross-validation: pick the penalty that best predicts
  // left-out quotes, so the smoothing adapts to how noisy this chain is.
  let best = null, bestScore = Infinity;
  for (let L = -12; L <= 4; L += 0.5) {
    const s = solve(Math.pow(10, L));
    if (!s) continue;
    const dof = n - FIT_GCV_GAMMA * s.trace;
    if (!(dof > 0.5)) continue;
    const score = n * s.chi2 / (dof * dof);
    if (score < bestScore) { bestScore = score; best = { s, lam: Math.pow(10, L) }; }
  }
  if (!best) return null;
  // `boost` > 1 smooths harder than GCV chose (see modelExpiry).
  if (boost !== 1) best = { s: solve(best.lam * boost) || best.s };
  best = best.s;

  const ws = Array.from(best.z, v => v * scale);
  const spline = naturalSpline(grid, ws);
  const floor = 1e-4 * T; // 1% volatility
  // Wings beyond the quotes. Each starts with the spline's own value, slope
  // and (zero) curvature, and its slope eases into a final slope that respects
  // Lee's moment bound (|dw/dk| <= 2) and does not turn back toward the money.
  // The smoothstep blend keeps the curvature continuous at both ends of the
  // blend zone, so the density has no step or bump at the last quote.
  const blend = Math.max(0.04, 0.3 * (kMax - kMin));
  const wing = (w0, s0, sEnd) => x => {
    if (x >= blend) return w0 + (s0 + sEnd) * blend / 2 + sEnd * (x - blend);
    const t = x / blend;
    return w0 + s0 * x + (sEnd - s0) * blend * (t * t * t - t * t * t * t / 2);
  };
  const s0Lo = -spline.slope(kMin), s0Hi = spline.slope(kMax); // slopes in the outward direction
  const left = wing(ws[0], s0Lo, Math.min(2, Math.max(0, s0Lo)));
  const right = wing(ws[M - 1], s0Hi, Math.min(2, Math.max(0, s0Hi)));
  const smile = k => Math.max(floor,
    k < kMin ? left(kMin - k) : k > kMax ? right(k - kMax) : spline.value(k));
  smile.kMin = kMin; smile.kMax = kMax;
  return smile;
}

// ---------- Density (Breeden-Litzenberger) ----------
//
// The grid is uniform in log-strike, so it stays fine near the money however
// wide the distribution is (a grid uniform in strike gets coarser than the
// price itself on high-volatility, long-dated chains). It spans ±7 standard
// deviations of the wing volatility on each side, capped (see below). `mass`, the raw integral
// before normalizing, is the market's total probability on the grid; it must
// be close to 1 or the expiry is rejected by modelExpiry.

const GRID_N = 601;
const GRID_SPAN_SD = 7;
const GRID_MAX_LOG = 4;
const GRID_MIN_LOG = 12;
const MAX_MASS_ERROR = 0.03;
const MAX_ARBITRAGE = 0.005;
const SMOOTHING_BOOSTS = [1, 4, 16, 64, 256, 1024];

function density(F, T, D, smile) {
  const sd0 = Math.sqrt(smile(0));
  if (!(sd0 > 0)) return null;
  const sdLo = Math.sqrt(Math.max(smile(0), smile(-3 * sd0)));
  const sdHi = Math.sqrt(Math.max(smile(0), smile(3 * sd0)));
  // The upside is capped at e^GRID_MAX_LOG (about 55x the forward): the
  // extrapolated right wing carries no information beyond that and only adds
  // numerical error. The downside may run toward zero, where price is bounded.
  const x0 = -Math.min(GRID_MIN_LOG, GRID_SPAN_SD * sdLo), x1 = Math.min(GRID_MAX_LOG, GRID_SPAN_SD * sdHi), dx = (x1 - x0) / (GRID_N - 1);
  const K = i => F * Math.exp(x0 + i * dx);
  const C = k => black76Call(F, k, T, Math.sqrt(smile(Math.log(k / F)) / T), D);
  const Ks = [], Cs = [];
  for (let i = -1; i <= GRID_N; i++) Cs.push(C(K(i)));
  for (let i = 0; i < GRID_N; i++) Ks.push(K(i));
  const raw = [], neg = [];
  for (let i = 0; i < GRID_N; i++) {
    const kl = K(i - 1), km = Ks[i], kr = K(i + 1);
    const v = 2 * ((Cs[i + 2] - Cs[i + 1]) / (kr - km) - (Cs[i + 1] - Cs[i]) / (km - kl)) / (kr - kl) / D;
    raw.push(Number.isFinite(v) && v > 0 ? v : 0);
    neg.push(Number.isFinite(v) && v < 0 ? -v : 0);
  }
  let area = 0, negArea = 0;
  for (let i = 1; i < GRID_N; i++) {
    area += 0.5 * (raw[i] + raw[i - 1]) * (Ks[i] - Ks[i - 1]);
    negArea += 0.5 * (neg[i] + neg[i - 1]) * (Ks[i] - Ks[i - 1]);
  }
  if (!(area > 0) || !Number.isFinite(area)) return null;
  const pdf = raw.map(v => v / area), cdf = [0];
  for (let i = 1; i < GRID_N; i++) cdf.push(cdf[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * (Ks[i] - Ks[i - 1]));
  // `arbitrage`: probability the fitted smile priced below zero (butterfly
  // arbitrage), clipped out above; near 0 for a clean fit.
  return { Ks, pdf, cdf, mass: area, arbitrage: negArea / area };
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

// Two-outcome detection, with the numbers behind the verdict.
// Rules (the spec's): a peak counts if it is >= 25% of the tallest and at
// least 3% of F from any taller peak; the Fork needs the valley between the
// two tallest peaks below 70% of the smaller one. A data gate is added: both
// peaks must lie inside the quoted strikes (not in the extrapolated wings),
// with at least FORK_MIN_STRIKES quotes between each peak and the valley, and
// the quotes must span at least FORK_MIN_COVERAGE of the probability, so
// sparse, noisy or mostly-extrapolated chains cannot produce a Fork.
const FORK_HEIGHT = 0.25, FORK_SEPARATION = 0.03, FORK_VALLEY = 0.7, FORK_MIN_STRIKES = 2, FORK_MIN_COVERAGE = 0.75;

function forkDiagnostics(d, F, strikes) {
  const g = [0.06, 0.24, 0.40, 0.24, 0.06], n = d.pdf.length;
  const s = d.pdf.map((_, i) => g.reduce((a, w, j) => a + w * d.pdf[Math.min(n - 1, Math.max(0, i + j - 2))], 0));
  const top = Math.max(...s);
  const local = [];
  for (let i = 1; i < n - 1; i++) if (s[i] > s[i - 1] && s[i] >= s[i + 1]) local.push(i);
  local.sort((a, b) => s[b] - s[a]);
  // The two tallest peaks at least FORK_SEPARATION apart (height checked below).
  const kept = [];
  for (const i of local) if (kept.every(j => Math.abs(d.Ks[i] - d.Ks[j]) > FORK_SEPARATION * F)) kept.push(i);
  const out = { fork: null, peaks: kept.length >= 2 ? 2 : 1, height: null, separation: null, valley: null, reason: 'one peak' };
  if (kept.length < 2) return out;
  const [a, b] = kept.slice(0, 2).sort((x, y) => x - y);
  let v = a;
  for (let i = a; i <= b; i++) if (s[i] < s[v]) v = i;
  out.height = Math.min(s[a], s[b]) / top;
  out.separation = (d.Ks[b] - d.Ks[a]) / F;
  out.valley = s[v] / Math.min(s[a], s[b]);
  if (out.height < FORK_HEIGHT) { out.reason = 'second peak too small'; return out; }
  if (out.valley >= FORK_VALLEY) { out.reason = 'valley too shallow'; return out; }
  if (strikes && strikes.length) {
    const lo = strikes[0], hi = strikes[strikes.length - 1];
    const between = (x, y) => strikes.filter(k => k > Math.min(x, y) && k < Math.max(x, y)).length;
    if (d.Ks[a] < lo || d.Ks[b] > hi) { out.reason = 'peak outside the quoted strikes'; return out; }
    if (d.cdf[d.cdf.length - 1] > 0 && cdfAt(d, hi) - cdfAt(d, lo) < FORK_MIN_COVERAGE) { out.reason = 'quotes cover too little of the distribution'; return out; }
    if (between(d.Ks[a], d.Ks[v]) < FORK_MIN_STRIKES || between(d.Ks[v], d.Ks[b]) < FORK_MIN_STRIKES) { out.reason = 'too few quotes between peaks'; return out; }
  }
  out.reason = 'fork';
  out.fork = { low: d.Ks[a], high: d.Ks[b], valley: d.Ks[v] };
  return out;
}

function fork(d, F, strikes) {
  return forkDiagnostics(d, F, strikes).fork;
}

// Skew ratio: upside tail over downside tail, measured in log price
// (ln(q97.5/q50) / ln(q50/q2.5)), so a plain lognormal with no skew reads 1.
// Tail weights: the probability below 0.9 F and above 1.1 F. `quoted` is the
// strike range the quotes cover and `coverage` the probability inside it;
// bands beyond it come from the smile's extrapolated wings.
function describeShape(d, F, strikes) {
  const q = QS.map(p => quantile(d, p));
  const q025 = q[0], q50 = q[3], q975 = q[6];
  const lo = strikes && strikes.length ? strikes[0] : q025, hi = strikes && strikes.length ? strikes[strikes.length - 1] : q975;
  return {
    q,
    fork: fork(d, F, strikes),
    skew: Math.log(q975 / q50) / (Math.log(q50 / q025) || 1e-12),
    tails: { below: cdfAt(d, 0.9 * F), above: 1 - cdfAt(d, 1.1 * F) },
    quoted: { lo, hi },
    coverage: cdfAt(d, hi) - cdfAt(d, lo),
  };
}

// One expiry, end to end, keeping every intermediate (used by modelExpiry
// and by the website's step-by-step views). `ok` is false, with a `reason`,
// when the expiry is too thin, its forward is unusable, or its density does
// not hold the market's probability.
const OUTLIER_Z = 5;

function fitExpiry(byStrike, S, T, r, maxSpread, minStrikes) {
  const clean = cleanExpiry(byStrike, S, T, r, maxSpread);
  const { F, D } = clean;
  let pts = clean.pts;
  const out = { F, D, pts, smile: null, d: null, ok: false, reason: '', dropped: 0 };
  if (!(F > 0)) { out.reason = 'no usable forward'; return out; }
  if (pts.length < minStrikes) { out.reason = 'too few liquid strikes'; return out; }
  // Robust pass: a stale quote with a tight spread gets a high weight and can
  // bend the smile into a false second peak. Quotes more than OUTLIER_Z of
  // their own noise (and 3x the typical misfit) away from a first fit are
  // dropped before the real fit.
  const first = fitSmile(pts, T, 1);
  if (first) {
    const z = pts.map(p => Math.abs(p.w - first(p.k)) / p.sdw);
    const cut = Math.max(OUTLIER_Z, 3 * median(z));
    const kept = pts.filter((p, i) => z[i] <= cut);
    if (kept.length >= minStrikes && kept.length < pts.length) { out.dropped = pts.length - kept.length; pts = kept; out.pts = pts; }
  }
  // Start from the smoothing GCV picks; if the implied density still has
  // butterfly arbitrage (negative probability), smooth harder until it does
  // not. Tiny ripples in a high-volatility smile are amplified by the second
  // derivative; clipping them would leave spikes that look like peaks.
  for (const boost of SMOOTHING_BOOSTS) {
    out.smile = fitSmile(pts, T, boost);
    if (!out.smile) { out.reason = 'smile fit failed'; return out; }
    out.d = density(F, T, D, out.smile);
    if (out.d && out.d.arbitrage <= MAX_ARBITRAGE) break;
  }
  out.reason = densityProblem(out.d) || '';
  out.ok = !out.reason;
  return out;
}

// Why a density cannot be used, or null: missing, negative probability left
// after the smoothing passes, or total probability far from 1.
function densityProblem(d) {
  if (!d) return 'no density';
  if (d.arbitrage > MAX_ARBITRAGE) return 'quotes imply negative probability';
  if (Math.abs(d.mass - 1) > MAX_MASS_ERROR) return 'probability does not add up';
  return null;
}

// One expiry -> its shape (with its density and quoted strikes), or null.
function modelExpiry(byStrike, S, T, r, maxSpread, minStrikes) {
  const f = fitExpiry(byStrike, S, T, r, maxSpread, minStrikes);
  if (!f.ok) return null;
  const strikes = f.pts.map(p => p.K);
  return Object.assign({ T, F: f.F, d: f.d, strikes }, describeShape(f.d, f.F, strikes));
}

// ---------- Project: expiry shapes -> one value per future bar ----------

// Time axis of the projection. Bar 0 is the last candle. In 'calendar' mode
// every calendar day is a bar (what TrendSpider's own Expected Move script
// assumes); in 'trading' mode only weekdays are bars. t is always calendar
// time in years, so the model's clock is the same either way.
// NYSE full-day closures (trading mode only).
const MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

function projectionTimeline(mode, lastTimeSec, maxDays) {
  const times = [0], barOfDay = { 0: 0 };
  if (mode !== 'trading') {
    for (let d = 1; d <= maxDays; d++) { times.push(d / 365); barOfDay[d] = d; }
    return { times, barOfDay };
  }
  const ms = lastTimeSec > 1e12 ? lastTimeSec : lastTimeSec * 1000;
  const start = new Date(Number.isFinite(ms) ? ms : Date.now());
  let bar = 0;
  for (let d = 1; d <= maxDays; d++) {
    const day = new Date(start.getTime() + d * 86400000), dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6 && !MARKET_HOLIDAYS.has(day.toISOString().slice(0, 10))) { bar++; times.push(d / 365); }
    barOfDay[d] = bar;
  }
  return { times, barOfDay };
}

// Each quantile is carried in normalized space u = ln(q / F) / sqrt(T) and
// re-expanded with sqrt(t), so the cloud widens like the square root of time.
// Before the first expiry u is held at its first-expiry value (sqrt(t) alone
// pins the cloud to the anchor at t = 0); between expiries u and ln(F / S)
// are interpolated linearly in t. The cloud starts at `anchor` (the last
// close) and reaches each expiry's quantiles, scaled by anchor / S.
function projectQuantiles(shapes, S, anchor, times) {
  const lines = QS.map(() => [anchor]);
  if (!shapes.length) return lines;
  const ell = shapes.map(s => Math.log(s.F / S));
  const u = shapes.map(s => s.q.map(q => Math.log(q / s.F) / Math.sqrt(s.T)));
  const last = shapes[shapes.length - 1].T;
  for (let i = 1; i < times.length; i++) {
    const t = times[i];
    if (t > last + 1e-9) { lines.forEach(l => l.push(null)); continue; }
    const n = shapes.findIndex(s => s.T >= t - 1e-9);
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
    // A blend of two sorted quantile vectors is sorted, so the bands never cross.
    const vals = uv.map(x => anchor * Math.exp(lv + x * Math.sqrt(t)));
    vals.forEach((v, j) => lines[j].push(v));
  }
  return lines;
}

// ---------- Expiry selection and matching ----------

// Expiry codes come as YYYYMMDD in the schedule and YYMMDD as chain keys in
// TrendSpider's docs; both reduce to the same YYMMDD key. Non-date codes are
// kept as they are.
function expiryKey(code) {
  const digits = String(code).replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-6) : String(code);
}

// Target horizons (calendar days) for N expirations: a spread from a week out
// to the edge of the drawable window, so a ticker with an expiry every
// weekday still gets a cloud that reaches weeks ahead, not N days.
const HORIZONS = {
  1: [30], 2: [14, 30], 3: [7, 14, 30], 4: [7, 14, 30, 60],
  5: [7, 14, 30, 45, 60], 6: [7, 14, 21, 30, 45, 60], 7: [7, 14, 21, 30, 45, 60, 90], 8: [7, 10, 14, 21, 30, 45, 60, 90],
};

// For each target horizon, the candidate expiries ordered by closeness (in
// log-days). The caller models them in this order and keeps the first that
// works, so a thin or missing expiry is replaced by its nearest neighbour.
function expiryPlan(days, count) {
  const targets = HORIZONS[Math.max(1, Math.min(8, Math.round(count) || 4))];
  return targets.map(t => days.map((d, i) => ({ i, d, dist: Math.abs(Math.log(d / t)) }))
    .sort((x, y) => x.dist - y.dist || x.d - y.d).map(x => x.i));
}

// The indicator's whole selection step, in one place so the website's
// per-expiry table shows exactly what the script modelled.
//   o: { schedule, resultByExpiration, spot, lastTime (s), rate, maxSpread,
//        minStrikes, count, maxBars, mode }
// Returns { candidates: [{ x, byStrike, day }], shapes: [shape + { dte, day, key }] }.
// `day` is calendar days from the last candle: from the expiry's timestamp
// when given, so weekends and holidays between the last bar and today don't
// shift the cloud; otherwise its days-to-expiry.
// The Fork scan covers the nearest expiries only: a two-outcome event is
// sharpest at the first expiries after it and blurs out beyond a few weeks.
const FORK_SCAN_MAX = 10, FORK_SCAN_DAYS = 21;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function selectExpiries(o) {
  const chainByKey = {};
  for (const key of Object.keys(o.resultByExpiration || {})) chainByKey[expiryKey(key)] = o.resultByExpiration[key];
  const pad = v => String(v).padStart(2, '0');
  const keyOf = x => {
    if (chainByKey[expiryKey(x.code)]) return expiryKey(x.code);
    const m = MONTHS[String(x.month || '').slice(0, 3).toLowerCase()] || Number(x.month);
    return x.year > 0 && m > 0 && x.day > 0 ? pad(x.year % 100) + pad(m) + pad(x.day) : null;
  };
  // Calendar dates (UTC) of the expiry and the last candle, so the time of
  // day either is stamped at doesn't move the cloud by a bar.
  const dayNo = t => Math.floor((t > 1e12 ? t / 1000 : t) / 86400);
  const daysOut = x => {
    const ts = Number(x.timestamp);
    if (ts > 0 && o.lastTime > 0) {
      const d = dayNo(ts) - dayNo(o.lastTime);
      if (d >= 1) return d;
    }
    return Number(x.dte);
  };
  const horizon = projectionTimeline(o.mode, o.lastTime, 400);
  const candidates = (o.schedule || [])
    .filter(e => e && e.expiration && Number(e.expiration.dte) >= 1)
    .map(e => { const key = keyOf(e.expiration); return { x: e.expiration, key, byStrike: key ? chainByKey[key] : null, day: daysOut(e.expiration) }; })
    .filter(c => c.byStrike && c.day >= 1 && horizon.barOfDay[c.day] < o.maxBars)
    .sort((a, b) => a.day - b.day);
  // For each target horizon, model the nearest expiry; if it is too thin,
  // try its neighbours (up to four).
  const modelled = new Map();
  const shapeOf = i => {
    if (!modelled.has(i)) {
      const c = candidates[i], dte = Number(c.x.dte);
      let shape = null;
      try {
        shape = modelExpiry(c.byStrike, o.spot, dte / 365, o.rate, o.maxSpread, o.minStrikes);
      } catch (err) {
        shape = null; // a bad expiry is skipped; another one takes its place
      }
      modelled.set(i, shape && shape.q.every(Number.isFinite) ? Object.assign({ dte, day: c.day, key: c.key }, shape) : null);
    }
    return modelled.get(i);
  };
  const chosen = new Set();
  if (candidates.length) {
    // The nearest expiry that models is always drawn: it is where a
    // post-earnings Fork is sharpest.
    for (let i = 0; i < Math.min(4, candidates.length); i++) if (shapeOf(i)) { chosen.add(i); break; }
    for (const order of expiryPlan(candidates.map(c => c.day), o.count)) {
      for (const i of order.slice(0, 4)) {
        if (chosen.has(i)) continue;
        if (shapeOf(i)) { chosen.add(i); break; }
      }
    }
    // Any other expiry inside the cloud that prices two outcomes is added, so
    // the Fork is never lost between the horizons.
    const lastDay = Math.max(-1, ...[...chosen].map(i => candidates[i].day));
    let scanned = 0;
    for (let i = 0; i < candidates.length && candidates[i].day <= Math.min(lastDay, FORK_SCAN_DAYS) && scanned < FORK_SCAN_MAX; i++) {
      if (chosen.has(i)) continue;
      scanned++;
      const s = shapeOf(i);
      if (s && s.fork) chosen.add(i);
    }
  }
  const shapes = [...chosen].map(i => modelled.get(i)).sort((a, b) => a.day - b.day);
  // The chain's own spot: the nearest expiry's parity forward, discounted.
  // Unlike the quoted last price it cannot be a stale or after-hours print.
  const spot = shapes.length ? shapes[0].F * Math.exp(-o.rate * shapes[0].T) : o.spot;
  return { candidates, shapes, spot };
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
  // is on that same footing, scaled by lastClose / the chain's own spot (its
  // nearest parity forward, discounted), never by a stale quoted price.
  const timeline = projectionTimeline(PROJECTION_DAYS, lastTime, shapes[shapes.length - 1].day);
  const placed = shapes.map(s => ({ F: s.F, q: s.q, T: s.day / 365 }));
  // Candidates were limited to bars below MAX_PROJECTION, so every series fits.
  const bands = projectQuantiles(placed, chainSpot, lastClose, timeline.times);
  return { problem: null, shapes, timeline, bands, scale: lastClose / chainSpot };
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
