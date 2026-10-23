# Store listing

Paste the block below into the TrendSpider Store description. Keep `#TSBuild26` in it: it is a hackathon requirement.

Screenshots (Daily chart, about 6 months of history visible, so the cloud fills the right third):

1. SPY: the wider downside tail and the "Downside tail … upside" line in the summary panel.
2. An earnings-week stock with the Fork showing.
3. A high-IV stock with a fat right tail.

---

```text
Implied

See where the options market actually thinks price is going, with the real shape of the bet: skewed, fat-tailed, and sometimes split in two.

Implied reads the live options chain and paints the market's full probability distribution into the future on your chart, one cloud out to each expiry. Expected-move cones assume a symmetric bell curve. Implied recovers the distribution the market is actually pricing.

HOW TO READ IT
- Dense core: the middle 50% of outcomes (25th-75th percentile)
- Lighter bands: the 80% and 95% ranges
- Dotted line: the median outcome
- One side wider than the other: the market is paying more for that tail. The summary panel says by how much, e.g. "Downside tail 1.4x upside"
- Orange Fork: the market is pricing two separate outcomes, common before earnings. The grey mark between them is the least likely zone. The summary panel gives the prices, e.g. "Fork: $182.00 / $201.00 · least likely $190.00"
- Summary panel (top left): a small chart of the distribution, its median and 95% range
Exact prices for every band are in the legend and on hover.

HOW IT WORKS
For each expiry, Implied cleans the out-of-the-money quotes, finds the forward price from put-call parity, and solves implied volatility. It then fits a smooth volatility smile, weighting each quote by its bid-ask spread and letting the data choose the smoothing. Finally it takes the second derivative of the rebuilt call prices with respect to strike (Breeden-Litzenberger, 1978). That gives the risk-neutral density, which is turned into percentile bands and checked for two peaks. Between expiries the cloud widens with the square root of time.

SETTINGS
Expirations to project (default 4), risk-free rate (4%), max bid-ask spread (0.5 of mid), minimum strikes per expiry (8), Fork on/off.

REQUIREMENTS
Daily timeframe. Tickers with listed US options. OPRA options data subscription. On tickers without options, Implied shows a message instead of drawing.

NOTE
This is the market's risk-neutral distribution: the price of each outcome. It includes risk premia, so it is not a guaranteed forecast of real-world odds.

Free and open source (Apache-2.0): github.com/linoxbt/Implied

#TSBuild26
```
