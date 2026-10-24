<p><img src="web/assets/logo-mark.svg" width="72" alt="Implied logo"></p>

# Implied

**See where the options market actually thinks price is going, with the real shape of the bet: skewed, fat-tailed, and sometimes split in two.**

Implied is a free, open-source [TrendSpider](https://trendspider.com) custom indicator. It reads the live options chain, recovers the probability distribution the market is pricing for each expiry, and paints it into the future on the price chart as a cloud. Built for the 2026 TrendSpider Hackathon, category *Most Unique Options Indicator* (#TSBuild26).

| SPY: downside tail wider than upside | Earnings stock: the Fork |
| --- | --- |
| ![SPY preview](docs/img/SPY-dark.svg) | ![Earnings preview](docs/img/EARN-dark.svg) |

*Previews rendered from the script's own paint calls on synthetic chains (`npm run preview`).*

**Try it live: [implied.netlify.app](https://implied.netlify.app).** The Explore, Lab, Fork, Analyze, How-it-works and Validation pages run the real `dist/implied.js` in your browser against a stand-in for TrendSpider's runtime, on simulated chains (not market data).

| Page | What it does |
| --- | --- |
| [Explore](https://implied.netlify.app/symbol/?t=XERN) | A ticker page for each simulated chain: implied vs lognormal probability distribution with a probability table, projection cloud, volatility skew, expected move, Fork detection, and the option chain |
| [Lab](https://implied.netlify.app/lab/) | Shape a market (volatility, skew, an earnings jump, spreads) and watch the script repaint |
| [The Fork](https://implied.netlify.app/fork/) | Build a two-outcome market and watch the detector apply its three rules |
| [Analyze](https://implied.netlify.app/analyze/) | Drop a chain saved from TrendSpider and see what Implied would paint on it |
| [How it works](https://implied.netlify.app/how-it-works/) | Quotes → implied vol → fitted smile → density → cloud, one live chart per step |
| [Validation](https://implied.netlify.app/validation/) | Run the accuracy checks in the browser |
| [Install](https://implied.netlify.app/install/) | Copy or download the script; settings and messages |

## Install in TrendSpider

1. Open TrendSpider's Custom JS indicator editor and create a new indicator.
2. Paste the whole of [`dist/implied.js`](dist/implied.js) and save.
3. Add it to a **Daily** chart of any ticker with listed options. Options data needs TrendSpider's OPRA subscription.

## How to read it

| On the chart | Meaning |
| --- | --- |
| Dense core band | 25th–75th percentile: half the probability sits here |
| Middle bands | 10th–90th percentile: the 80% range |
| Faint outer bands | 2.5th–97.5th percentile: the 95% range |
| Dotted line | The median outcome |
| One side wider than the other | The market is paying more for that tail. The summary panel says by how much, e.g. "Downside tail 1.4× upside" |
| Orange ticks (the Fork) | The market prices two separate outcomes, usually around earnings. The grey tick between them is the least likely zone. The summary panel reads e.g. "Fork: $182.00 / $201.00 · least likely $190.00" |

A summary panel (top left) shows a small chart of the distribution at the expiry that matters most, its median and 95% range, the skew in words, and the Fork prices. The median line's price shows on hover; the summary panel gives the 95% range in dollars.

This is the market's **risk-neutral** distribution: the price of each outcome. It includes risk premia, so it is not a guaranteed forecast of real-world odds.

## How it works

For each expiry, Implied:

1. **Cleans quotes.** Mid = (bid + ask) / 2; drops zero bids, inverted quotes and spreads wider than the setting.
2. **Finds the forward** F from put-call parity at the five strikes nearest spot (median), which absorbs dividends and borrow cost. The nearest expiry's forward, discounted, is also the spot the cloud starts from, so a stale or after-hours last price cannot shift it.
3. **Solves implied volatility** (Black-76, bisection) on out-of-the-money quotes only. Puts below F are converted to calls with parity.
4. **Fits a smooth smile** of total variance w(k) = σ²T in log-moneyness k = ln(K/F). It uses a penalized smoothing spline, with each quote weighted by the noise its bid-ask spread implies. The smoothing strength is picked per chain by generalized cross-validation, so tight chains keep their detail and noisy ones are smoothed harder. The wings extend linearly within Lee's moment bound (|dw/dk| ≤ 2). A first fit flags quotes more than 5 noise units (or 3× the median) off the smile; they are dropped and the smile is refitted, so one bad print cannot make a false peak.
5. **Takes the density** by Breeden–Litzenberger, the discounted second derivative of the rebuilt call price in strike, on a 601-point log-strike grid. If the result has negative probability (butterfly arbitrage), the smile is smoothed harder until it does not; an expiry whose probability does not add up is skipped.
6. **Reads the shape:** quantiles; the skew ratio in log space, ln(q97.5/q50) / ln(q50/q2.5), so a plain lognormal reads as symmetric; the tail weights below 0.9·F and above 1.1·F; and the Fork. A Fork is two peaks each at least 25% of the tallest and at least 3% of F apart, with the valley between them below 70% of the smaller peak, and both peaks inside the quoted strikes (never in the extrapolated wings).
7. **Projects into the future.** Each quantile is carried as u = ln(q/F)/√T. That value is held flat before the first expiry and interpolated linearly in time between expiries, then re-expanded with √t. The cloud starts at the last close and widens like the square root of time. Expiries drawn: the nearest one that models cleanly, the nearest to each target horizon (falling back to a neighbour when one is too thin), and any other expiry within 21 days that prices a Fork, so a post-earnings Fork is never lost between horizons.

### Design choices

| Choice | Instead of | Why |
| --- | --- | --- |
| GCV-tuned smoothing spline for the smile | A weighted cubic polynomial | A cubic cannot follow the IV "frown" a two-outcome market makes, so it cannot produce two peaks. With the spline, the stress run finds the Fork in 357 of 360 two-outcome expiries, with 0 false Forks in 1,861 one-outcome expiries. |
| u held at its first-expiry value before that expiry | u interpolated from 0 | Starting u at 0 and also scaling by √t makes the cloud grow like t^1.5, far too narrow in the first days (covered by a test in `test/project.test.js`). |
| Non-overlapping bands at 7% / 16% / 30% | Stacked fills | The same look, without painting over the core three times. |
| Skew ratio in log space | (97.5−50)/(50−2.5) in price | The price ratio calls every lognormal "upside skew"; the log ratio reads 1.0 for a flat smile. |

## Settings

| Setting | Default | Range | Purpose |
| --- | --- | --- | --- |
| Expirations to project | 4 | 1–8 | How far the cloud reaches |
| Risk-free rate (%) | 4.0 | 0–15 | Discounting in parity and pricing |
| Max bid-ask spread (fraction of mid) | 0.5 | 0.05–2 | Drops stale, illiquid quotes |
| Min usable strikes per expiry | 8 | 5–60 | Skips expiries too thin to fit |
| Show Fork | On | On / off | Hides the Fork marks and the Fork line in the panel |

## On-chart messages

| Situation | What you see |
| --- | --- |
| Not a Daily chart | "Implied runs on the Daily timeframe only." |
| No listed options (crypto, most futures, forex), or no OPRA subscription | "No options data for X. Implied needs a ticker with listed options and an OPRA subscription." (plus the data error, if any) |
| No price history on the chart | "Implied needs price history on the chart." |
| An options request fails | The "No options data for X…" message, with the request's error in brackets |
| No expiry within the 100 bars the cloud can draw | "Options data for X did not include any expiration in the next 99 days." |
| Every expiry too thin | "Not enough liquid strikes on X to build a distribution." |
| Some expiries thin or broken | Those expiries are skipped; the rest still draw |

## Development

Node 22+ and no runtime dependencies. The browser smoke test (`npm run smoke`) needs Playwright with Chromium.

```sh
npm test          # build dist/implied.js, then run all tests
npm run check     # fail if dist/implied.js is stale, then run all tests (CI and Netlify run this)
npm run stress    # thousands of synthetic expiries: Fork hit rate and false Forks
npm run preview   # render preview/index.html (dark + light) from the script's paint calls
npm run site      # build the website into public/ (deployed to Netlify)
npm run smoke     # open every built page in Chromium under the production CSP
node tools/replay.js chains/<file>.json   # run a saved real chain through the script
```

| Path | What it is |
| --- | --- |
| `src/core.js` | All math, pure functions: clean, IV, smile fit, density, shape, projection, labels |
| `src/indicator.js` | TrendSpider glue: settings, requests, paint calls |
| `dist/implied.js` | Built single file to paste into TrendSpider (committed) |
| `web/assets/engine.js` | Stand-in for TrendSpider's runtime (runs `dist/implied.js` unchanged, checks the API rules the script relies on, records paint calls; it is not TrendSpider itself, see `docs/verify-in-trendspider.md`) and synthetic chain generator; shared by the site, tests and tools |
| `test/runtime.js` | Test wrapper around the engine's runtime |
| `test/fixtures.js` | Synthetic chains priced from known distributions (smiles, two-outcome mixtures, illiquid) |
| `chains/` | Saved chains, replayed by the test suite. Only synthetic examples are committed: real OPRA chains are licensed data and are git-ignored |
| `web/` | Website: `pages/` (one file per page), `assets/` (styles, charts, browser engine, logo) |
| `tools/site.js` | Builds `web/` into `public/`; copies `dist/implied.js` and `src/core.js` so the site runs the real code; asset URLs carry a content hash |
| `docs/` | Store listing, TrendSpider verification steps, release checklist |

### Validation (synthetic chains with realistic bid-ask spreads and quote noise)

- Flat 25% smile: density within 2% of the analytic lognormal, integrates to 1 ± 0.001, median within 0.2% of F·e^(−σ²T/2).
- Skewed smile, 7–90 days: every band within 1 percentage point of probability of the true distribution.
- 50/50 outcomes 10% apart: both peaks within 1% of the true peaks, across 10 random quote sets.
- Earnings-style two-outcome chains (7–21 days, 40/60 to 60/40, spreads 1–5%): Fork found in at least 95% of 96 cases (94/96 with the full data gate, as on the Validation page).
- One-outcome chains (index put skew, meme call skew, steep smiles, 3–90 days, noisy quotes): 0 false Forks in 174 modelled expiries.
- Stress run (`npm run stress`, also in CI): Fork found in 357 of 360 two-outcome expiries; 0 false Forks in 1,861 one-outcome expiries (389 more were skipped as too thin, which is the intended outcome for unusable chains).
- A full run (selection, fits, paint calls) takes about 0.1–0.3 s in Node on a laptop; the test suite's budget is 3 s. One schedule request and one chain request per load.

## License

Apache-2.0. See [LICENSE](LICENSE).
