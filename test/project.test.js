// Projection: expiry quantiles -> one value per future bar.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

// Lognormal shapes with 20% vol at three expiries, forward drifting up.
const S = 100, sig = 0.2;
const shape = dte => {
  const T = dte / 365, F = S * Math.exp(0.04 * T);
  const z = [-1.959964, -1.281552, -0.674490, 0, 0.674490, 1.281552, 1.959964];
  return { dte, T, F, q: z.map(x => F * Math.exp(-sig * sig * T / 2 + x * sig * Math.sqrt(T))) };
};
const shapes = [shape(7), shape(30), shape(60)];

test('starts at the anchor, hits each expiry exactly (scaled by anchor/S), stops after the last', () => {
  const { times, barOfDte } = core.projectionTimeline('calendar', 0, 60);
  const anchor = 101;
  const lines = core.projectQuantiles(shapes, S, anchor, times);
  lines.forEach(l => assert.equal(l[0], anchor));
  for (const s of shapes) s.q.forEach((q, j) => {
    const got = lines[j][barOfDte[s.dte]];
    assert.ok(Math.abs(got / (q * anchor / S) - 1) < 1e-9, `dte ${s.dte} j ${j}`);
  });
  const tl = core.projectionTimeline('calendar', 0, 70);
  const ext = core.projectQuantiles(shapes, S, S, tl.times);
  assert.equal(ext[0][65], null);
});

test('widens like sqrt(t) before the first expiry (the spec skeleton grew like t^1.5)', () => {
  const { times } = core.projectionTimeline('calendar', 0, 7);
  const lines = core.projectQuantiles([shape(7)], S, S, times);
  const width = i => Math.log(lines[6][i] / lines[0][i]);
  // width(t) / width(T) should equal sqrt(t / T)
  for (const day of [1, 2, 4]) {
    const ratio = width(day) / width(7);
    assert.ok(Math.abs(ratio - Math.sqrt(day / 7)) < 0.01, `day ${day}: ${ratio} vs ${Math.sqrt(day / 7)}`);
  }
});

test('a constant-vol lognormal stays exact between expiries', () => {
  const { times } = core.projectionTimeline('calendar', 0, 60);
  const lines = core.projectQuantiles(shapes, S, S, times);
  for (const day of [15, 45]) {
    const ref = shape(day);
    ref.q.forEach((q, j) => {
      // u is constant across expiries for a lognormal except the -σ²T/2 drift; allow a small tolerance
      assert.ok(Math.abs(lines[j][day] / q - 1) < 0.003, `day ${day} j ${j}: ${lines[j][day]} vs ${q}`);
    });
  }
});

test('bands never cross and are continuous (no jumps at expiries)', () => {
  const skewed = shapes.map((s, i) => ({ ...s, F: s.F * (1 + 0.01 * i), q: s.q.map((q, j) => q * (1 + 0.002 * (3 - j) * i)) }));
  const { times } = core.projectionTimeline('calendar', 0, 60);
  const lines = core.projectQuantiles(skewed, S, S, times);
  for (let i = 1; i <= 60; i++) {
    for (let j = 1; j < 7; j++) assert.ok(lines[j][i] >= lines[j - 1][i]);
    for (let j = 0; j < 7; j++) assert.ok(Math.abs(lines[j][i] / lines[j][i - 1] - 1) < 0.03, `jump at bar ${i}`);
  }
});

test('trading-day timeline skips weekends but keeps calendar time', () => {
  const friday = Date.UTC(2026, 9, 23) / 1000; // Fri 23 Oct 2026
  const { times, barOfDte } = core.projectionTimeline('trading', friday, 10);
  assert.equal(barOfDte[1], 0); // Saturday
  assert.equal(barOfDte[3], 1); // Monday is the first bar
  assert.equal(barOfDte[10], 6); // Fri 30 Oct... through Mon 2 Nov
  assert.equal(times[1], 3 / 365);
  assert.equal(times.length, 7);
  const ms = core.projectionTimeline('trading', friday * 1000, 10); // milliseconds also accepted
  assert.deepEqual(ms.barOfDte, barOfDte);
});
