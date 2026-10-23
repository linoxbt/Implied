// Builds dist/implied.js: src/core.js (minus its Node export block) followed by
// src/indicator.js. That single file is what gets pasted into TrendSpider.
// `--check` fails if the committed dist file is out of date.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8')
  .replace(/\/\/ @node-only-start[\s\S]*?\/\/ @node-only-end\n?/, '');
const indicator = fs.readFileSync(path.join(root, 'src/indicator.js'), 'utf8');

const header = `// Implied v${pkg.version} — the options market's implied price distribution, painted into the future.
// Open source (Apache-2.0): https://github.com/linoxbt/Implied
// Built file: edit src/core.js and src/indicator.js, then run \`npm run build\`.
// #TSBuild26
`;
const out = header + '\n' + core.trimEnd() + '\n\n' + indicator;
const target = path.join(root, 'dist/implied.js');

if (/module\.exports|require\(/.test(out)) throw new Error('Node-only code leaked into the TrendSpider build');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) { console.error('dist/implied.js is stale: run `npm run build` and commit it.'); process.exit(1); }
  console.log('dist/implied.js is up to date');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  console.log('wrote dist/implied.js (' + out.split('\n').length + ' lines)');
}
