# Store listing

Paste the block below into the TrendSpider Store description. Keep `#TSBuild26` in it: it is a hackathon requirement.

Screenshots (Daily chart, about 6 months of history visible, so the cloud fills the right third):

1. SPY: the much wider downside tail and the "Downside tail … upside" line in the summary panel (2.8× on the Oct 23 close).
2. An event stock. Use a Fork if a live chart shows one: check binary-event tickers (an FDA decision, a deal vote) with `npm run chain -- <TICKER>` first. Otherwise a stock reporting this week, where the cloud widens sharply at the first post-earnings expiry. On Oct 23 closing chains, none of 69 liquid tickers, earnings weeks included, priced two outcomes, so do not plan on a megacap Fork.
3. A high-IV stock with a fat right tail (GME read "Upside tail 1.5× downside" on Oct 23).

---

```text
Implied

See where the options market actually thinks price is going, with the real shape of the bet: skewed, fat-tailed, and sometimes split in two.

Implied reads the live options chain and paints the market's full probability distribution into the future on your chart, one cloud out to each expiry. Expected-move cones assume a symmetric bell curve. Implied recovers the distribution the market is actually pricing.

HOW TO READ IT
- Dense core: the middle 50% of outcomes (25th-75th percentile)
- Lighter bands: the 80% and 95% ranges
- Dotted line: the median outcome
- One side wider than the other: the market is paying more for that tail. The summary panel says by how much (measured in percentage moves), e.g. "Downside tail 1.4x upside"
- Orange Fork: shown only when the market prices two separate outcomes, as before a binary event (an FDA decision, a deal vote). It is rare by design: most earnings are priced as one wide range, and then Implied draws no Fork. The grey mark between the two outcomes is the least likely zone. The summary panel gives the prices, e.g. "Fork: $182.00 / $201.00 · least likely $190.00"
- Summary panel (top left): a small chart of the distribution, its median and 95% range in dollars, and the chance of a 10% move either way

HOW IT WORKS
For each expiry, Implied cleans the out-of-the-money quotes, finds the forward price from put-call parity, and solves implied volatility. It then fits a smooth volatility smile, weighting each quote by its bid-ask spread and letting the data choose the smoothing. Finally it takes the second derivative of the rebuilt call prices with respect to strike (Breeden-Litzenberger, 1978). That gives the risk-neutral density, which is turned into percentile bands and checked for two peaks. Between expiries the cloud widens with the square root of time.

SETTINGS
Expirations to project (default 4), risk-free rate (4%), max bid-ask spread (0.5 of mid), minimum strikes per expiry (8), Fork on/off.

REQUIREMENTS
Daily timeframe. Tickers with listed US options. TrendSpider's OPRA options data add-on. On tickers without options, Implied shows a message instead of drawing.

NOTE
This is the market's risk-neutral distribution: the price of each outcome. It includes risk premia, so it is not a guaranteed forecast of real-world odds.

Free and open source (Apache-2.0): github.com/linoxbt/Implied

#TSBuild26
```
