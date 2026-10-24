// Saves a real options chain, from Cboe's free delayed quotes, in the shape
// TrendSpider's requests return, so it can be replayed without TrendSpider:
//
//   node tools/fetch-chain.js SPY            -> chains/SPY-<date>-real.json
//   node tools/fetch-chain.js SPY saved.json (convert a file downloaded from
//                                             cdn.cboe.com/api/global/delayed_quotes/options/SPY.json)
//
// Then `node tools/replay.js chains/SPY-<date>-real.json`, drop the file on
// the site's Analyze page, or run `npm test` (every file in chains/ is
// replayed). Quotes are 15-minute delayed, or the last close outside market
// hours. Cboe's data is for personal use: chains/ is git-ignored, so keep
// these files on your machine and never commit or publish them.
//
// Cboe gives no price history, so `close`/`time` are flat at the last price
// (the script only uses the last close and its date to place the cloud).
'use strict';
const fs = require('fs');
const path = require('path');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The last weekday on or before a date, at UTC midnight (seconds).
function lastSession(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime() / 1000;
}

function convert(sym, raw) {
  const data = raw.data || raw, root = sym.replace(/^\^/, '');
  const S = Number(data.current_price || data.close);
  if (!(S > 0) || !Array.isArray(data.options)) throw new Error('not a Cboe delayed-quotes chain');
  const stamp = new Date(String(raw.timestamp || '').replace(' ', 'T') + 'Z');
  const asOf = lastSession(Number.isNaN(stamp.getTime()) ? new Date() : stamp);
  const byExp = {};
  for (const o of data.options) {
    const m = /^([A-Z.]+?)(\d{6})([CP])(\d{8})$/.exec(o.option);
    if (!m || m[1] !== root) continue; // e.g. SPXW weeklies under SPX
    const key = m[2], K = (Number(m[4]) / 1000).toFixed(2);
    const exp = byExp[key] = byExp[key] || {};
    (exp[K] = exp[K] || {})[m[3]] = { b: Number(o.bid) || 0, a: Number(o.ask) || 0 };
  }
  const schedule = Object.keys(byExp).sort().map(key => {
    const y = 2000 + Number(key.slice(0, 2)), mo = Number(key.slice(2, 4)), day = Number(key.slice(4, 6));
    return { expiration: { day, month: MONTHS[mo - 1], year: y, code: Number('20' + key),
      dte: Math.round((Date.UTC(y, mo - 1, day) / 1000 - asOf) / 86400), timestamp: Date.UTC(y, mo - 1, day, 5) / 1000 } };
  });
  const n = 260, time = Array.from({ length: n }, (_, i) => asOf - (n - 1 - i) * 86400);
  return {
    ticker: root, source: 'Cboe delayed quotes (personal use; do not commit)', asOf: new Date(asOf * 1000).toISOString().slice(0, 10),
    schedule, chain: { underlyingSymbolQuote: { lastPrice: S }, resultByExpiration: byExp },
    close: Array(n).fill(S), time,
  };
}

async function main() {
  const sym = (process.argv[2] || '').toUpperCase(), file = process.argv[3];
  if (!sym) { console.error('usage: node tools/fetch-chain.js <TICKER> [downloaded-cboe.json]'); process.exit(2); }
  let raw;
  if (file) raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  else {
    const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(sym.replace(/^\^/, '_'))}.json`, { headers: { 'user-agent': 'Mozilla/5.0 (Implied fetch-chain)' } });
    if (!res.ok) throw new Error(`Cboe returned ${res.status} for ${sym}`);
    raw = await res.json();
  }
  const out = convert(sym, raw);
  const dir = path.join(__dirname, '../chains');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${out.ticker}-${out.asOf}-real.json`);
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`${out.ticker} $${out.chain.underlyingSymbolQuote.lastPrice} as of ${out.asOf}: ${out.schedule.length} expirations -> ${path.relative(process.cwd(), dest)}`);
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { convert };
