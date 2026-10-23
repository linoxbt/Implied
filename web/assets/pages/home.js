(function () {
  'use strict';
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips') };
  async function show(key) {
    var p = Object.assign({ seed: 7 }, Implied.PRESETS[key]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    ImpliedResults.present(refs, { out: out, close: c.close, time: c.time, schedule: d.schedule, chain: d.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 } });
    document.getElementById('toLab').href = '/lab/?preset=' + key;
  }
  document.querySelectorAll('[data-demo]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-demo]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      show(b.getAttribute('data-demo'));
    });
  });
  show('earnings');
})();
