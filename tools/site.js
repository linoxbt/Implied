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

const NAV = [
  { slug: '', name: 'Home', blurb: 'What Implied is, with a live chart' },
  { slug: 'lab', name: 'Lab', blurb: 'Shape a market, watch the script paint it' },
  { slug: 'fork', name: 'The Fork', blurb: 'When the market prices two outcomes' },
  { slug: 'analyze', name: 'Analyze', blurb: 'Run a chain saved from TrendSpider' },
  { slug: 'how-it-works', name: 'How it works', blurb: 'The pipeline, step by step, live' },
  { slug: 'validation', name: 'Validation', blurb: 'Run the accuracy checks yourself' },
  { slug: 'install', name: 'Install', blurb: 'One file into TrendSpider, about a minute' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const burst = Array.from({ length: 28 }, (_, i) => { const a = Math.PI * i / 14, r = i % 2 ? 41 : 50; return (50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1); }).join(' ');

function testList() {
  const rows = [];
  for (const f of fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.js')).sort()) {
    const src = fs.readFileSync(path.join(root, 'test', f), 'utf8');
    for (const m of src.matchAll(/\btest\((['`])(.+?)\1/g)) rows.push(`<tr><td class="l"><code>${esc(f)}</code></td><td class="l">${esc(m[2].replace('${f}', '(each file in chains/)'))}</td></tr>`);
  }
  return rows.join('');
}

function layout(meta, body, version) {
  const slug = meta.slug;
  const title = slug === '' ? 'Implied · ' + meta.title : meta.title + ' · Implied';
  const scripts = ['app'].concat(meta.scripts || []);
  const nav = NAV.map((n, i) => `<a href="/${n.slug ? n.slug + '/' : ''}"${n.slug === slug ? ' aria-current="page"' : ''}><span class="n">0${i + 1}</span><span><b>${n.name}</b><small>${n.blurb}</small></span></a>`).join('');
  const order = ['core', 'engine', 'charts', 'results'];
  const sorted = scripts.filter(s => s !== 'app').sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.toLowerCase())}</title>
<meta name="description" content="${esc(meta.description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:image" content="/assets/og.png">
<meta name="theme-color" content="#f4f4f2">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${version}">
</head>
<body>
<a class="sr" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Implied home"><img src="/assets/logo-mark.svg" alt=""><b>implied</b></a>
  <div class="top-actions">
    ${slug === 'lab' ? '' : '<a class="pill solid sm" href="/lab/">Open the Lab</a>'}
    <button class="burger" type="button" aria-controls="menu" aria-expanded="false" aria-label="Open menu"><span></span></button>
  </div>
</div></header>
<div class="menu" id="menu" aria-hidden="true"><div class="wrap" style="display:flex;flex-direction:column;min-height:100%">
  <nav aria-label="Pages">${nav}</nav>
  <div class="menu-foot"><span>Implied v${pkg.version} · Apache-2.0 · #TSBuild26</span><span><a href="${REPO}">Source on GitHub ↗</a></span></div>
</div></div>
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap">
  <div class="grid4">
    <div><div class="mono">Implied</div><p>free, open-source trendspider indicator. #tsbuild26</p><button class="pill solid sm" data-copy>Copy the script</button></div>
    <div><div class="mono">Explore</div><a class="big" href="/lab/">Lab</a><a class="big" href="/fork/">The Fork</a><a class="big" href="/analyze/">Analyze</a></div>
    <div><div class="mono">Learn</div><a class="big" href="/how-it-works/">How it works</a><a class="big" href="/validation/">Validation</a><a class="big" href="/install/">Install</a></div>
    <div><div class="mono">More</div><a class="big" href="${REPO}">Source ↗</a><div class="clock"><i id="mk"></i><span id="clock">US equities</span></div></div>
  </div>
  <div class="bottom"><a class="brand" href="/"><img src="/assets/logo-mark.svg" alt="" style="width:24px;height:24px"><b style="font-size:19px">implied</b></a><span>Risk-neutral: the price of each outcome, not a forecast. Not investment advice.</span></div>
</div></footer>
<div class="toast" role="status" aria-live="polite"></div>
<script src="/assets/app.js?v=${version}"></script>
${sorted.map(s => `<script src="/assets/${s}.js?v=${version}"></script>`).join('\n')}
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
  const core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8').replace(/\/\/ @node-only-start[\s\S]*?\/\/ @node-only-end\n?/, '');
  fs.writeFileSync(path.join(out, 'assets/core.js'), core);
  const version = require('crypto').createHash('sha1').update(script + fs.readdirSync(path.join(web, 'assets')).join()).digest('hex').slice(0, 8);

  const pages = fs.readdirSync(path.join(web, 'pages')).filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const src = fs.readFileSync(path.join(web, 'pages', f), 'utf8');
    const m = src.match(/^<!--(\{[\s\S]*?\})-->\n/);
    if (!m) throw new Error(f + ': missing page metadata comment');
    const meta = JSON.parse(m[1]);
    const body = src.slice(m[0].length).replace('%%BURST%%', burst).replace('%%TESTS%%', testList());
    for (const s of meta.scripts || []) if (!fs.existsSync(path.join(out, 'assets', s + '.js'))) throw new Error(f + ': missing script ' + s);
    const file = meta.file ? path.join(out, meta.file) : path.join(out, meta.slug, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, layout(meta, body, version));
  }
  console.log('wrote ' + pages.length + ' pages to public/');
}

main();
