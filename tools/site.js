// Builds the project website into public/ (deployed to Netlify).
// Charts are drawn from the real script's paint calls on synthetic chains, and
// the downloadable implied.js is the built file itself, so the site always
// matches the code.  Usage: npm run site
'use strict';
const fs = require('fs');
const path = require('path');
const { runIndicator } = require('../test/runtime.js');
const fx = require('../test/fixtures.js');
const { chartSvg } = require('./preview.js');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const REPO = 'https://github.com/linoxbt/Implied';

const SHOWCASE = [
  { key: 'SPY', tab: 'Index', title: 'Lopsided risk', text: 'An equity index prices crash insurance. The downside tail is wider than the upside, and the legend says by how much.' },
  { key: 'EARN', tab: 'Earnings', title: 'The Fork', text: 'Before earnings, the market often prices two outcomes. The cloud splits, the orange ticks mark both, and the grey tick marks the least likely zone: the middle.' },
  { key: 'MEME', tab: 'High IV', title: 'Fat right tail', text: 'A high-volatility name with call skew. The upside tail stretches far beyond the downside: that is what the options market is paying for.' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const script = fs.readFileSync(path.join(root, 'dist/implied.js'), 'utf8');
  fs.writeFileSync(path.join(out, 'implied.js'), script);

  const panels = [];
  for (const s of SHOWCASE) {
    const { schedule, chain } = fx.SCENARIOS[s.key]();
    const c = fx.candles(chain.underlyingSymbolQuote.lastPrice);
    const res = await runIndicator({ ticker: s.key, schedule, chain, ...c });
    if (res.error) throw new Error(s.key + ': ' + res.error);
    const label = { SPY: 'Index ETF', EARN: 'Earnings stock', MEME: 'High-IV stock' }[s.key];
    panels.push({ ...s,
      dark: chartSvg(label, res, c.close, 'dark'), light: chartSvg(label, res, c.close, 'light') });
  }

  const tabs = panels.map((p, i) => `<button role="tab" id="tab-${p.key}" aria-controls="panel-${p.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${p.tab}</button>`).join('');
  const views = panels.map((p, i) => `
      <div class="panel" role="tabpanel" id="panel-${p.key}" aria-labelledby="tab-${p.key}"${i ? ' hidden' : ''}>
        <div class="chart chart-dark">${p.dark}</div>
        <div class="chart chart-light">${p.light}</div>
        <p class="caption"><strong>${p.title}.</strong> ${p.text}</p>
      </div>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Implied · Options Distribution</title>
<meta name="description" content="A free, open-source TrendSpider indicator that paints the options market's full implied price distribution into the future: skewed, fat-tailed, and sometimes split in two.">
<meta property="og:title" content="Implied: see the real shape of the bet">
<meta property="og:description" content="The options market's full implied distribution, painted on your TrendSpider chart. #TSBuild26">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#131722"/><path d="M5 16 C12 16 14 6 27 4 L27 28 C14 26 12 16 5 16Z" fill="#5b8def" fill-opacity=".45"/><path d="M5 16 C13 16 15 11 27 10 L27 22 C15 21 13 16 5 16Z" fill="#5b8def"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#ffffff; --bg-2:#f5f7fb; --surface:#ffffff; --line:#e3e7ef; --text:#141824; --muted:#5a6273;
  --accent:#3d6fe0; --accent-ink:#ffffff; --fork:#d9822b; --code-bg:#f2f4f9; --shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0d1017; --bg-2:#121620; --surface:#151a25; --line:#232a39; --text:#e6e9f0; --muted:#98a0b3;
    --accent:#5b8def; --accent-ink:#0d1017; --fork:#ffb347; --code-bg:#0f131c; --shadow:none; color-scheme: dark;
  }
}
:root[data-theme="dark"]{
  --bg:#0d1017; --bg-2:#121620; --surface:#151a25; --line:#232a39; --text:#e6e9f0; --muted:#98a0b3;
  --accent:#5b8def; --accent-ink:#0d1017; --fork:#ffb347; --code-bg:#0f131c; --shadow:none; color-scheme: dark;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px;gap:12px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;color:var(--text);text-decoration:none;letter-spacing:-.01em}
.brand svg{width:26px;height:26px}
nav{display:flex;gap:18px;align-items:center;font-size:14px}
nav a{color:var(--muted);text-decoration:none}
nav a:hover{color:var(--text)}
.tag{font:500 12px/1 'JetBrains Mono',monospace;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:6px 10px;white-space:nowrap}
.hero{padding:72px 0 40px}
.hero h1{font-size:clamp(34px,6vw,56px);line-height:1.05;letter-spacing:-.03em;margin:0 0 18px;max-width:16ch}
.hero p.lead{font-size:clamp(17px,2.2vw,20px);color:var(--muted);max-width:60ch;margin:0 0 28px}
.cta{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:10px;padding:12px 18px;font:600 15px/1 Inter,sans-serif;text-decoration:none;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--text)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.showcase{padding:8px 0 56px}
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.tabs button{font:500 14px/1 Inter,sans-serif;padding:9px 14px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--surface);color:var(--text);border-color:var(--accent)}
.frame{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow)}
.chart svg{display:block;width:100%;height:auto}
.chart-light{display:none}
:root[data-theme="light"] .chart-dark{display:none} :root[data-theme="light"] .chart-light{display:block}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]) .chart-dark{display:none} :root:not([data-theme="dark"]) .chart-light{display:block} }
.caption{margin:0;padding:14px 18px;border-top:1px solid var(--line);color:var(--muted);font-size:15px}
.caption strong{color:var(--text)}
section.block{padding:56px 0;border-top:1px solid var(--line)}
section.block h2{font-size:clamp(24px,3.4vw,32px);letter-spacing:-.02em;margin:0 0 8px}
section.block p.sub{color:var(--muted);margin:0 0 28px;max-width:62ch}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{border:1px solid var(--line);border-radius:12px;padding:18px;background:var(--surface)}
.card h3{margin:0 0 6px;font-size:16px}
.card p{margin:0;color:var(--muted);font-size:15px}
.sw{display:inline-block;width:28px;height:12px;border-radius:3px;vertical-align:middle;margin-right:8px}
.compare{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.compare .card h3{display:flex;align-items:center;gap:8px}
ol.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:10px}
ol.steps li{counter-increment:s;display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start;border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--surface)}
ol.steps li::before{content:counter(s);font:600 14px/28px 'JetBrains Mono',monospace;width:28px;height:28px;border-radius:8px;background:var(--bg-2);border:1px solid var(--line);text-align:center;color:var(--accent)}
ol.steps b{display:block}
ol.steps span{color:var(--muted);font-size:15px}
.formula{font:500 15px/1.5 'JetBrains Mono',monospace;background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;margin:0 0 24px}
.install{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start}
.install ol{margin:0;padding-left:20px}
.install li{margin:0 0 10px}
pre.code{margin:0;background:var(--code-bg);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font:13px/1.55 'JetBrains Mono',monospace;max-height:280px;overflow:auto;color:var(--muted)}
.stats{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.stat{border:1px solid var(--line);border-radius:12px;padding:18px;background:var(--surface)}
.stat .n{font:700 30px/1.1 Inter,sans-serif;letter-spacing:-.02em}
.stat .l{color:var(--muted);font-size:14px;margin-top:6px}
.note{border-left:3px solid var(--accent);padding:4px 0 4px 14px;color:var(--muted);margin:28px 0 0;max-width:70ch}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--muted);font-size:14px}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
@media (max-width:640px){ nav .hide-sm{display:none} .hero{padding:48px 0 28px} }
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="#"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#131722"/><path d="M5 16 C12 16 14 6 27 4 L27 28 C14 26 12 16 5 16Z" fill="#5b8def" fill-opacity=".45"/><path d="M5 16 C13 16 15 11 27 10 L27 22 C15 21 13 16 5 16Z" fill="#5b8def"/></svg>Implied</a>
  <nav><a class="hide-sm" href="#read">How to read</a><a class="hide-sm" href="#how">How it works</a><a href="#install">Install</a><a href="${REPO}">GitHub</a><span class="tag hide-sm">#TSBuild26</span></nav>
</div></header>

<main>
<section class="hero"><div class="wrap">
  <h1>See the real shape of the bet.</h1>
  <p class="lead">Implied is a free, open-source TrendSpider indicator. It reads the live options chain and paints the probability distribution the market is pricing into the future on your chart: skewed, fat-tailed, and sometimes split in two.</p>
  <div class="cta">
    <button class="btn primary" data-copy>Copy the script</button>
    <a class="btn" href="${REPO}">View source on GitHub</a>
  </div>
</div></section>

<section class="showcase" aria-label="Examples"><div class="wrap">
  <div class="tabs" role="tablist" aria-label="Example charts">${tabs}</div>
  <div class="frame">${views}
  </div>
</div></section>

<section class="block" id="read"><div class="wrap">
  <h2>How to read it</h2>
  <p class="sub">The cloud starts at the last close and runs out to each expiry. Exact prices for every band are in the indicator's legend and on hover.</p>
  <div class="grid">
    <div class="card"><h3><span class="sw" style="background:#5b8def;opacity:.75"></span>Dense core</h3><p>25th to 75th percentile. Half of the probability sits here.</p></div>
    <div class="card"><h3><span class="sw" style="background:#5b8def;opacity:.4"></span>Middle bands</h3><p>10th to 90th percentile: the 80% range.</p></div>
    <div class="card"><h3><span class="sw" style="background:#5b8def;opacity:.18"></span>Faint tails</h3><p>2.5th to 97.5th percentile: the 95% range. One side wider than the other is the skew.</p></div>
    <div class="card"><h3><span class="sw" style="background:repeating-linear-gradient(90deg,#9aa0b4 0 3px,transparent 3px 6px)"></span>Dotted line</h3><p>The median outcome: the market's middle case.</p></div>
    <div class="card"><h3><span class="sw" style="background:var(--fork)"></span>The Fork</h3><p>Two outcomes priced at once, common before earnings. The grey tick between them is the least likely zone.</p></div>
    <div class="card"><h3><span class="sw" style="background:var(--muted);opacity:.5"></span>Legend tags</h3><p>"Downside tail 1.4× upside" or "Fork: $182 / $201 · least likely $190" turn the shape into a sentence.</p></div>
  </div>
</div></section>

<section class="block"><div class="wrap">
  <h2>Not another expected-move cone</h2>
  <p class="sub">Every expected-move tool assumes a symmetric bell curve. Implied recovers the distribution the market is actually pricing.</p>
  <div class="compare">
    <div class="card"><h3>Expected-move cone</h3><p>One number from the at-the-money straddle, drawn as a symmetric range. The same width up and down, one peak, by construction.</p></div>
    <div class="card"><h3 style="color:var(--accent)">Implied</h3><p>The full density from every liquid strike. Lopsided when the market is, fat-tailed when it is, and split in two when the market is betting on two outcomes.</p></div>
  </div>
</div></section>

<section class="block" id="how"><div class="wrap">
  <h2>How it works</h2>
  <p class="sub">Breeden and Litzenberger (1978): the market's price density is the discounted second derivative of the call price with respect to strike.</p>
  <pre class="formula">f(K) = e^(rT) · ∂²C(K, T) / ∂K²</pre>
  <ol class="steps">
    <li><div><b>Clean the quotes</b><span>Mid of bid and ask; drop zero bids, inverted quotes and spreads wider than your setting.</span></div></li>
    <li><div><b>Find the forward</b><span>Put-call parity at the strikes nearest spot. This absorbs dividends and borrow cost with no extra inputs.</span></div></li>
    <li><div><b>Solve implied volatility</b><span>Black-76 on out-of-the-money quotes only, the liquid side of the chain.</span></div></li>
    <li><div><b>Fit a smooth smile</b><span>A smoothing spline in total variance, each quote weighted by its bid-ask spread, with the smoothing chosen by the data (generalized cross-validation). Flexible enough to catch a two-outcome market, steady enough not to invent one.</span></div></li>
    <li><div><b>Take the density</b><span>Rebuild clean call prices from the smile and differentiate twice on a 241-point grid.</span></div></li>
    <li><div><b>Read the shape</b><span>Percentile bands, the skew ratio, and the Fork: two clear peaks with a deep valley between them.</span></div></li>
    <li><div><b>Project it forward</b><span>Each band widens with the square root of time between expiries, starting from the last close.</span></div></li>
  </ol>
</div></section>

<section class="block" id="install"><div class="wrap">
  <h2>Install in TrendSpider</h2>
  <p class="sub">One file, no server, no API key. TrendSpider hosts the code, the data and the runtime.</p>
  <div class="install">
    <div>
      <ol>
        <li>Open TrendSpider's Custom JS indicator editor and create a new indicator.</li>
        <li>Paste the script and save. <button class="btn" data-copy style="padding:8px 12px;font-size:14px;margin-left:4px">Copy</button> or <a href="implied.js" download>download implied.js</a>.</li>
        <li>Add it to a <b>Daily</b> chart of any ticker with listed options. Options data needs TrendSpider's OPRA subscription.</li>
      </ol>
      <p style="color:var(--muted);font-size:15px;margin:14px 0 0">Five settings with safe defaults: expirations to project (4), risk-free rate (4%), max bid-ask spread (0.5 of mid), minimum strikes per expiry (8), Fork on/off.</p>
    </div>
    <pre class="code" aria-label="Start of implied.js">${esc(script.split('\n').slice(0, 24).join('\n'))}\n…</pre>
  </div>
</div></section>

<section class="block"><div class="wrap">
  <h2>Tested before it touches a chart</h2>
  <p class="sub">The script runs unchanged against a mock of TrendSpider's runtime, on option chains priced from known distributions with realistic bid-ask spreads and quote noise.</p>
  <div class="stats">
    <div class="stat"><div class="n">95 / 96</div><div class="l">two-outcome earnings chains where the Fork was found</div></div>
    <div class="stat"><div class="n">0 / 2,250</div><div class="l">false Forks on one-outcome chains in a stress run</div></div>
    <div class="stat"><div class="n">&lt; 1 pt</div><div class="l">probability error on every band, skewed smiles, 7 to 90 days</div></div>
    <div class="stat"><div class="n">~0.2 s</div><div class="l">to model and paint 8 expiries; one schedule and one chain request</div></div>
  </div>
  <p class="note">This is the market's risk-neutral distribution: the price of each outcome. It includes risk premia, so it is not a guaranteed forecast of real-world odds.</p>
</div></section>
</main>

<footer><div class="wrap">
  <span>Implied v${pkg.version} · Apache-2.0 · Built for the 2026 TrendSpider Hackathon, Most Unique Options Indicator · #TSBuild26</span>
  <span><a href="${REPO}">Source</a> · Not investment advice</span>
</div></footer>
<div class="toast" role="status" aria-live="polite"></div>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function select(t) {
    tabs.forEach(function (b) {
      var on = b === t;
      b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { select(b); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; select(n); n.focus(); }
    });
  });
  var toast = document.querySelector('.toast'), timer;
  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 2200); }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fetch('implied.js').then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (t) { return navigator.clipboard.writeText(t); })
        .then(function () { say('Copied. Paste it into the TrendSpider editor.'); })
        .catch(function () { say('Copy failed. Use the download link instead.'); });
    });
  });
})();
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  console.log('wrote public/index.html (' + Math.round(html.length / 1024) + ' KB) and public/implied.js');
}

main().catch(e => { console.error(e); process.exit(1); });
