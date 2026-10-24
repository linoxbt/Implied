// Numbers quoted in the README and on the website must match what the code
// produces: the stress run (docs/stress.json, written by `npm run stress --
// --write` and checked in CI) and the settings the script declares.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const stress = JSON.parse(read('docs/stress.json'));
const n = v => v.toLocaleString('en-US');

test('README quotes the recorded stress-run numbers', () => {
  const readme = read('README.md');
  assert.ok(readme.includes(`${stress.forkFound} of ${stress.forkCases} two-outcome expiries`), 'Fork hit rate');
  assert.ok(readme.includes(`${stress.falseForks} false Forks in ${n(stress.oneOutcomeModelled)} one-outcome expiries`), 'false Forks');
  assert.ok(readme.includes(`(${stress.skipped} more were skipped`), 'skipped count');
});

test('website pages take stress numbers from docs/stress.json, never hard-coded', () => {
  for (const f of fs.readdirSync(path.join(root, 'web/pages'))) {
    const src = read('web/pages/' + f);
    assert.ok(!/\b357\b|1,861\b/.test(src), `${f} hard-codes a stress number; use %%STRESS_…%%`);
  }
});

test('the script page shows implied.js byte for byte (highlighting adds markup only)', () => {
  const { highlight } = require('../tools/highlight.js');
  const src = fs.readFileSync(path.join(__dirname, '../dist/implied.js'), 'utf8');
  const html = highlight(src, require('../web/assets/engine.js').GLOBALS);
  const text = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.equal(text, src);
  assert.equal((html.match(/<span class="l">/g) || []).length, src.split('\n').length - 1, 'one line span per source line');
  assert.ok(/<span class="a">paint_projection<\/span>/.test(html), 'TrendSpider API names are marked');
  assert.ok(/<span class="s">\/\\D\/g<\/span>/.test(html), 'a regex literal is not read as division');
});
