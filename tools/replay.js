// Replays an options chain saved from the TrendSpider editor through the built
// script and prints what it would paint, plus every expiry it could use.
//
//   node tools/replay.js chains/SPY-2026-10-23.json [expirations]
//
// The JSON holds { ticker, schedule, chain, close?, time? }: schedule and chain
// are the raw results of request.options_schedule and
// request.options_data_for_all_expirations (docs/verify-in-trendspider.md has
// the one-line dump snippet). Without close/time, a flat history at the
// chain's spot is used. Strikes are limited to 40 per side, as TrendSpider does.
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../src/core.js');
const engine = require('../web/assets/engine.js');

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/replay.js <saved-chain.json> [expirations]'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const S = Number(data.chain?.underlyingSymbolQuote?.lastPrice);
  const close = data.close || Array(300).fill(S);
  const time = data.time || close.map((_, i) => Math.floor(Date.now() / 1000) - (close.length - 1 - i) * 86400);
  const expirations = Number(process.argv[3] || 4);
  const chain = engine.limitStrikes(data.chain, 40, close[close.length - 1]);

  console.log(`${data.ticker || 'ticker'}  spot ${S}  expirations in schedule: ${(data.schedule || []).length}\n`);
  const byKey = {};
  for (const k of Object.keys(chain?.resultByExpiration || {})) byKey[core.expiryKey(k)] = chain.resultByExpiration[k];
  const rows = (data.schedule || []).filter(e => e.expiration?.dte >= 1 && e.expiration.dte < 100)
    .sort((a, b) => a.expiration.dte - b.expiration.dte);
  for (const e of rows) {
    const byStrike = byKey[core.expiryKey(e.expiration.code)];
    const T = e.expiration.dte / 365;
    const f = byStrike ? core.fitExpiry(byStrike, S, T, 0.04, 0.5, 8) : { ok: false, reason: 'not in the chain', pts: [] };
    let line = `skipped: ${f.reason} (${f.pts.length} usable strikes)`;
    if (f.ok) {
      const shape = core.describeShape(f.d, f.F, f.pts.map(p => p.K));
      line = `F ${f.F.toFixed(2)}  strikes ${f.pts.length}  2.5/50/97.5%: ${shape.q[0].toFixed(2)} / ${shape.q[3].toFixed(2)} / ${shape.q[6].toFixed(2)}  skew ${shape.skew.toFixed(2)}  ${shape.fork ? core.forkLabel(shape.fork) : 'no Fork'}`;
    }
    console.log(`  ${String(e.expiration.dte).padStart(3)} dte  ${e.expiration.code}:  ${line}`);
  }

  const out = await engine.runCode(fs.readFileSync(path.join(__dirname, '../dist/implied.js'), 'utf8'), {
    ticker: data.ticker || 'TICKER', schedule: data.schedule, chain: data.chain, close, time,
    inputs: { 'Expirations to project': expirations },
  });
  console.log('\nScript result: ' + (out.error ? 'message "' + out.error + '"' : 'painted ' + out.projections.length + ' series, ' + out.fills.length + ' fills in ' + out.ms.toFixed(0) + ' ms'));
  for (const o of out.overlays) for (const row of o.definition.rows) for (const c of row.cells) if (c.text) console.log('  panel: ' + c.text);
}

main().catch(e => { console.error(e); process.exit(1); });
