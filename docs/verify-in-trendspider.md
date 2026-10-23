# Verify in TrendSpider (about 20 minutes)

Every TrendSpider call in `src/indicator.js` is now checked against TrendSpider's own scripting reference ([platform-docs.trendspider.com/scripting/docs](https://platform-docs.trendspider.com/scripting/docs/)). The tests run the built script against a stand-in that enforces the documented rules (40 strikes per side, valid line styles, the 100-value projection limit, fixed line names, the same paint calls every run).

## Settled by the docs

| Item | What the docs say | What the script does |
| --- | --- | --- |
| `options_data_for_all_expirations(ticker, strikes, metrics, types)` | `strikes` is the number of strikes on **each side of the price**, max 40; every expiry is returned | Requests 40. (The spec's skeleton passed 5, which would have left too few strikes and no cloud.) |
| Field codes | `b` bid, `a` ask, `l` last; `iv`, `oi` and greeks also exist | Uses `b` and `a`; solves IV itself so it controls the cleaning |
| `describe_indicator(name, type)` | `type` is `price` or `lower`, default `price` | `'price'`: drawn on the underlying's chart |
| `current.resolution` | `D` on daily charts | Requires `D` |
| `input.boolean(title, default)` | Exists (checkbox) | Show Fork is a checkbox |
| `paint_projection(values, params)` | Values start at the last candle; at most 100 are painted | Index 0 is the last close; series are capped at 100 |
| Line styles | `line`, `dotted`, `column`, … (no `solid` or `dashed`) | Uses `line` and `dotted` only |
| Line names and paint calls | Names must be fixed; every `paint()`, `fill()` and `paint_overlay()` must run every time | Fixed names; Fork series are always painted (empty when there is no Fork) |
| Text on the chart | `paint_overlay()` draws a styled table, with Chart.js charts, using theme colors | A top-left summary panel: mini distribution chart, median and 95% range, skew sentence, Fork prices |
| Request limits | Up to 6 data requests besides price history | Uses 2, sent in parallel |

## Still to check in the editor

1. **Projection bar units.** The docs do not say whether future bars are calendar days or trading days. Implied follows TrendSpider's own Expected Move from Options script (calendar days). On a Friday, check that the cloud's end lines up with the last expiry date. If the cloud runs past it, set `PROJECTION_DAYS = 'trading'` in `src/indicator.js`, run `npm test`, and paste the new `dist/implied.js`.
2. **The summary panel.** Check it renders top left in both dark and light themes and doesn't cover the cloud.
3. **A real chain.** Add this line right after the requests, run on SPY, and copy the console output into `chains/SPY-<date>.json`:

   ```js
   console.log(JSON.stringify({ ticker: current.ticker, schedule, chain, close: close.slice(-260), time: time.slice(-260) }));
   ```

   Then run `node tools/replay.js chains/SPY-<date>.json` (or drop it on the site's Analyze page). Every file in `chains/` is also replayed by `npm test`. Save one earnings-week stock too, and remove the line before publishing.
