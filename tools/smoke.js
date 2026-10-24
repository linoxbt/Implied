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
  ['/symbol/?t=XHIV&tab=overview', 1],
  ['/symbol/?t=XBEL&tab=charts&chart=em', 1],
  ['/symbol/?t=XBEL&tab=ts', 0],
  ['/symbol/?t=NOPE', 0, async p => {
    if (!(await p.$('.notice.warn'))) throw new Error('unknown ticker: no notice');
    if (await p.isVisible('.tabs')) throw new Error('unknown ticker: tabs still shown');
  }],
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
  // The site's own favicon.ico, not the host's (a missing file is answered with Netlify's logo).
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  if (ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 1) throw new Error('public/favicon.ico is not an icon file');
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
          // Owner rules: the footer is on the landing page only.
          const footer = await page.$('footer');
          if (url === '/' ? !footer : footer) errors.push(url === '/' ? 'landing page has no footer' : 'footer shown off the landing page');
          if (charts) await page.waitForFunction(n => [...document.querySelectorAll('svg[aria-label]')].filter(s => s.querySelectorAll('path,rect,line,circle').length > 5).length >= n, charts, { timeout: 30000 });
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          if (sw > width) errors.push('page is ' + sw + 'px wide at ' + width + 'px');
        } catch (e) {
          errors.push(e.message.split('\n')[0]);
        }
        if (url === '/install/') {
          try {
            await page.keyboard.press('Control+k');
            await page.keyboard.type('xidx');
            const active = await page.evaluate(() => { const q = document.getElementById('cmdk-q'); const a = document.getElementById(q.getAttribute('aria-activedescendant')); return !document.getElementById('cmdk').hidden && a && a.getAttribute('href'); });
            if (active !== '/symbol/?t=XIDX') errors.push('search: expected XIDX highlighted, got ' + active);
            await page.keyboard.press('Escape');
          } catch (e) { errors.push('search: ' + e.message.split('\n')[0]); }
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
