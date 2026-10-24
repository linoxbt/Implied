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
