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
<meta name="theme-color" content="#0b0e14">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${version}">
</head>
<body>
<a class="sr" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Implied home"><img src="/assets/logo-mark.svg" alt=""><b>implied</b></a>
  <div class="top-actions">
    <nav class="top-nav" aria-label="Main">${NAV.slice(1).map(n => `<a href="/${n.slug}/"${n.slug === slug ? ' aria-current="page"' : ''}>${n.name}</a>`).join('')}</nav>
    <button class="pill solid sm" type="button" data-copy>Copy the script</button>
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
    <div><div class="mono">Implied</div><p>A free, open-source TrendSpider indicator: the options market's implied price distribution, painted into the future. Built for the 2026 TrendSpider Hackathon (#TSBuild26).</p><button class="pill sm" data-copy>Copy the script</button></div>
    <div><div class="mono">Explore</div><a class="big" href="/lab/">Lab</a><a class="big" href="/fork/">The Fork</a><a class="big" href="/analyze/">Analyze a chain</a></div>
    <div><div class="mono">Learn</div><a class="big" href="/how-it-works/">How it works</a><a class="big" href="/validation/">Validation</a><a class="big" href="/install/">Install</a></div>
    <div><div class="mono">More</div><a class="big" href="${REPO}">Source on GitHub ↗</a><div class="clock"><i id="mk"></i><span id="clock">US equities</span></div></div>
  </div>
  <div class="bottom"><a class="brand" href="/"><img src="/assets/logo-mark.svg" alt=""><b>implied</b></a><span>Risk-neutral: the price of each outcome, not a forecast. Not investment advice. Apache-2.0.</span></div>
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
