// Checks Implied's probabilities against the market's own, with no model on
// the market side. For a strike K, the chance of finishing below K is priced
// by a tight vertical spread between K's listed neighbours (OTM mids:
// puts below the forward, calls above):
//   P(S_T < K) = (P(K+) - P(K-)) / ((K+ - K-) * D)   or   1 - (C(K-) - C(K+)) / ((K+ - K-) * D)
// Implied's side is the CDF of the expiry fitted the way the script fits it,
// on the chain cut to TrendSpider's 40 strikes a side.
//
//   node tools/model-vs-market.js chains/SPY-2026-10-23-real.json [dte ...]
//
// Saved chains come from `npm run chain -- SPY` (git-ignored: licensed data).
'use strict';
const fs = require('fs');
const core = require('../src/core.js');
const { limitStrikes } = require('../web/assets/engine.js');

const r = 0.04, MONEYNESS = [0.8, 0.85, 0.9, 0.93, 0.96, 0.98, 1, 1.02, 1.04, 1.07, 1.1, 1.15];

function compare(data, dte) {
  const S = data.chain.underlyingSymbolQuote.lastPrice, e = data.schedule.find(x => x.expiration.dte === dte);
  if (!e) return null;
  const key = core.expiryKey(e.expiration.code), T = dte / 365, D = Math.exp(-r * T);
  const full = data.chain.resultByExpiration[key];
  const f = core.fitExpiry(limitStrikes(data.chain, 40, S).resultByExpiration[key], S, T, r, 0.5, 8);
  if (!f.ok) return null;
  const Ks = Object.keys(full).map(Number).sort((a, b) => a - b);
  const mid = (K, side) => { const q = full[K.toFixed(2)] && full[K.toFixed(2)][side]; return q && q.b > 0 && q.a >= q.b ? (q.a + q.b) / 2 : null; };
  const lo = f.pts[0].K, hi = f.pts[f.pts.length - 1].K, rows = [];
  for (const m of MONEYNESS) {
    const i = Ks.findIndex(K => K >= S * m);
    if (i < 1 || i >= Ks.length - 1) continue;
    const K = Ks[i], a = Ks[i - 1], b = Ks[i + 1], side = K < f.F ? 'P' : 'C', va = mid(a, side), vb = mid(b, side);
    if (va == null || vb == null) continue;
    const market = side === 'P' ? (vb - va) / ((b - a) * D) : 1 - (va - vb) / ((b - a) * D);
    rows.push({ K, market, implied: core.cdfAt(f.d, K), quoted: K >= lo && K <= hi });
  }
  return { dte, rows };
}

function main() {
  const [file, ...days] = process.argv.slice(2);
  if (!file) { console.error('usage: node tools/model-vs-market.js <saved-chain.json> [dte ...]'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dtes = days.length ? days.map(Number) : data.schedule.map(e => e.expiration.dte).filter(d => d >= 5 && d <= 60);
  for (const dte of dtes) {
    const res = compare(data, dte);
    if (!res || !res.rows.length) continue;
    const gap = rows => rows.length ? Math.max(...rows.map(x => Math.abs(x.implied - x.market))) * 100 : NaN;
    const inside = res.rows.filter(x => x.quoted), outside = res.rows.filter(x => !x.quoted);
    console.log(`${data.ticker} ${dte}d  largest gap: ${gap(inside).toFixed(1)} points inside the quoted strikes` + (outside.length ? `, ${gap(outside).toFixed(1)} beyond them` : ''));
    for (const x of res.rows) console.log(`   K ${x.K.toFixed(1).padStart(8)}   market ${(x.market * 100).toFixed(1).padStart(5)}%   Implied ${(x.implied * 100).toFixed(1).padStart(5)}%${x.quoted ? '' : '   (extrapolated)'}`);
  }
}

if (require.main === module) main();
module.exports = { compare };
