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
  { slug: '', name: 'Home', blurb: 'What Implied is, with a live chart' },
  { slug: 'lab', name: 'Lab', blurb: 'Shape a market, watch the script paint it', app: 1 },
  { slug: 'fork', name: 'The Fork', blurb: 'When the market prices two outcomes', app: 1 },
  { slug: 'analyze', name: 'Analyze', blurb: 'Run a chain saved from TrendSpider', app: 1 },
  { slug: 'how-it-works', name: 'How it works', blurb: 'The pipeline, step by step, live', app: 2 },
  { slug: 'validation', name: 'Validation', blurb: 'Run the accuracy checks yourself', app: 2 },
  { slug: 'install', name: 'Install', blurb: 'One file into TrendSpider, about a minute' },
];
// Sidebar icons (16px, stroke).
const ICONS = {
  lab: '<path d="M6 2v4.5L2.5 13a1.3 1.3 0 0 0 1.2 2h8.6a1.3 1.3 0 0 0 1.2-2L10 6.5V2M5 2h6M4.5 10h7"/>',
  fork: '<path d="M2 13c2.5 0 3-9 6-9s3.5 9 6 9M8 4v9"/>',
  analyze: '<path d="M2 14V2M2 14h12M5 11V8M8 11V5M11 11V7"/>',
  'how-it-works': '<path d="M3 3h4v4H3zM9 9h4v4H9zM7 5h3a2 2 0 0 1 2 2v2"/>',
  validation: '<path d="M8 1.5 13.5 4v4c0 3.3-2.4 5.7-5.5 6.5C4.9 13.7 2.5 11.3 2.5 8V4zM5.5 8l1.8 1.8L10.8 6"/>',
  install: '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/>',
  home: '<path d="M2.5 7 8 2.5 13.5 7v6.5h-11zM6.5 13.5V9.5h3v4"/>',
};
const icon = k => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

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
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:url" content="${SITE}/${slug ? slug + '/' : ''}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${SITE}/${slug ? slug + '/' : ''}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${version}">
</head>`;
}

function menu(slug) {
  const nav = NAV.map((n, i) => `<a href="/${n.slug ? n.slug + '/' : ''}"${n.slug === slug ? ' aria-current="page"' : ''}><span class="n">0${i + 1}</span><span><b>${n.name}</b><small>${n.blurb}</small></span></a>`).join('');
  return `<div class="menu" id="menu" aria-hidden="true"><div class="wrap" style="display:flex;flex-direction:column;min-height:100%">
  <nav aria-label="Pages">${nav}</nav>
  <div class="menu-foot"><span>Implied v${pkg.version} · Apache-2.0 · #TSBuild26</span><span><a href="${REPO}">Source on GitHub ↗</a></span></div>
</div></div>`;
}

function scriptsOf(meta, version) {
  const order = ['core', 'engine', 'charts', 'results'];
  const sorted = (meta.scripts || []).slice().sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return `<div class="toast" role="status" aria-live="polite"></div>
<script src="/assets/app.js?v=${version}"></script>
${sorted.map(s => `<script src="/assets/${s}.js?v=${version}"></script>`).join('\n')}`;
}

const brand = `<a class="brand" href="/" aria-label="Implied home"><img src="/assets/logo-mark.svg" alt=""><b>Implied</b></a>`;

// Marketing pages: home, install, 404.
function siteLayout(meta, body, version) {
  const slug = meta.slug;
  const links = NAV.filter(n => n.slug && n.slug !== 'install').map(n => `<a href="/${n.slug}/"${n.slug === slug ? ' aria-current="page"' : ''}>${n.name}</a>`).join('');
  return `${head(meta, version)}
<body class="site${slug === '' ? ' home' : ''}">
<a class="sr" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  ${brand}
  <nav class="top-nav" aria-label="Main">${links}</nav>
  <div class="top-actions">
    <a class="pill ghost sm hide-sm" href="/install/">Install</a>
    <a class="pill navy sm" href="/lab/">Open the app <span class="arr">›</span></a>
    <button class="burger" type="button" aria-controls="menu" aria-expanded="false" aria-label="Open menu"><span></span></button>
  </div>
</div></header>
${menu(slug)}
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap">
  <div class="grid4">
    <div>${brand}<p>The options market's implied price distribution, painted into the future on your TrendSpider chart. Free and open source.</p><button class="pill sm" data-copy>Copy the script</button></div>
    <div><h5>Product</h5><a class="big" href="/lab/">Lab</a><a class="big" href="/fork/">The Fork</a><a class="big" href="/analyze/">Analyze a chain</a><a class="big" href="/install/">Install</a></div>
    <div><h5>Method</h5><a class="big" href="/how-it-works/">How it works</a><a class="big" href="/validation/">Validation</a><a class="big" href="${REPO}#how-it-works">Technical notes ↗</a></div>
    <div><h5>Project</h5><a class="big" href="${REPO}">GitHub ↗</a><a class="big" href="${REPO}/blob/main/LICENSE">Apache-2.0 ↗</a><div class="clock"><i id="mk"></i><span id="clock">US equities</span></div></div>
  </div>
  <div class="bottom"><span>© 2026 Implied · Built for the TrendSpider Hackathon (#TSBuild26)</span><span>Risk-neutral: the price of each outcome, not a forecast. Not investment advice.</span></div>
</div></footer>
${scriptsOf(meta, version)}
</body>
</html>
`;
}

// The tools: a workspace with a sidebar.
function appLayout(meta, body, version) {
  const slug = meta.slug;
  const group = g => NAV.filter(n => n.app === g).map(n => `<a href="/${n.slug}/"${n.slug === slug ? ' aria-current="page"' : ''}>${icon(n.slug)}${n.name}</a>`).join('');
  const page = NAV.find(n => n.slug === slug) || { name: meta.title };
  return `${head(meta, version)}
<body class="app">
<a class="sr" href="#main">Skip to content</a>
<header class="shell-top">
  <div class="left">${brand}<span class="ws">/ Workspace / <b>${esc(page.name)}</b></span></div>
  <div class="top-actions">
    <a class="pill ghost sm hide-sm" href="${REPO}">GitHub</a>
    <button class="pill solid sm" type="button" data-copy>Copy the script</button>
    <button class="burger" type="button" aria-controls="menu" aria-expanded="false" aria-label="Open menu"><span></span></button>
  </div>
</header>
${menu(slug)}
<nav class="tabs-sm" aria-label="Workspace">${NAV.filter(n => n.app).map(n => `<a href="/${n.slug}/"${n.slug === slug ? ' aria-current="page"' : ''}>${n.name}</a>`).join('')}</nav>
<div class="shell">
  <aside class="side" aria-label="Workspace">
    <h4>Workspace</h4>${group(1)}
    <h4>Method</h4>${group(2)}
    <h4>Get it</h4><a href="/install/">${icon('install')}Install</a><a href="/">${icon('home')}Home</a>
    <div class="side-card"><b>Runs the real script</b>Every page runs the same implied.js you paste into TrendSpider, on simulated chains.<button class="pill sm" data-copy>Copy the script</button></div>
  </aside>
  <main id="main" class="app-main">
${body}
    <div class="wrap"><div class="app-foot"><span>Implied v${pkg.version} · Apache-2.0 · #TSBuild26</span><span>Risk-neutral: the price of each outcome, not a forecast. <a href="/">Home</a> · <a href="${REPO}">GitHub</a></span></div></div>
  </main>
</div>
${scriptsOf(meta, version)}
</body>
</html>
`;
}

function layout(meta, body, version) {
  return NAV.some(n => n.slug === meta.slug && n.app) ? appLayout(meta, body, version) : siteLayout(meta, body, version);
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
  // Cache-busting version: a hash of every file the pages load.
  const hash = require('crypto').createHash('sha1');
  (function add(dir) {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) add(p); else hash.update(f).update(fs.readFileSync(p));
    }
  })(out);
  const version = hash.digest('hex').slice(0, 10);

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
