# Release checklist

Each item is a disqualification or scoring risk, so each is a release gate. Sources: the hackathon page, the judging PDF and the registration form, linked from the [build spec](https://claude.ai/artifact/55ZafVmcfj2QnxCYQAV5fB).

## Before anything else

- [ ] Registered on the official form. Registration officially closed on Sept 16, so confirm late acceptance in the hackathon Discord.
- [ ] Deadline confirmed in Discord. The hackathon page says October 26; the PDF and form still say October 5. Assume 11:59pm ET on October 26 (4:59am October 27 in Lagos) unless told otherwise.

## Build

- [ ] Every item in [verify-in-trendspider.md](verify-in-trendspider.md) checked; code changed where needed.
- [ ] `npm test` passes and `npm run check` says dist is up to date.
- [ ] Real chains saved in `chains/` for SPY and one earnings-week stock; both replay cleanly (`node tools/replay.js`).
- [ ] The temporary `console.log` dump line removed.

## Live checks on TrendSpider

- [ ] SPY and QQQ: smooth cloud, downside tail wider than upside, "Downside tail" in the legend.
- [ ] Nearest expiry: TrendSpider's Expected Move range (about ±1 standard deviation, a 68% range) should land between Implied's core band (50%) and its 80% band edges.
- [ ] An earnings-week stock: the Fork appears at the first post-earnings expiry, or a clearly widened band if the market is not pricing two outcomes.
- [ ] A high-IV stock: no crash, right tail visibly fat.
- [ ] An illiquid ticker: "Not enough liquid strikes" message, no broken drawing.
- [ ] A crypto pair and a futures contract: "No options data" message.
- [ ] Weekly and intraday charts: "Daily timeframe only" message.
- [ ] Dark and light theme screenshots taken.
- [ ] Cloud visible within 3 seconds of adding the indicator.
- [ ] Judge-eye test. Someone who has never seen the project looks at the SPY and earnings charts for 10 seconds. They should be able to say "it'll land around here, with more risk to the downside" or "two outcomes". If not, fix the labels first.

## Publish and submit

- [ ] Published to the TrendSpider Store as a **new** script: public, free to apply, source open.
- [ ] Store description pasted from [store-listing.md](store-listing.md), including `#TSBuild26`; screenshots attached.
- [ ] Plotted on the underlying's price chart (category requirement).
- [ ] Official submission form completed (the link is in the builder-pack email), category **Most Unique Options Indicator** only.
- [ ] Submitted before the deadline.
- [ ] Demo clip posted on X tagging @TrendSpider.

## Demo script (90 seconds)

1. **SPY:** "Here's where the options market prices SPY over the next month. Notice the bottom is wider: that's crash insurance, visible."
2. **Earnings-week stock:** "Now a stock with earnings Thursday. The cloud splits. The market is pricing two outcomes, and the middle, where everyone's average sits, is the least likely place to land."
3. **High-IV stock:** "And here the upside tail is enormous. That's what the options market is paying for."
4. **Close:** "Every expected-move tool assumes a bell curve. Implied shows the real shape of the bet."
