// Renders what dist/implied.js paints for each synthetic scenario into
// preview/index.html (dark and light chart themes), drawn from the mock
// runtime's recorded paint calls, so the visual design can be checked
// without TrendSpider. Usage: npm run preview
'use strict';
const fs = require('fs');
const path = require('path');
const { runIndicator } = require('../test/runtime.js');
const fx = require('../test/fixtures.js');

const THEMES = {
  dark: { bg: '#131722', grid: '#1f2433', text: '#b2b5be', price: '#d1d4dc' },
  light: { bg: '#ffffff', grid: '#eef0f4', text: '#4a4f5c', price: '#1f2136' },
};
const W = 900, H = 420, PAD = { l: 10, r: 70, t: 54, b: 24 };
const HISTORY = 126; // ~6 months of daily candles, per the screenshot spec

function chartSvg(name, out, close, theme) {
  const th = THEMES[theme];
  const hist = close.slice(-HISTORY);
  const proj = out.projections;
  const futureLen = proj.length ? Math.max(...proj[0].series.map((v, i) => (v != null ? i : 0))) : 0;
  const n = HISTORY + futureLen;
  const vals = hist.slice();
  proj.forEach(p => p.series.forEach(v => { if (v != null) vals.push(v); }));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = i => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const fx0 = HISTORY - 1; // bar 0 of the projection = last candle
  const parts = [`<rect width="${W}" height="${H}" fill="${th.bg}"/>`];

  for (let g = 0; g <= 5; g++) {
    const v = lo + (g / 5) * (hi - lo), yy = y(v).toFixed(1);
    parts.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yy}" y2="${yy}" stroke="${th.grid}"/>`,
      `<text x="${W - PAD.r + 6}" y="${(+yy + 4).toFixed(1)}" fill="${th.text}" font-size="11">${v.toFixed(v < 100 ? 2 : 0)}</text>`);
  }
  parts.push(`<polyline fill="none" stroke="${th.price}" stroke-width="1.4" points="${hist.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')}"/>`);

  for (const f of out.fills) {
    const a = proj[f.a].series, b = proj[f.b].series, idx = [];
    for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) idx.push(i);
    const pts = idx.map(i => `${x(fx0 + i).toFixed(1)},${y(a[i]).toFixed(1)}`)
      .concat(idx.slice().reverse().map(i => `${x(fx0 + i).toFixed(1)},${y(b[i]).toFixed(1)}`));
    parts.push(`<polygon points="${pts.join(' ')}" fill="${f.color}" fill-opacity="${f.opacity}"/>`);
  }
  for (const p of proj) {
    if (p.hidden) continue;
    const dash = p.style === 'dotted' ? '2 3' : p.style === 'dashed' ? '6 4' : '';
    let seg = [];
    const flush = () => {
      if (seg.length) parts.push(`<polyline fill="none" stroke="${p.color}" stroke-width="${p.color === '#ffb347' ? 2.5 : 1.5}" stroke-dasharray="${dash}" points="${seg.join(' ')}"/>`);
      seg = [];
    };
    p.series.forEach((v, i) => { if (v == null) flush(); else seg.push(`${x(fx0 + i).toFixed(1)},${y(v).toFixed(1)}`); });
    flush();
  }
  // Legend, as TrendSpider lists visible series names
  const legend = [name + ' · Implied'].concat(proj.filter(p => !p.hidden).map(p => p.name));
  legend.forEach((t, i) => parts.push(`<text x="${PAD.l + 4}" y="${16 + i * 15}" fill="${i ? th.text : th.price}" font-size="${i ? 11 : 12}" font-weight="${i ? 400 : 600}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`));
  parts.push(`<line x1="${x(fx0)}" x2="${x(fx0)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="${th.grid}" stroke-dasharray="3 3"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, Segoe UI, Roboto, sans-serif">${parts.join('')}</svg>`;
}

async function main() {
  const dir = path.join(__dirname, '../preview');
  fs.mkdirSync(dir, { recursive: true });
  const blocks = [];
  for (const name of ['SPY', 'EARN', 'MEME']) {
    const { schedule, chain } = fx.SCENARIOS[name]();
    const c = fx.candles(chain.underlyingSymbolQuote.lastPrice);
    const out = await runIndicator({ ticker: name, schedule, chain, ...c });
    if (out.error) throw new Error(name + ': ' + out.error);
    for (const theme of ['dark', 'light']) {
      const svg = chartSvg(name, out, c.close, theme);
      fs.writeFileSync(path.join(dir, `${name}-${theme}.svg`), svg);
      blocks.push(`<figure><figcaption>${name} · ${theme}</figcaption>${svg}</figure>`);
    }
  }
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Implied preview</title>
<style>body{margin:16px;background:#0b0d12;color:#ccc;font:13px sans-serif;display:grid;grid-template-columns:repeat(auto-fill,minmax(900px,1fr));gap:16px}figure{margin:0}figcaption{margin:4px 0}</style>
${blocks.join('\n')}`);
  console.log('wrote preview/index.html and ' + blocks.length + ' SVGs');
}

main().catch(e => { console.error(e); process.exit(1); });
