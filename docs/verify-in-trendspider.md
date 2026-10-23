# Verify in TrendSpider (do this first, about 1 hour)

Everything in `dist/implied.js` was built and tested against a mock of TrendSpider's runtime. The calls below could not be confirmed without the editor. Each one is marked `VERIFY` in `src/indicator.js`. Check them in the scripting docs or by experiment, in this order. Each item says what to change if the answer differs. After any change, run `npm test` and paste the new `dist/implied.js`.

## 1. The chain request's second argument (critical)

`request.options_data_for_all_expirations(ticker, EXPIRIES + 1, ['l', 'a', 'b'], 'all')`

TrendSpider's Expected Move script passes `6` here. Implied assumes it is the **number of expirations**.

- **Check:** add `console.log(Object.keys(chain.resultByExpiration).length, Object.keys(Object.values(chain.resultByExpiration)[0]).length)` after the request. It prints the number of expirations and the number of strikes in the first one.
- **If it limits strikes per expiry** (for example 5 strikes on each side of the money), the model would get too few strikes and every expiry would be skipped. Pass the largest value allowed, and confirm that the `'all'` argument returns every strike.
- **If 0-DTE expiries are included in the count,** the `+ 1` already covers one. On SPY there can be several 0–1 DTE expiries a week, so you may need `EXPIRIES + 3`.

## 2. Save a real chain for offline testing

Add this line temporarily after the chain request, run it on SPY, and copy the output from the browser dev tools console into `chains/SPY-<date>.json`:

```js
console.log(JSON.stringify({ ticker: current.ticker, schedule, chain }));
```

Then run `node tools/replay.js chains/SPY-<date>.json`. It prints the forward, strike count, 2.5/50/97.5% prices, skew and Fork for each expiry. Every file in `chains/` is also replayed by `npm test` from then on. Save one chain for an earnings-week stock too. Remove the line before publishing.

## 3. Field codes

`'l'`, `'a'`, `'b'` are read as last, ask and bid. The replay output above confirms this: the forward should sit within a few cents of spot plus carry, and the 50% price close to spot. If a field code for implied volatility or open interest exists, it is not needed (Implied solves IV itself), but an open-interest filter could be added later.

## 4. Placement on the price chart

`describe_indicator('Implied', 'price')`. The category requires the indicator on the underlying's chart. If the second argument is not the placement, use whatever the docs specify for an overlay, or drop it if overlay is the default.

## 5. Daily resolution value

The script accepts `current.resolution` equal to `D`, `1D`, `day` or `daily` (any case). On a Daily chart, check the value with `console.log(current.resolution)`. If it is something else, add it to the regular expression near the top of `src/indicator.js`.

## 6. Projection bar units (calendar or trading days)

`PROJECTION_DAYS = 'calendar'` follows TrendSpider's own Expected Move script, which indexes projections by days to expiry.

- **Check:** paint a test projection with a value only at index 5 on a Friday, and see where it lands. Calendar days put it on Wednesday; trading days put it on the next Friday.
- **If bars are trading days,** set `PROJECTION_DAYS = 'trading'`. The model's clock stays in calendar time either way, so only the bar positions change. This is tested in `test/project.test.js`.

## 7. Gaps in projection series

The Fork ticks are three short series that are `null` except at the last three bars before each forked expiry. Check that TrendSpider draws them as separate short ticks, not one line joining the expiries. If it joins them, paint one series per forked expiry instead, up to 8 extra paint calls: loop over `forks` and call `paint_projection` once per mark per expiry.

## 8. Hidden lines as fill boundaries

The six band-edge lines are painted with `hidden: true` and used only as `fill()` boundaries, as in TrendSpider's own script. Confirm the bands still fill.

## 9. Line styles

`style: 'dotted'` (median) and `style: 'dashed'` (Fork valley). If `dashed` is not a valid style, use `dotted`.

## 10. Label function for future bars (optional polish)

If the docs offer a text or label function that can place text on a future bar, put the Fork label next to the high tick and the skew tag at the far expiry. Until then, both are shown in the legend through the series names, which works today.

## 11. Boolean input (optional polish)

If `input.boolean` exists, change the Show Fork setting to a checkbox. Update the label in `test/indicator.test.js` and the README too.

## 12. Theme

The median uses `#9aa0b4`, which reads on both dark and light themes, so no theme detection is needed. Take screenshots in both themes anyway.
