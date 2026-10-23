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
  { key: 'EARN', label: 'Earnings stock', name: 'The Fork', tags: ['Two outcomes', 'Earnings week'],
    text: 'The market prices two outcomes. Orange ticks mark both; the grey tick between them is the least likely place to land.' },
  { key: 'SPY', label: 'Index ETF', name: 'Lopsided risk', tags: ['Put skew', 'Index'],
    text: 'Crash insurance, visible: the downside tail runs wider than the upside.' },
  { key: 'MEME', label: 'High-IV stock', name: 'Fat right tail', tags: ['Call skew', 'High IV'],
    text: 'The upside tail stretches far past the downside. That is what the market is paying for.' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Small inline icons for the floating nav (24px grid, stroke = currentColor).
const ICON = {
  charts: '<path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6"/>',
  how: '<path d="M7 7h10M7 12h10M7 17h6"/><circle cx="4" cy="7" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="17" r=".6"/>',
  install: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

// The mark: a cloud that splits in two.
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 24 C14 24 18 6 44 4 L44 44 C18 42 14 24 4 24Z" fill="currentColor" opacity=".28"/><path d="M4 24 C14 24 20 14 44 13 L44 21 C30 21 26 24 26 24 C26 24 30 27 44 27 L44 35 C20 34 14 24 4 24Z" fill="currentColor"/></svg>';

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const script = fs.readFileSync(path.join(root, 'dist/implied.js'), 'utf8');
  fs.writeFileSync(path.join(out, 'implied.js'), script);

  const cards = [];
  for (const s of SHOWCASE) {
    const { schedule, chain } = fx.SCENARIOS[s.key]();
    const c = fx.candles(chain.underlyingSymbolQuote.lastPrice);
    const res = await runIndicator({ ticker: s.key, schedule, chain, ...c });
    if (res.error) throw new Error(s.key + ': ' + res.error);
    cards.push({ ...s, svg: chartSvg(s.label, res, c.close, 'dark') });
  }
  const showcase = cards.map((c, i) => `
    <article class="work${i === 0 ? ' wide' : ''} reveal">
      <div class="screen">${c.svg}</div>
      <div class="work-meta">
        <div><h3>${c.name}</h3><p>${c.text}</p></div>
        <div class="chips">${c.tags.map(t => `<span>${t}</span>`).join('')}</div>
      </div>
    </article>`).join('');

  const quote = 'Every expected-move tool assumes a bell curve. Implied shows the real shape of the bet: skewed, fat-tailed, and sometimes split in two.';
  const about = 'Implied reads the live options chain and paints the probability distribution the market is pricing, out to every expiry. Not one number drawn as a symmetric cone, but the full density from every liquid strike. Lopsided when the market is, and split in two when it is betting on two outcomes.';
  const words = t => t.split(' ').map(w => `<span class="w">${esc(w)}</span>`).join(' ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Implied · Options Distribution</title>
<meta name="description" content="A free, open-source TrendSpider indicator that paints the options market's full implied price distribution into the future: skewed, fat-tailed, and sometimes split in two.">
<meta property="og:title" content="Implied: see the real shape of the bet">
<meta property="og:description" content="The options market's full implied distribution, painted on your TrendSpider chart. #TSBuild26">
<meta name="theme-color" content="#f4f4f2">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replace('viewBox="0 0 48 48"', 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" color="#0a0a0a"').replace(/currentColor/g, '#0a0a0a'))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#f4f4f2; --ink:#0a0a0a; --ink-2:#5b5b5b; --ink-3:rgba(10,10,10,.45); --line:rgba(10,10,10,.12);
  --night:#0a0a0a; --night-2:#161616; --night-line:rgba(255,255,255,.12); --night-ink:#f4f4f2; --night-mute:#8c8c8c;
  --lime:#c6f432; --lime-ink:#1d2a00; --pink:#ff7ad1; --pink-ink:#3d0a26; --blue:#2f80ff; --orange:#f2541b;
  --band:#5b8def; --fork:#ffb347; --ok:#22c55e;
  --display:'Archivo', 'Anton', Impact, sans-serif;
  --body:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono:'JetBrains Mono', ui-monospace, Menlo, monospace;
  color-scheme: light;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
.wrap{max-width:1280px;margin:0 auto;padding:0 16px}
@media (min-width:720px){.wrap{padding:0 32px}}
.mono{font:500 11px/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.display{font-family:var(--display);font-weight:900;font-stretch:72%;text-transform:uppercase;line-height:.92;letter-spacing:-.01em}
:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:6px}

/* ---------- Header ---------- */
.top{position:absolute;inset:0 0 auto 0;z-index:5}
.top .wrap{display:flex;align-items:center;justify-content:space-between;height:76px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.brand svg{width:34px;height:34px;color:var(--ink)}
.brand b{font:900 26px/1 var(--display);font-stretch:72%;text-transform:uppercase;letter-spacing:.01em}
.pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:11px 18px;font:500 14px/1 var(--body);text-decoration:none;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;transition:transform .2s ease, background .2s}
.pill.solid{background:var(--ink);color:#fff;border-color:var(--ink)}
.pill.light{background:#fff;color:var(--ink);border-color:#fff}
.pill:hover{transform:translateY(-1px)}
.pill .arr{display:inline-block;transition:transform .2s}
.pill:hover .arr{transform:translate(2px,-2px)}

/* ---------- Hero ---------- */
.hero{position:relative;padding:140px 0 56px;text-align:center;overflow-x:clip}
.status{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 8px 7px 14px;font-size:13px;color:var(--ink-2);margin-bottom:28px}
.status i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(34,197,94,.18)}
.status a{color:var(--ink);text-decoration:none;border-left:1px solid var(--line);padding-left:10px}
.headline{position:relative;max-width:1100px;margin:0 auto}
.headline h1{margin:0;font-size:clamp(50px,9.4vw,140px)}
.headline h1 span{display:block}
.lede{max-width:540px;margin:44px auto 30px;color:var(--ink-2);font-size:18px;letter-spacing:-.01em}
.ctas{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}

/* Stickers */
.sticker{position:absolute;z-index:2;font:700 clamp(12px,1.5vw,19px)/1 var(--body);color:#fff;padding:.7em 1.15em;border-radius:999px;white-space:nowrap;
  box-shadow:inset 0 2px 0 rgba(255,255,255,.45), inset 0 -3px 6px rgba(0,0,0,.18), 0 10px 24px rgba(0,0,0,.18);
  animation:bob 6s ease-in-out infinite}
.sticker::after{content:"";position:absolute;inset:3px 12% auto 12%;height:38%;border-radius:999px;background:linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,0))}
.s-bl{background:linear-gradient(100deg,#ff4d6d,#ff8a3d 60%,#ffc15e);top:-4%;left:2%;--r:-10deg}
.s-fork{background:linear-gradient(100deg,#ff7ad1,#c77dff 55%,#ff9ec7);color:#3d0a26;bottom:-24%;right:7%;--r:6deg}
.s-ts{background:linear-gradient(100deg,#2f80ff,#5bc0ff);top:-15%;right:21%;--r:-6deg;animation-delay:-2s}
@keyframes bob{0%,100%{transform:rotate(var(--r)) translateY(0)}50%{transform:rotate(var(--r)) translateY(-8px)}}
.burst{position:absolute;z-index:2;left:5%;bottom:-36%;width:clamp(78px,10vw,132px);aspect-ratio:1;animation:spin 24s linear infinite}
.burst svg{width:100%;height:100%;filter:drop-shadow(0 10px 18px rgba(0,0,0,.18))}
.burst span{position:absolute;inset:0;display:grid;place-items:center;text-align:center;font:900 clamp(15px,2vw,26px)/.9 var(--display);font-stretch:72%;color:var(--lime-ink);text-transform:uppercase;animation:spin 24s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
.orb{position:absolute;z-index:2;right:2%;top:-6%;width:clamp(64px,8vw,112px);aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle at 32% 28%,#fff 0 8%,#b9d1ff 18%,#5b8def 52%,#1d3fae 100%);box-shadow:0 18px 30px rgba(29,63,174,.35);animation:bob 7s ease-in-out infinite;--r:0deg}
.orb svg{position:absolute;inset:22%;width:56%;height:56%;color:#fff;opacity:.95}
@media (max-width:720px){ .s-ts,.orb,.s-fork{display:none} .burst{left:auto;right:6px;top:auto;bottom:-10px;width:68px} .s-bl{top:-26%;left:0} .headline{margin-top:30px} .f2,.bubble{display:none} .f1{top:-64px;left:0} .foot{padding-top:130px} }

/* Proof strip (where a studio would put client logos) */
.proof{margin:64px auto 0;max-width:1080px}
.proof .rule{display:flex;align-items:center;gap:16px;color:var(--ink-3);font-size:14px}
.proof .rule::before,.proof .rule::after{content:"";flex:1;height:1px;background:var(--line)}
.proof ul{list-style:none;margin:22px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}
.proof li{text-align:center}
.proof b{display:block;font:900 clamp(30px,3.6vw,44px)/1 var(--display);font-stretch:72%;color:rgba(10,10,10,.82)}
.proof span{font-size:13px;color:var(--ink-3)}

/* ---------- Showcase ---------- */
.works{display:grid;gap:16px;grid-template-columns:1fr;padding:40px 0 24px}
@media (min-width:880px){.works{grid-template-columns:1fr 1fr}.work.wide{grid-column:1/-1}}
.work{background:var(--night);border-radius:22px;padding:10px;color:#fff;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.work:hover{transform:translateY(-4px) rotate(-.3deg)}
.screen{border-radius:14px;overflow:hidden;background:#131722}
.screen svg{display:block;width:100%;height:auto}
.work-meta{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:16px 10px 8px;flex-wrap:wrap}
.work-meta h3{margin:0;font:500 22px/1.2 var(--body);letter-spacing:-.02em}
.work-meta p{margin:4px 0 0;color:var(--night-mute);font-size:14px;max-width:56ch}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips span{font-size:12px;border:1px solid var(--night-line);border-radius:999px;padding:6px 10px;color:#d6d6d6;background:rgba(255,255,255,.04)}

/* ---------- Quote reveal ---------- */
.quote{display:grid;gap:28px;padding-top:110px;padding-bottom:120px}
@media (min-width:880px){.quote{grid-template-columns:260px 1fr;gap:48px}}
.quote aside b{display:block;font:900 64px/1 var(--display);font-stretch:72%}
.quote aside span{color:var(--ink-2);font-size:13px}
.big{margin:0;font:600 clamp(30px,4.6vw,60px)/1.08 var(--body);letter-spacing:-.045em}
.big .w{color:rgba(10,10,10,.16);transition:color .25s}
.big .w.on{color:var(--ink)}
.cite{display:flex;align-items:center;gap:12px;margin-top:28px;font-size:14px;color:var(--ink-2)}
.cite svg{width:30px;height:30px;color:var(--ink)}

/* ---------- Night ---------- */
.night{overflow-x:clip;background:var(--night);color:var(--night-ink);border-radius:56% 56% 0 0 / 40px 40px 0 0;position:relative}
.night .big .w{color:rgba(255,255,255,.18)}
.night .big .w.on{color:#fff}
.about{display:grid;gap:28px;padding-top:120px;padding-bottom:40px}
@media (min-width:880px){.about{grid-template-columns:260px 1fr;gap:48px}}
.about .mono{color:var(--night-mute)}
.cloudmark{margin-top:22px;width:200px;max-width:60%}
.legend{display:grid;gap:10px 28px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:44px;padding-top:24px;border-top:1px solid var(--night-line)}
.legend div{display:flex;gap:12px;align-items:baseline;color:var(--night-mute);font-size:15px}
.legend b{color:#fff;font-weight:500}
.sw{flex:none;width:26px;height:10px;border-radius:3px;transform:translateY(-1px)}

/* Process: tilted colour cards on a wavy line */
.process{position:relative;padding-top:90px;padding-bottom:120px}
.process h2{margin:0 0 6px;font-size:clamp(44px,7vw,96px);color:#fff}
.process .sub{color:var(--night-mute);max-width:56ch;margin:0 0 48px}
.line{position:absolute;left:0;right:0;top:56%;width:100%;height:160px;z-index:0;pointer-events:none}
.steps{position:relative;z-index:1;display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));list-style:none;margin:0;padding:0}
.step{position:relative;border-radius:18px;padding:18px 20px 22px;min-height:290px;display:flex;flex-direction:column;justify-content:space-between;transform:rotate(var(--r));transition:transform .4s cubic-bezier(.2,.8,.2,1);box-shadow:0 18px 40px rgba(0,0,0,.35)}
.step:hover{transform:rotate(0) translateY(-6px)}
.step:nth-child(1){background:var(--lime);color:var(--lime-ink);--r:-3deg}
.step:nth-child(2){background:var(--pink);color:var(--pink-ink);--r:2.5deg;margin-top:40px}
.step:nth-child(3){background:var(--blue);color:#fff;--r:-2deg}
.step:nth-child(4){background:var(--orange);color:#fff;--r:3deg;margin-top:40px}
.step .n{font:500 12px/1 var(--mono)}
.step h3{margin:0 0 8px;font-size:clamp(34px,3.4vw,46px)}
.step p{margin:0;font-size:14.5px;line-height:1.45;opacity:.92}
.tagpill{position:absolute;top:-16px;right:14px;font:700 13px/1 var(--body);padding:9px 14px;border-radius:999px;transform:rotate(-5deg);color:#fff;background:linear-gradient(100deg,#ff4d6d,#ff8a3d);box-shadow:inset 0 2px 0 rgba(255,255,255,.4),0 8px 18px rgba(0,0,0,.3)}
.tagpill.blue{background:linear-gradient(100deg,#2f80ff,#7cc4ff);transform:rotate(6deg)}
.formula{margin:56px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:14px;color:var(--night-mute);font-size:14px}
.formula code{font:500 16px/1.4 var(--mono);color:#fff;background:var(--night-2);border:1px solid var(--night-line);border-radius:12px;padding:12px 16px}
@media (max-width:720px){.step:nth-child(2),.step:nth-child(4){margin-top:0}.step{min-height:220px}.line{display:none}}

/* Plans-style comparison */
.plans{padding-top:40px;padding-bottom:130px}
.plans header{text-align:center;margin-bottom:44px}
.plans header .mono{color:var(--night-mute)}
.plans h2{margin:14px 0 0;font:500 clamp(40px,5.6vw,76px)/1.02 var(--body);letter-spacing:-.05em}
.cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:stretch}
.plan{border:1px solid var(--night-line);background:var(--night-2);border-radius:22px;padding:26px 24px;display:flex;flex-direction:column}
.plan.hot{background:#fff;color:var(--ink);border-color:#fff}
.plan .ph{display:flex;justify-content:space-between;align-items:center;gap:10px}
.plan h3{margin:0;font-size:30px}
.lime-pill{font:700 12px/1 var(--body);color:var(--lime-ink);background:var(--lime);padding:7px 11px;border-radius:999px;transform:rotate(-4deg);box-shadow:inset 0 2px 0 rgba(255,255,255,.5)}
.price{font:900 64px/1 var(--display);font-stretch:80%;margin:22px 0 4px;letter-spacing:-.02em}
.plan small{color:var(--night-mute);font-size:13px}
.plan.hot small{color:var(--ink-2)}
.plan .desc{margin:16px 0 18px;padding-bottom:18px;border-bottom:1px solid var(--night-line);color:#cfcfcf;font-size:15px}
.plan.hot .desc{color:var(--ink-2);border-color:var(--line)}
.plan ul{list-style:none;margin:0 0 26px;padding:0;display:grid;gap:9px;font-size:14px}
.plan li{display:flex;gap:10px}
.plan li::before{content:"✓";font-weight:700}
.plan li.no::before{content:"✕";opacity:.55}
.plan li.no{color:var(--night-mute)}
.plan .pill{margin-top:auto;justify-content:center;width:100%;padding:14px}
.plan.hot .pill{background:var(--ink);color:#fff;border-color:var(--ink)}

/* ---------- Footer ---------- */
.foot{position:relative;padding:110px 0 0;overflow:hidden}
.foot h2{position:relative;margin:0;text-align:center;font-size:clamp(52px,15vw,236px);line-height:.86;white-space:nowrap}
.foot .sticker{font-size:clamp(12px,1.4vw,18px)}
.f1{background:linear-gradient(100deg,#ff4d6d,#ff8a3d);top:-6%;left:3%;--r:-7deg}
.f2{background:linear-gradient(100deg,#c6f432,#7ee0a1);color:var(--lime-ink);bottom:2%;left:36%;--r:-4deg;animation-delay:-3s}
.bubble{position:absolute;right:4%;top:-12%;font:800 clamp(16px,2vw,26px)/1 var(--body);color:#fff;padding:.55em .8em;border-radius:22px;background:linear-gradient(140deg,#5bc0ff,#2f80ff 60%,#7a5cff);transform:rotate(-8deg);box-shadow:inset 0 2px 0 rgba(255,255,255,.4),0 12px 22px rgba(47,128,255,.35);animation:bob 5s ease-in-out infinite;--r:-8deg}
.bubble::after{content:"";position:absolute;left:18%;bottom:-10px;border:8px solid transparent;border-top-color:#2f80ff;border-bottom:0}
.grid4{display:grid;grid-template-columns:1fr;border-top:1px solid var(--line);margin-top:48px}
@media (min-width:880px){.grid4{grid-template-columns:2fr 1fr 1fr 1fr}}
.grid4>div{padding:22px 16px 30px;border-bottom:1px solid var(--line)}
@media (min-width:880px){.grid4>div{border-bottom:0;border-left:1px solid var(--line)}.grid4>div:first-child{border-left:0;padding-left:0}}
.grid4 .mono{color:var(--ink-3);margin-bottom:12px}
.grid4 a.big-link{display:block;font:900 26px/1.12 var(--display);font-stretch:72%;text-transform:uppercase;text-decoration:none}
.grid4 a.big-link:hover{text-decoration:underline}
.mail{font:400 clamp(22px,2.4vw,30px)/1.2 var(--body);letter-spacing:-.02em;margin:0 0 16px;word-break:break-word}
.clock{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);margin-top:6px}
.clock i{width:7px;height:7px;border-radius:50%;background:var(--ink-3)}
.clock i.open{background:var(--ok)}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 0 110px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2);flex-wrap:wrap}
.bottom .brand svg{width:26px;height:26px}
.bottom .brand b{font-size:20px}

/* ---------- Floating nav ---------- */
.dock{position:fixed;left:50%;bottom:18px;z-index:20;display:flex;gap:2px;padding:6px;border-radius:999px;background:rgba(10,10,10,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.1);
  transform:translate(-50%,140%);transition:transform .45s cubic-bezier(.2,.8,.2,1);max-width:calc(100vw - 24px)}
.dock.show{transform:translate(-50%,0)}
.dock a,.dock button{display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:999px;color:#fff;text-decoration:none;font:500 13.5px/1 var(--body);background:none;border:0;cursor:pointer;white-space:nowrap}
.dock a:hover,.dock button:hover{background:rgba(255,255,255,.12)}
.dock svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock .solid{background:#fff;color:var(--ink)}
.dock .solid:hover{background:#e9e9e9}
@media (max-width:520px){.dock .lbl{display:none}.dock a,.dock button{padding:10px 12px}.dock .solid .lbl{display:inline}}

/* Reveal */
.reveal{opacity:0;transform:translateY(24px);transition:opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1)}
.reveal.in{opacity:1;transform:none}
.toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:11px 16px;border-radius:12px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:30}
.toast.show{opacity:1}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .reveal{opacity:1;transform:none}
  .big .w{color:var(--ink)!important} .night .big .w{color:#fff!important}
}
</style>
</head>
<body>

<header class="top"><div class="wrap">
  <a class="brand" href="#top" aria-label="Implied home">${LOGO}<b>Implied</b></a>
  <a class="pill solid" href="${REPO}">Source <span class="arr">↗</span></a>
</div></header>

<main id="top">
<section class="hero"><div class="wrap">
  <div class="status"><i></i>Free &amp; open source<a href="#install">Get the script →</a></div>
  <div class="headline">
    <span class="sticker s-bl" aria-hidden="true">Breeden–Litzenberger</span>
    <span class="orb" aria-hidden="true">${LOGO}</span>
    <span class="sticker s-ts" aria-hidden="true">#TSBuild26</span>
    <span class="burst" aria-hidden="true"><svg viewBox="0 0 100 100"><polygon fill="#c6f432" points="${Array.from({ length: 28 }, (_, i) => { const a = Math.PI * i / 14, r = i % 2 ? 41 : 50; return (50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1); }).join(' ')}"/></svg><span>$0<br>free</span></span>
    <h1 class="display"><span>See the real</span><span>shape of the bet</span></h1>
    <span class="sticker s-fork" aria-hidden="true">Split in two? It says so.</span>
  </div>
  <p class="lede">A TrendSpider indicator that reads the live options chain and paints the distribution the market is pricing into the future on your chart.</p>
  <div class="ctas">
    <button class="pill solid" data-copy>Copy the script</button>
    <a class="pill" href="#work">See it on a chart</a>
  </div>
  <div class="proof">
    <div class="rule">Tested before it touches a chart</div>
    <ul>
      <li><b>95/96</b><span>Forks found in two-outcome chains</span></li>
      <li><b>0/2,250</b><span>false Forks on one-outcome chains</span></li>
      <li><b>&lt;1 pt</b><span>probability error per band</span></li>
      <li><b>~0.2 s</b><span>to model 8 expiries</span></li>
    </ul>
  </div>
</div></section>

<section id="work" class="wrap" aria-label="Examples">
  <div class="works">${showcase}
  </div>
</section>

<section class="wrap quote" aria-label="Why">
  <aside class="reveal"><b>1 → 241</b><span>one straddle number vs a 241-point density per expiry</span></aside>
  <div>
    <p class="big" data-words>“${words(quote)}”</p>
    <div class="cite">${LOGO}<div><b style="color:var(--ink)">Implied</b><br>Most Unique Options Indicator · 2026 TrendSpider Hackathon</div></div>
  </div>
</section>

<div class="night">
  <section class="wrap about" id="read">
    <div>
      <div class="mono">How to read it</div>
      <svg class="cloudmark" viewBox="0 0 200 120" aria-hidden="true">
        <path d="M0 60 C60 60 90 4 200 0 L200 120 C90 116 60 60 0 60Z" fill="#5b8def" opacity=".14"/>
        <path d="M0 60 C60 60 90 22 200 18 L200 102 C90 98 60 60 0 60Z" fill="#5b8def" opacity=".22"/>
        <path d="M0 60 C60 60 92 40 200 36 L200 84 C92 80 60 60 0 60Z" fill="#5b8def" opacity=".5"/>
        <path d="M0 60 C70 60 120 58 200 57" stroke="#9aa0b4" stroke-width="2" stroke-dasharray="2 4" fill="none"/>
        <path d="M150 34h18M150 88h18" stroke="#ffb347" stroke-width="4" stroke-linecap="round"/>
        <path d="M152 61h14" stroke="#7d8296" stroke-width="3" stroke-dasharray="5 3"/>
      </svg>
    </div>
    <div>
      <p class="big" data-words>${words(about)}</p>
      <div class="legend">
        <div><span class="sw" style="background:#5b8def;opacity:.8"></span><span><b>Dense core.</b> 25th–75th percentile: half the odds.</span></div>
        <div><span class="sw" style="background:#5b8def;opacity:.45"></span><span><b>Middle bands.</b> The 80% range.</span></div>
        <div><span class="sw" style="background:#5b8def;opacity:.2"></span><span><b>Faint tails.</b> The 95% range; the wider side is the skew.</span></div>
        <div><span class="sw" style="background:repeating-linear-gradient(90deg,#9aa0b4 0 3px,transparent 3px 6px)"></span><span><b>Dotted line.</b> The median outcome.</span></div>
        <div><span class="sw" style="background:var(--fork)"></span><span><b>The Fork.</b> Two outcomes priced at once; grey marks the least likely zone.</span></div>
        <div><span class="sw" style="background:#3a3a3a"></span><span><b>Legend tags.</b> “Downside tail 1.4× upside” puts the shape in words.</span></div>
      </div>
    </div>
  </section>

  <section class="wrap process" id="how">
    <h2 class="display reveal">How it works</h2>
    <p class="sub reveal">Four steps, once per expiry, every time the chart loads. One request for the schedule, one for the chain.</p>
    <svg class="line" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 40 C150 160 260 150 330 90 S520 10 620 80 S820 160 900 80 S1080 10 1210 70" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></svg>
    <ol class="steps">
      <li class="step reveal"><span class="tagpill">Out-of-the-money only</span><span class="n">01</span><div><h3 class="display">Clean</h3><p>Mid of bid and ask, junk quotes dropped, the forward found from put-call parity so dividends take care of themselves.</p></div></li>
      <li class="step reveal"><span class="n">02</span><div><h3 class="display">Solve</h3><p>Implied volatility at every liquid strike, Black-76, on the liquid side of the chain.</p></div></li>
      <li class="step reveal"><span class="n">03</span><div><h3 class="display">Smooth</h3><p>A spline through the smile, each quote weighted by its spread, smoothing picked by the data. Bends for a real Fork, never invents one.</p></div></li>
      <li class="step reveal"><span class="tagpill blue">On your chart</span><span class="n">04</span><div><h3 class="display">Paint</h3><p>Second derivative in strike gives the density; percentiles become bands that widen with √time.</p></div></li>
    </ol>
    <div class="formula reveal"><span class="mono">The one formula</span><code>f(K) = e^(rT) · ∂²C / ∂K²</code><span>Breeden &amp; Litzenberger, 1978.</span></div>
  </section>

  <section class="wrap plans" id="install">
    <header class="reveal"><div class="mono">Install</div><h2>One file,<br>no surprises</h2></header>
    <div class="cards">
      <div class="plan reveal">
        <div class="ph"><h3 class="display">Expected-move cone</h3></div>
        <div class="price">1</div><small>number, from the straddle</small>
        <p class="desc">The usual way: one at-the-money price, drawn as a symmetric range.</p>
        <ul><li>Quick read of “how far”</li><li class="no">Same width up and down</li><li class="no">One peak, always</li><li class="no">Ignores most strikes</li></ul>
      </div>
      <div class="plan hot reveal">
        <div class="ph"><h3 class="display">Implied</h3><span class="lime-pill">Free forever</span></div>
        <div class="price">$0</div><small>open source, Apache-2.0</small>
        <p class="desc">The full distribution from every liquid strike, out to each expiry.</p>
        <ul><li>Skew you can see, in words too</li><li>Fat tails where the market pays for them</li><li>The Fork: two outcomes, flagged</li><li>Clear messages, never a broken chart</li></ul>
        <button class="pill" data-copy>Copy the script <span class="arr">↗</span></button>
      </div>
      <div class="plan reveal">
        <div class="ph"><h3 class="display">3 steps</h3></div>
        <div class="price">~1</div><small>minute to set up</small>
        <p class="desc">No server, no API key. TrendSpider hosts the code, data and runtime.</p>
        <ul><li>Open the Custom JS indicator editor</li><li>Paste the script, save</li><li>Add to a <b>Daily</b> chart with listed options</li><li>Needs TrendSpider's OPRA options data</li></ul>
        <a class="pill light" href="implied.js" download>Download implied.js <span class="arr">↗</span></a>
      </div>
    </div>
  </section>
</div>

<footer class="foot">
  <div class="wrap">
    <div style="position:relative">
      <span class="sticker f1" aria-hidden="true">Takes about a minute</span>
      <span class="bubble" aria-hidden="true">copy!</span>
      <h2 class="display">Paste it in</h2>
      <span class="sticker f2" aria-hidden="true">Open source · Apache-2.0</span>
    </div>
    <div class="grid4">
      <div>
        <div class="mono">Get the script</div>
        <p class="mail">implied.js · v${pkg.version} · ${script.split('\n').length} lines</p>
        <button class="pill solid" data-copy>Copy to clipboard</button>
      </div>
      <div><div class="mono">Pages</div><a class="big-link" href="#work">Charts</a><a class="big-link" href="#read">How to read</a><a class="big-link" href="#how">How it works</a><a class="big-link" href="#install">Install</a></div>
      <div><div class="mono">Source</div><a class="big-link" href="${REPO}">GitHub</a><a class="big-link" href="${REPO}/blob/main/README.md">Read me</a><a class="big-link" href="${REPO}/blob/main/LICENSE">License</a></div>
      <div><div class="mono">Market</div><a class="big-link" href="#" tabindex="-1" aria-hidden="true" style="pointer-events:none">New York</a><div class="clock"><i id="mk"></i><span id="clock">US equities</span></div></div>
    </div>
    <div class="bottom">
      <a class="brand" href="#top">${LOGO}<b>Implied</b></a>
      <span>Risk-neutral: the price of each outcome, not a forecast. Not investment advice. #TSBuild26</span>
      <a href="#top" style="text-decoration:none">Back to top ↑</a>
    </div>
  </div>
</footer>
</main>

<nav class="dock" aria-label="Sections">
  <a href="#work">${icon('charts')}<span class="lbl">Charts</span></a>
  <a href="#how">${icon('how')}<span class="lbl">How it works</span></a>
  <a href="${REPO}">${icon('code')}<span class="lbl">Source</span></a>
  <button class="solid" data-copy>${icon('install')}<span class="lbl">Copy</span></button>
</nav>
<div class="toast" role="status" aria-live="polite"></div>

<script>
(function () {
  // Copy the script
  var toast = document.querySelector('.toast'), timer;
  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove('show'); }, 2400); }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fetch('implied.js').then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (t) { return navigator.clipboard.writeText(t); })
        .then(function () { say('Copied. Paste it into the TrendSpider editor.'); })
        .catch(function () { say('Copy failed. Use the download link instead.'); });
    });
  });

  // Fade-up reveals
  var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io ? io.observe(el) : el.classList.add('in'); });

  // Word-by-word fill tied to scroll position, and the dock after the hero
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-words]'));
  var dock = document.querySelector('.dock'), hero = document.querySelector('.hero');
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    blocks.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      var ws = b.querySelectorAll('.w'), n = Math.round(p * ws.length);
      for (var i = 0; i < ws.length; i++) ws[i].classList.toggle('on', i < n);
    });
    dock.classList.toggle('show', hero.getBoundingClientRect().bottom < vh * 0.6);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();

  // New York clock and regular-session status (holidays not included)
  var clock = document.getElementById('clock'), mk = document.getElementById('mk');
  function tick() {
    try {
      var now = new Date();
      var t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
      var get = function (k) { return (parts.filter(function (p) { return p.type === k; })[0] || {}).value; };
      var mins = (+get('hour') % 24) * 60 + +get('minute'), wd = get('weekday');
      var open = wd !== 'Sat' && wd !== 'Sun' && mins >= 570 && mins < 960;
      clock.textContent = t + ' · market ' + (open ? 'open' : 'closed');
      mk.classList.toggle('open', open);
    } catch (e) { clock.textContent = 'US equities'; }
  }
  tick(); setInterval(tick, 30000);
})();
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  console.log('wrote public/index.html (' + Math.round(html.length / 1024) + ' KB) and public/implied.js');
}

main().catch(e => { console.error(e); process.exit(1); });
