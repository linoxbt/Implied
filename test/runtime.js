// A mock of TrendSpider's custom-indicator runtime, covering exactly the calls
// Implied makes. It runs dist/implied.js as pasted into the editor and records
// what it paints, so tests can check the chart output end to end.
'use strict';
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '../dist/implied.js');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class IndicatorError extends Error {}

// What TrendSpider's scripting reference allows (platform-docs.trendspider.com/scripting).
const STYLES = ['line', 'column', 'stacked_column', 'dotted', 'ladder', 'labels_above', 'labels_below', 'area', 'arearange', 'columnrange', 'candles', 'boxplot', 'bubble'];
const MAX_PROJECTION = 100;

// Keep `n` strikes on each side of the price for every expiry, as
// request.options_data_for_all_expirations(ticker, n, ...) does (max 40).
function limitStrikes(chain, n, fallbackSpot) {
  if (!chain || !chain.resultByExpiration) return chain;
  const S = Number(chain.underlyingSymbolQuote && chain.underlyingSymbolQuote.lastPrice) || fallbackSpot;
  const k = Math.min(40, Math.max(1, Number(n) || 0));
  const out = {};
  for (const [code, byStrike] of Object.entries(chain.resultByExpiration)) {
    const keys = Object.keys(byStrike || {}).filter(x => Number(x) > 0).sort((a, b) => Number(a) - Number(b));
    const below = keys.filter(x => Number(x) < S).slice(-k), above = keys.filter(x => Number(x) >= S).slice(0, k);
    out[code] = {};
    for (const x of below.concat(above)) out[code][x] = byStrike[x];
  }
  return { ...chain, resultByExpiration: out };
}

async function runIndicator({ ticker = 'TEST', resolution = 'D', schedule, chain, close, time, inputs = {}, source }) {
  const code = source || fs.readFileSync(SCRIPT, 'utf8');
  const out = { name: null, placement: null, inputs: [], projections: [], fills: [], overlays: [], error: null, requests: [] };
  const seriesIds = new Map();
  const check = (cond, msg) => { if (!cond) throw new Error('TrendSpider rule broken: ' + msg); };
  const declare = (kind, label, def, opts) => { out.inputs.push({ kind, label, def, opts }); return label in inputs ? inputs[label] : def; };

  const g = {
    describe_indicator: (name, placement) => { out.name = name; out.placement = placement; },
    current: { ticker, resolution },
    input: { number: (l, d, o) => declare('number', l, d, o), boolean: (l, d, o) => declare('boolean', l, d === undefined ? true : d, o) },
    assert: (cond, msg) => { if (!cond) throw new IndicatorError(msg); },
    request: {
      options_schedule: async t => { out.requests.push(['options_schedule', t]); return typeof schedule === 'function' ? schedule() : schedule; },
      options_data_for_all_expirations: async (...args) => {
        out.requests.push(['options_data_for_all_expirations', ...args]);
        const c = typeof chain === 'function' ? chain(...args) : chain;
        return limitStrikes(c, args[1], close[close.length - 1]);
      },
    },
    close, time,
    series_of: v => Array(close.length).fill(v),
    paint_projection: (series, opts = {}) => {
      check(Array.isArray(series), 'paint_projection needs an array');
      check(!opts.style || STYLES.includes(opts.style), 'unknown style "' + opts.style + '"');
      check(opts.name, 'every line needs a fixed name');
      const id = { kind: 'projection', index: out.projections.length };
      out.projections.push({ series: series.slice(0, MAX_PROJECTION), length: series.length, ...opts });
      seriesIds.set(id, out.projections.length - 1);
      return id;
    },
    fill: (a, b, color, opacity, title) => {
      check(seriesIds.has(a) && seriesIds.has(b), 'fill() needs two painted lines');
      out.fills.push({ a: seriesIds.get(a), b: seriesIds.get(b), color, opacity, title });
    },
    paint_overlay: (name, params, definition) => {
      check(typeof name === 'string' && definition && Array.isArray(definition.rows), 'paint_overlay(name, params, { rows })');
      JSON.stringify(definition); // must be serializable
      out.overlays.push({ name, params, definition });
    },
  };

  const names = Object.keys(g);
  const fn = new AsyncFunction(...names, '"use strict";\n' + code);
  const t0 = process.hrtime.bigint();
  try {
    await fn(...names.map(n => g[n]));
  } catch (e) {
    if (e instanceof IndicatorError) out.error = e.message;
    else throw e;
  }
  out.ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return out;
}

module.exports = { runIndicator, IndicatorError, limitStrikes, STYLES };
