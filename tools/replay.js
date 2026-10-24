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
  const settings = { rate: 0.04, maxSpread: 0.5, minStrikes: 8 }; // the script's defaults

  console.log(`${data.ticker || 'ticker'}  spot ${S}  expirations in schedule: ${(data.schedule || []).length}\n`);
  // The same selection the script makes, so the table marks what it draws.
  const { candidates, shapes } = core.selectExpiries(Object.assign({
    schedule: data.schedule, resultByExpiration: chain?.resultByExpiration, spot: S > 0 ? S : close[close.length - 1],
    lastTime: Number(time[time.length - 1]), count: expirations, maxBars: 100, mode: 'calendar',
  }, settings));
  const drawn = new Set(shapes.map(s => s.key));
  for (const c of candidates) {
    const dte = Number(c.x.dte), T = dte / 365;
    const f = core.fitExpiry(c.byStrike, S, T, settings.rate, settings.maxSpread, settings.minStrikes);
    let line = `skipped: ${f.reason} (${f.pts.length} usable strikes)`;
    if (f.ok) {
      const shape = core.describeShape(f.d, f.F, f.pts.map(p => p.K));
      const fork = core.fitForkDiagnostics(f).fork; // the verdict the script draws, every check applied
      line = `F ${f.F.toFixed(2)}  strikes ${f.pts.length}  2.5/50/97.5%: ${shape.q[0].toFixed(2)} / ${shape.q[3].toFixed(2)} / ${shape.q[6].toFixed(2)}  skew ${shape.skew.toFixed(2)}  ${fork ? core.forkLabel(fork) : 'no Fork'}`;
    }
    console.log(`${drawn.has(c.key) ? '* ' : '  '}${String(dte).padStart(3)} dte  ${c.x.code}:  ${line}`);
  }
  console.log('\n* = drawn by the script');

  const out = await engine.runCode(fs.readFileSync(path.join(__dirname, '../dist/implied.js'), 'utf8'), {
    ticker: data.ticker || 'TICKER', schedule: data.schedule, chain: data.chain, close, time,
    inputs: { 'Expirations to project': expirations },
  });
  console.log('\nScript result: ' + (out.error ? 'message "' + out.error + '"' : 'painted ' + out.projections.length + ' series, ' + out.fills.length + ' fills in ' + out.ms.toFixed(0) + ' ms'));
  for (const o of out.overlays) for (const row of o.definition.rows) for (const c of row.cells) if (c.text) console.log('  panel: ' + c.text);
  if (out.crash) process.exitCode = 1; // a script error, not an on-chart message
}

main().catch(e => { console.error(e); process.exit(1); });
