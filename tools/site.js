// Builds the Implied website into public/ (deployed to Netlify).
// Each file in web/pages/ becomes its own page, wrapped in the shared header
// (logo + hamburger menu) and footer. Pages run the real script in the
// browser: assets/core.js is src/core.js, and /implied.js is the built file.
//   npm run site
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const out = path.join(root, 'public');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const REPO = 'https://github.com/linoxbt/Implied';
const SITE = 'https://implied.netlify.app';
const { coreForBrowser } = require('./build.js');

const NAV = [
  { slug: '', name: 'Home', blurb: 'Search a ticker, see the market table' },
  { slug: 'symbol', name: 'Explore', blurb: 'Distribution, projection, skew, expected move, chain' },
  { slug: 'lab', name: 'Lab', blurb: 'Shape a market, watch the script paint it' },
  { slug: 'fork', name: 'The Fork', blurb: 'When the market prices two outcomes' },
  { slug: 'analyze', name: 'Analyze', blurb: 'Run a chain saved from TrendSpider' },
  { slug: 'how-it-works', name: 'How it works', blurb: 'The pipeline, step by step, live' },
  { slug: 'validation', name: 'Validation', blurb: 'Run the accuracy checks yourself' },
  { slug: 'install', name: 'Install', blurb: 'One file into TrendSpider, about a minute' },
];
const { TICKERS, GLOBALS } = require('../web/assets/engine.js');
let VERSION = '';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Stress-run numbers, from docs/stress.json (written by `npm run stress -- --write`).
const STRESS = JSON.parse(fs.readFileSync(path.join(root, 'docs/stress.json'), 'utf8'));
function stressValue(k) {
  const v = { FOUND: STRESS.forkFound, CASES: STRESS.forkCases, FALSE: STRESS.falseForks, MODELLED: STRESS.oneOutcomeModelled }[k];
  if (v == null) throw new Error('unknown stress token ' + k);
  return v.toLocaleString('en-US');
}

function testList() {
  const rows = [];
  for (const f of fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.js')).sort()) {
    const src = fs.readFileSync(path.join(root, 'test', f), 'utf8');
    for (const m of src.matchAll(/\btest\((['"`])(.+?)\1,/g)) rows.push(`<tr><td class="l"><code>${esc(f)}</code></td><td class="l">${esc(m[2].replace(/\\(['"`])/g, '$1').replace('${f}', '(each file in chains/)'))}</td></tr>`);
  }
  return rows.join('');
}

function head(meta, version) {
  const slug = meta.slug;
  const title = slug === '' ? 'Implied · ' + meta.title : meta.title + ' · Implied';
  return `<!doctype html>
<html lang="en" data-v="${version}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:image" content="${SITE}/assets/og.png?v=${version}">
<meta property="og:url" content="${SITE}/${slug ? slug + '/' : ''}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
${meta.file === '404.html' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${SITE}/${slug ? slug + '/' : ''}">`}
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg?v=${version}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png?v=${version}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${version}">
</head>`;
}

const link = (slug, name, cur) => `<a href="/${slug ? slug + '/' : ''}"${slug === cur ? ' aria-current="page"' : ''}>${name}</a>`;
const RESOURCES = ['how-it-works', 'validation', 'analyze', 'install'];

function header(slug) {
  const res = NAV.filter(n => RESOURCES.includes(n.slug));
  return `<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Implied home"><img src="/assets/logo-mark.svg?v=${VERSION}" alt=""><b>Implied</b></a>
  <nav class="top-nav" aria-label="Main">
    ${link('', 'Home', slug)}${link('symbol', 'Explore', slug)}${link('lab', 'Lab', slug)}${link('fork', 'The Fork', slug)}
    <div class="dd"><button type="button" class="dd-btn" aria-expanded="false"${RESOURCES.includes(slug) ? ' data-current' : ''}>Resources <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
      <div class="dd-menu">${res.map(n => `<a href="/${n.slug}/"><b>${n.name}</b><small>${n.blurb}</small></a>`).join('')}</div></div>
    <button type="button" class="icon-btn" data-search aria-label="Search tickers and pages"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  </nav>
  <div class="top-actions">
    <a class="nav-link hide-sm" href="/install/">Install</a>
    <button class="btn primary" type="button" data-copy>Copy script</button>
    <button class="icon-btn only-sm" type="button" data-search aria-label="Search"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <button class="burger" type="button" aria-controls="menu" aria-expanded="false" aria-label="Open menu"><span></span></button>
  </div>
</div></header>
<div class="menu" id="menu" aria-hidden="true"><div class="wrap">
  <nav aria-label="Pages">${NAV.map(n => `<a href="/${n.slug ? n.slug + '/' : ''}"${n.slug === slug ? ' aria-current="page"' : ''}><b>${n.name}</b><small>${n.blurb}</small></a>`).join('')}</nav>
</div></div>
<div class="cmdk" id="cmdk" hidden><div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Search">
  <div class="cmdk-in"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="cmdk-q" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" placeholder="Search ticker or page" aria-label="Search tickers and pages" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
  <div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results">
    <div role="group" aria-label="Tickers (simulated chains)"><p class="cmdk-h" aria-hidden="true">Tickers (simulated chains)</p>
    ${TICKERS.map(t => `<a role="option" aria-selected="false" href="/symbol/?t=${t.sym}" data-k="${t.sym} ${esc(t.name)}"><b>${t.sym}</b><span>${esc(t.name)}</span></a>`).join('')}
    <a role="option" aria-selected="false" href="/analyze/" data-k="analyze your own chain upload trendspider"><b>Your chain</b><span>Analyze a chain saved from TrendSpider</span></a></div>
    <div role="group" aria-label="Pages"><p class="cmdk-h" aria-hidden="true">Pages</p>
    ${NAV.filter(n => n.slug && n.slug !== 'symbol').map(n => `<a role="option" aria-selected="false" href="/${n.slug}/" data-k="${n.name} ${esc(n.blurb)}"><b>${n.name}</b><span>${esc(n.blurb)}</span></a>`).join('')}</div>
  </div>
  <p class="cmdk-empty" role="status" hidden>No match. This site has simulated tickers only; in TrendSpider, Implied reads any ticker with listed US options.</p>
</div>
</div></div>`;
}

function footer() {
  return `<footer class="foot"><div class="wrap">
  <div class="foot-grid">
    <div><a class="brand" href="/"><img src="/assets/logo-mark.svg?v=${VERSION}" alt=""><b>Implied</b></a><p>The options market's full implied probability distribution, painted into the future on your TrendSpider chart. Free and open source.</p></div>
    <div><h2>Product</h2><a href="/symbol/">Explore</a><a href="/lab/">Lab</a><a href="/fork/">The Fork</a><a href="/analyze/">Analyze a chain</a></div>
    <div><h2>Resources</h2><a href="/how-it-works/">How it works</a><a href="/validation/">Validation</a><a href="/install/">Install</a><a href="${REPO}">GitHub</a></div>
    <div><h2>Market</h2><div class="clock"><i id="mk"></i><span id="clock">US equities</span></div><p class="small">Charts on this site use simulated chains. In TrendSpider, Implied reads the live options market.</p></div>
  </div>
  <div class="bottom"><span>© 2026 Implied · Apache-2.0 · Built for the TrendSpider Hackathon (#TSBuild26)</span><span>Risk-neutral: the price of each outcome, not a forecast. Not investment advice.</span></div>
</div></footer>`;
}

function scriptsOf(meta, version) {
  const scripts = (meta.scripts || []).slice();
  if (scripts.includes('engine')) scripts.push('implied-fn');
  const order = ['core', 'implied-fn', 'engine', 'charts', 'plot', 'results', 'market'];
  const sorted = scripts.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return `<div class="toast" role="status" aria-live="polite"></div>
<script src="/assets/app.js?v=${version}"></script>
${sorted.map(s => `<script src="/assets/${s}.js?v=${version}"></script>`).join('\n')}`;
}

function layout(meta, body, version) {
  return `${head(meta, version)}
<body${meta.slug === '' ? ' class="home"' : ''}>
<a class="sr" href="#main">Skip to content</a>
${header(meta.slug)}
<main id="main">
${body}
</main>
${footer()}
${scriptsOf(meta, version)}
</body>
</html>
`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

function main() {
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(web, 'assets'), path.join(out, 'assets'));
  const script = fs.readFileSync(path.join(root, 'dist/implied.js'), 'utf8');
  fs.writeFileSync(path.join(out, 'implied.js'), script);
  fs.writeFileSync(path.join(out, 'assets/core.js'), coreForBrowser());
  // The script pre-wrapped as a function of TrendSpider's globals, so the
  // pages run it without eval (the CSP forbids eval).
  fs.writeFileSync(path.join(out, 'assets/implied-fn.js'), '// Built from dist/implied.js by tools/site.js. Do not edit.\nself.__impliedScript = async function (' + GLOBALS.join(', ') + ') {\n"use strict";\n' + script + '\n};\n');
  // Cache-busting version: a hash of every file the pages load.
  const hash = require('crypto').createHash('sha1');
  (function add(dir) {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) add(p); else hash.update(f).update(fs.readFileSync(p));
    }
  })(out);
  const version = hash.digest('hex').slice(0, 10);
  VERSION = version;

  const pages = fs.readdirSync(path.join(web, 'pages')).filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const src = fs.readFileSync(path.join(web, 'pages', f), 'utf8');
    const m = src.match(/^<!--(\{[\s\S]*?\})-->\n/);
    if (!m) throw new Error(f + ': missing page metadata comment');
    const meta = JSON.parse(m[1]);
    const body = src.slice(m[0].length).replace('%%TESTS%%', testList()).replace(/%%STRESS_(\w+)%%/g, (m, k) => stressValue(k));
    for (const s of meta.scripts || []) if (!fs.existsSync(path.join(out, 'assets', s + '.js'))) throw new Error(f + ': missing script ' + s);
    const file = meta.file ? path.join(out, meta.file) : path.join(out, meta.slug, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, layout(meta, body, version));
  }
  console.log('wrote ' + pages.length + ' pages to public/');
}

main();
