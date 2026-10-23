// Every chain saved under chains/ must run through the built script and draw a
// cloud. Real dumps from TrendSpider go here (see docs/verify-in-trendspider.md);
// a file may instead declare `expectMessage` (a regular expression) when the
// chain is meant to end in an on-chart message.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runIndicator } = require('./runtime.js');

const dir = path.join(__dirname, '../chains');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];

for (const f of files) {
  test(`saved chain ${f}`, async () => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const S = Number(data.chain?.underlyingSymbolQuote?.lastPrice) || 100;
    const close = data.close || Array(300).fill(S);
    const time = data.time || close.map((_, i) => Math.floor(Date.now() / 1000) - (close.length - 1 - i) * 86400);
    const out = await runIndicator({ ticker: data.ticker || 'SAVED', schedule: data.schedule, chain: data.chain, close, time });
    if (data.expectMessage) { assert.match(out.error || '', new RegExp(data.expectMessage)); return; }
    assert.equal(out.error, null, f + ' should draw a cloud');
    for (const p of out.projections.slice(0, 7)) {
      assert.ok(p.series.some(v => v != null) && p.series.every(v => v == null || Number.isFinite(v)), p.name);
    }
  });
}
