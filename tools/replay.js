// Replays a real options chain saved from the TrendSpider editor through the
// built script, then prints what each expiry produced and what would be painted.
//
//   node tools/replay.js chains/SPY-2026-10-23.json
//
// The JSON file holds { ticker, schedule, chain, close?, time? }, where schedule
// and chain are the raw results of request.options_schedule and
// request.options_data_for_all_expirations (see docs/verify-in-trendspider.md
// for the one-line dump snippet). Without close/time, a flat history at the
// chain's spot price is used.
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../src/core.js');
const { runIndicator } = require('../test/runtime.js');

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/replay.js <saved-chain.json> [expirations]'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const S = Number(data.chain?.underlyingSymbolQuote?.lastPrice);
  const close = data.close || Array(300).fill(S);
  const time = data.time || close.map((_, i) => Math.floor(Date.now() / 1000) - (close.length - 1 - i) * 86400);
  const expirations = Number(process.argv[3] || 4);

  console.log(`${data.ticker || 'ticker'}  spot ${S}  expiries in schedule: ${(data.schedule || []).length}\n`);
  const r = 0.04;
  const rows = (data.schedule || []).filter(e => e.expiration?.dte >= 1)
    .sort((a, b) => a.expiration.dte - b.expiration.dte).slice(0, expirations);
  for (const e of rows) {
    const byStrike = data.chain?.resultByExpiration?.[e.expiration.code];
    const T = e.expiration.dte / 365;
    const { F, pts } = core.cleanExpiry(byStrike, S, T, r, 0.5);
    const shape = core.modelExpiry(byStrike, S, T, r, 0.5, 8);
    const line = shape
      ? `F ${F.toFixed(2)}  strikes ${pts.length}  2.5/50/97.5%: ${shape.q[0].toFixed(2)} / ${shape.q[3].toFixed(2)} / ${shape.q[6].toFixed(2)}  skew ${shape.skew.toFixed(2)}  ${shape.fork ? core.forkLabel(shape.fork) : 'no Fork'}`
      : `skipped (${pts.length} usable strikes)`;
    console.log(`  ${String(e.expiration.dte).padStart(3)} dte  ${e.expiration.code}:  ${line}`);
  }

  const out = await runIndicator({
    ticker: data.ticker || 'TICKER', schedule: data.schedule, chain: data.chain, close, time,
    inputs: { 'Expirations to project': expirations },
  });
  console.log('\nScript result: ' + (out.error ? 'message "' + out.error + '"' : 'painted ' + out.projections.length + ' series, ' + out.fills.length + ' fills in ' + out.ms.toFixed(0) + ' ms'));
  out.projections.filter(p => !p.hidden).forEach(p => console.log('  legend: ' + p.name));
}

main().catch(e => { console.error(e); process.exit(1); });
