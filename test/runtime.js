// A mock of TrendSpider's custom-indicator runtime, covering exactly the calls
// Implied makes. It runs dist/implied.js as pasted into the editor and records
// what it paints, so tests can check the chart output end to end.
'use strict';
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '../dist/implied.js');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class IndicatorError extends Error {}

async function runIndicator({ ticker = 'TEST', resolution = 'D', schedule, chain, close, time, inputs = {}, source }) {
  const code = source || fs.readFileSync(SCRIPT, 'utf8');
  const BARS = close.length + 400;
  const out = { name: null, placement: null, inputs: [], projections: [], fills: [], error: null, requests: [] };
  const seriesIds = new Map();

  const g = {
    describe_indicator: (name, placement) => { out.name = name; out.placement = placement; },
    current: { ticker, resolution },
    input: {
      number: (label, def, opts) => {
        out.inputs.push({ label, def, opts });
        return label in inputs ? inputs[label] : def;
      },
    },
    assert: (cond, msg) => { if (!cond) throw new IndicatorError(msg); },
    request: {
      options_schedule: async t => { out.requests.push(['options_schedule', t]); return typeof schedule === 'function' ? schedule() : schedule; },
      options_data_for_all_expirations: async (...args) => {
        out.requests.push(['options_data_for_all_expirations', ...args]);
        return typeof chain === 'function' ? chain(...args) : chain;
      },
    },
    close, time,
    series_of: v => Array(BARS).fill(v),
    paint_projection: (series, opts = {}) => {
      const id = { kind: 'projection', index: out.projections.length };
      out.projections.push({ series: series.slice(), ...opts });
      seriesIds.set(id, out.projections.length - 1);
      return id;
    },
    fill: (a, b, color, opacity) => out.fills.push({ a: seriesIds.get(a), b: seriesIds.get(b), color, opacity }),
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

module.exports = { runIndicator, IndicatorError };
