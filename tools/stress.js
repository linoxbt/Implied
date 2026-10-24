// The wider Fork stress run quoted in the README: 360 two-outcome expiries
// (must be detected) and 2,250 one-outcome expiries (must not be), over 30
// random quote sets, three spread/noise levels, several smiles and horizons.
//   npm run stress
'use strict';
const core = require('../src/core.js');
const fx = require('../test/fixtures.js');

const r = 0.04;
const model = (byStrike, S, dte) => core.modelExpiry(byStrike, S, dte / 365, r, 0.5, 8);
let hits = 0, tot = 0, falses = 0, ftot = 0, skipped = 0;
const t0 = Date.now();
for (let seed = 1; seed <= 30; seed++) {
  for (const [spreadPct, noise] of [[0.01, 1], [0.03, 1], [0.05, 0.5]]) {
    for (const [dte, jump, w] of [[7, 0.07, 0.5], [10, 0.08, 0.6], [14, 0.09, 0.5], [21, 0.10, 0.4]]) {
      const { byStrike } = fx.expiryQuotes({ S: 190, r, T: dte / 365, model: fx.mix(190, dte, jump, 0.20, w), spreadPct, noise, seed });
      const s = model(byStrike, 190, dte);
      tot++; if (s && s.fork) hits++;
    }
    for (const [m, S] of [[fx.smile(0.15, -0.55, 1.2), 580], [fx.smile(1.1, 0.45, 0.6), 24], [fx.smile(0.3, -0.2, 0.8), 190], [fx.smile(0.45, -0.1, 2.5), 60], [fx.smile(0.6, -0.3, 4), 45]]) {
      for (const dte of [1, 3, 7, 30, 90]) {
        const { byStrike } = fx.expiryQuotes({ S, r, T: dte / 365, model: m, spreadPct, noise, seed });
        const s = model(byStrike, S, dte);
        if (!s) { skipped++; continue; }
        ftot++; if (s.fork) falses++;
      }
    }
  }
}
console.log(`two-outcome expiries: Fork found in ${hits}/${tot}`);
console.log(`one-outcome expiries: ${falses} false Forks in ${ftot} modelled (${skipped} skipped as too thin)`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
// The README and the website quote these numbers; `--write` records them in
// docs/stress.json (CI fails if that file is out of date, and a test checks
// every page and the README against it).
if (process.argv.includes('--write')) {
  const file = require('path').join(__dirname, '../docs/stress.json');
  require('fs').writeFileSync(file, JSON.stringify({ forkFound: hits, forkCases: tot, falseForks: falses, oneOutcomeModelled: ftot, skipped }, null, 2) + '\n');
  console.log('wrote docs/stress.json');
}
process.exit(hits / tot >= 0.95 && falses === 0 ? 0 : 1);
