// Synthetic option chains in TrendSpider's response shape, priced from a known
// distribution so tests can compare what Implied recovers against the truth.
// Generation lives in web/assets/engine.js (shared with the website); this
// file pins the date and defines the test scenarios.
'use strict';
const engine = require('../web/assets/engine.js');

// The last candle of every test chart: Friday 23 Oct 2026 (UTC midnight).
const AS_OF = Date.UTC(2026, 9, 23);

const ticker = p => engine.ticker({ asOf: AS_OF, ...p });
const candles = (S, n = 300, seed = 3) => engine.candles(S, n, seed, AS_OF);

const smile = (atm, skew = 0, curv = 0) => ({ kind: 'smile', atm, skew, curv });
const mix = (S, dte, jump, sig, w = 0.5) => {
  const F = S * Math.exp(0.04 * dte / 365);
  return { kind: 'mix', parts: [{ w, F: F * Math.exp(-jump), sig }, { w: 1 - w, F: F * Math.exp(jump), sig }] };
};
// Weekdays from 1 to `days` calendar days out (an expiry every trading day).
const weekdays = days => Array.from({ length: days }, (_, i) => i + 1)
  .filter(d => { const w = new Date(AS_OF + d * 86400000).getUTCDay(); return w !== 0 && w !== 6; });

const SCENARIOS = {
  // Equity index: put skew, four weekly/monthly expiries.
  SPY: () => ticker({ S: 580, q: 0.013, spreadPct: 0.02,
    expiries: [7, 14, 28, 49].map(dte => ({ dte, model: smile(0.16, -0.35, 0.6) })) }),
  // Like a real SPY chain: an expiry every weekday, $1 strikes, some strikes
  // missing and some with only a call or only a put.
  SPY_DAILY: () => ticker({ S: 580, q: 0.013, spreadPct: 0.02, step: 1, gaps: 0.05, oneSided: 0.05,
    expiries: weekdays(70).map(dte => ({ dte, model: smile(0.16, -0.35, 0.6) })) }),
  // Earnings between the 1st and 2nd expiry: the 2nd+ expiries price two outcomes.
  EARN: () => ticker({ S: 190, spreadPct: 0.03,
    expiries: [{ dte: 3, model: smile(0.30, -0.2, 0.8) }, { dte: 10, model: mix(190, 10, 0.08, 0.22) },
      { dte: 17, model: mix(190, 17, 0.08, 0.22) }, { dte: 38, model: mix(190, 38, 0.08, 0.22) }] }),
  // Meme stock: very high IV, call skew (fat right tail), wide spreads.
  MEME: () => ticker({ S: 24, spreadPct: 0.06,
    expiries: [7, 14, 28, 56].map(dte => ({ dte, model: smile(1.1, 0.45, 0.6) })) }),
  // Illiquid: every quote too wide.
  ILLIQ: () => ticker({ S: 12, spreadPct: 0.9,
    expiries: [30, 60].map(dte => ({ dte, model: smile(0.6) })) }),
};

module.exports = {
  AS_OF, ticker, candles, smile, mix, weekdays, SCENARIOS,
  rng: engine.rng, trueCall: engine.trueCall,
  expiryQuotes: o => engine.expiryQuotes(o),
};
