// Browser smoke test of the built site: serves public/ with the production
// Content-Security-Policy from netlify.toml, opens every page in Chromium and
// fails on any script error, blocked resource, horizontal overflow or chart
// that did not draw. Needs Playwright with Chromium installed:
//
//   npm run site && node tools/smoke.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const CSP = /Content-Security-Policy = "([^"]+)"/.exec(fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8'))[1];

// [path, charts expected to draw, extra step]
const PAGES = [
  ['/', 0, async p => p.waitForFunction(() => document.querySelectorAll('#mkt tbody tr:not(.empty)').length >= 4, null, { timeout: 30000 })],
  ['/symbol/?t=XERN', 1],
  ['/symbol/?t=XERN&tab=charts&chart=cloud', 1],
  ['/symbol/?t=XIDX&tab=charts&chart=skew', 1],
  ['/symbol/?t=XERN&tab=charts&chart=fork', 1],
  ['/symbol/?t=XIDX&tab=chain', 0, async p => p.waitForSelector('#ch-table tr')],
  ['/lab/', 1],
  ['/fork/', 1],
  ['/analyze/', 1, async p => { await p.click('#example'); await p.waitForSelector('#chart svg[aria-label], svg[aria-label^="Price history"]'); }],
  ['/how-it-works/', 4],
  ['/validation/', 0, async p => {
    await p.click('#go');
    await p.waitForFunction(() => document.getElementById('go').textContent === 'Run again', null, { timeout: 180000 });
    const failed = await p.evaluate(() => [...document.querySelectorAll('tr[data-k]')].filter(r => !/Pass/.test(r.textContent)).map(r => r.dataset.k));
    if (failed.length) throw new Error('validation checks failed: ' + failed.join(', '));
  }],
  ['/install/', 0],
  ['/script/', 0, async p => {
    const exact = await p.evaluate(async () => document.getElementById('code').textContent === await (await fetch('/implied.js')).text());
    if (!exact) throw new Error('the script page text differs from /implied.js');
  }],
  ['/does-not-exist/', 0],
];

function serve() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    const ok = f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile();
    res.writeHead(ok ? 200 : 404, { 'content-type': ok ? TYPES[path.extname(f)] || 'application/octet-stream' : 'text/html', 'content-security-policy': CSP });
    res.end(fs.readFileSync(ok ? f : path.join(ROOT, '404.html')));
  }).listen(0, '127.0.0.1');
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('public/ is missing: run npm run site first');
  const server = serve();
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      for (const [url, charts, step] of PAGES) {
        if (width < 1000 && url === '/validation/') continue; // the long run once is enough
        const page = await browser.newPage({ viewport: { width, height } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !(url === '/does-not-exist/' && /404/.test(m.text()))) errors.push(m.text()); });
        try {
          await page.goto(base + url, { waitUntil: 'networkidle' });
          if (step) await step(page);
          if (charts) await page.waitForFunction(n => [...document.querySelectorAll('svg[aria-label]')].filter(s => s.querySelectorAll('path,rect,line,circle').length > 5).length >= n, charts, { timeout: 30000 });
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          if (sw > width) errors.push('page is ' + sw + 'px wide at ' + width + 'px');
        } catch (e) {
          errors.push(e.message.split('\n')[0]);
        }
        console.log((errors.length ? 'FAIL ' : 'ok   ') + width + ' ' + url + (errors.length ? '\n     ' + errors.join('\n     ') : ''));
        failures += errors.length ? 1 : 0;
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failures) { console.error(failures + ' page check(s) failed'); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
