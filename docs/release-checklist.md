# Release checklist

Each item is a disqualification or scoring risk, so each is a release gate. Sources: the hackathon page, the judging PDF and the registration form.

## Before anything else

- [ ] Registered on the official form. Registration officially closed on Sept 16, so confirm late acceptance in the hackathon Discord.
- [ ] Deadline time confirmed (ask adam@trendspider.net or the Discord). The form says October 26; assume 11:59pm ET on October 26 (4:59am October 27 in Lagos) unless told otherwise, and aim to submit by midday ET on October 26.

## Build

- [ ] Every item in [verify-in-trendspider.md](verify-in-trendspider.md) checked; code changed where needed.
- [x] `npm test` passes and `npm run check` says dist is up to date (CI green on `main`).
- [x] Real chains replay cleanly: 22 tickers from Cboe's delayed quotes (Oct 23 close), see the README's "Tested on real chains".
- [ ] Real chains saved from TrendSpider itself for SPY and one earnings-week stock; both replay cleanly (`node tools/replay.js`). They stay on your machine: OPRA data is licensed and `chains/` is git-ignored apart from the synthetic examples.
- [ ] Risk-free rate default still close to the 3-month T-bill yield (4.0% at release); update the default in `src/indicator.js` and the docs if it has moved by more than half a point.
- [ ] The temporary `console.log` dump line removed.

## Live checks on TrendSpider

- [ ] SPY and QQQ: smooth cloud, downside tail wider than upside, "Downside tail" in the summary panel.
- [ ] Nearest expiry: TrendSpider's Expected Move range (about ±1 standard deviation, a 68% range) should land between Implied's core band (50%) and its 80% band edges.
- [ ] An earnings-week stock: a clearly widened band at the first post-earnings expiry, and a Fork only if the market prices two outcomes (rare: none of 69 liquid tickers did on Oct 23).
- [ ] A high-IV stock: no crash, right tail visibly fat.
- [ ] An illiquid ticker: "Not enough liquid strikes" message, no broken drawing.
- [ ] A crypto pair and a futures contract: "No options data" message.
- [ ] Weekly and intraday charts: "Daily timeframe only" message.
- [ ] Dark and light theme screenshots taken.
- [ ] Cloud visible within 3 seconds of adding the indicator.
- [ ] Judge-eye test. Someone who has never seen the project looks at the SPY and earnings charts for 10 seconds. They should be able to say "it'll land around here, with more risk to the downside" or "two outcomes". If not, fix the labels first.

## Publish and submit

- [ ] Published to the TrendSpider Store as a **new** script: public, free to apply, **source code visible**.
- [ ] Exact Store title recorded (expected: `Implied`) for the submission form.
- [ ] Store description pasted from [store-listing.md](store-listing.md), including `#TSBuild26`; screenshots attached.
- [ ] Plotted on the underlying's price chart (category requirement).
- [ ] Official submission form completed: email of the TrendSpider account that published it, the exact Store title, category **Most Unique Options Indicator**, the short description below, and the three confirmations. A second category needs a second form; enter one only if the organisers confirm the same script may be entered twice.

  Short description for the form:

  > Implied paints the options market's full probability distribution into the future on your chart. It reads every liquid strike in the live chain, recovers the distribution the market is pricing (Breeden-Litzenberger) and draws it as 50/80/95% bands around a median, out to each modelled expiry. Unlike expected-move cones, it shows the real shape of the bet: which tail the market is paying for ("Downside tail 1.4× upside"), the chance of a 10% move either way, and, when the market prices two separate outcomes, the Fork and the least likely zone between them. Free and open source. #TSBuild26
- [ ] Submitted before the deadline.
- [ ] Demo clip posted on X tagging @TrendSpider.

## Demo script (90 seconds)

1. **SPY:** "Here's where the options market prices SPY over the next month. Notice the bottom is wider: that's crash insurance, visible."
2. **Event stock.** If a live chart shows a Fork: "This stock has a binary event next week. The cloud splits: the market is pricing two outcomes, and the middle, where everyone's average sits, is the least likely place to land." If not (the usual case for earnings): "This stock reports Thursday. Look how the cloud jumps wide right after the report date: the market is pricing a big move, either way. It is one wide range, not two outcomes, so Implied draws no Fork. When the market does price two outcomes, it splits the cloud and marks the least likely zone."
3. **High-IV stock:** "And here the upside tail is enormous. That's what the options market is paying for."
4. **Close:** "Every expected-move tool assumes a bell curve. Implied shows the real shape of the bet."
