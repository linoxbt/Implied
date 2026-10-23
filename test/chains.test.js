// Regression: every chain saved under chains/ (real dumps from TrendSpider, or
// synthetic examples) must run through the built script without throwing and
// end either in a painted cloud or one of the documented on-chart messages.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runIndicator } = require('./runtime.js');

const dir = path.join(__dirname, '../chains');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
const MESSAGES = /^(No options data for |Not enough liquid strikes on |Implied runs on the Daily timeframe only\.)/;

for (const f of files) {
  test(`saved chain ${f}`, async () => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const S = Number(data.chain?.underlyingSymbolQuote?.lastPrice) || 100;
    const close = data.close || Array(300).fill(S);
    const time = data.time || close.map((_, i) => 1792800000 - (close.length - 1 - i) * 86400);
    const out = await runIndicator({ ticker: data.ticker || 'SAVED', schedule: data.schedule, chain: data.chain, close, time });
    if (out.error) assert.match(out.error, MESSAGES);
    else {
      assert.ok(out.projections.length >= 7);
      for (const p of out.projections.slice(0, 7)) assert.ok(p.series.every(v => v == null || Number.isFinite(v)));
    }
  });
}
