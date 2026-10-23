(function () {
  'use strict';
  var P = Implied.PRESETS, state = Object.assign({ seed: 7 }, P.index), ids = ['S', 'vol', 'skew', 'curv', 'move', 'eDay', 'spreadPct', 'expirations'];
  var fmt = {
    S: function (v) { return '$' + v; }, vol: function (v) { return v + '%'; }, skew: function (v) { return (+v).toFixed(2); },
    curv: function (v) { return (+v).toFixed(1); }, move: function (v) { return +v ? '±' + v + '%' : 'none'; }, eDay: function (v) { return v + ' days'; },
    spreadPct: function (v) { return v + '% of price'; }, expirations: function (v) { return v; },
  };
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips'), table: document.getElementById('table'), status: document.getElementById('status') };
  var last = null, pending = 0;

  function sync() {
    ids.forEach(function (id) {
      var input = document.getElementById(id), key = id === 'expirations' ? 'count' : id;
      input.value = state[key];
      ImpliedUI.paintRange(input);
      document.querySelector('output[data-for="' + id + '"]').textContent = fmt[id](input.value);
    });
    document.getElementById('eDay').disabled = !(+state.move > 0);
  }
  function read() {
    ids.forEach(function (id) { var v = +document.getElementById(id).value; state[id === 'expirations' ? 'count' : id] = v; });
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
  }
  async function run() {
    var my = ++pending;
    var chainData = Implied.synth(state);
    var c = Implied.candles(state.S, 260, state.seed + 2);
    var settings = { expirations: state.count, rate: 4, spread: 0.5, minStrikes: 8 };
    var out = await Implied.runScript({
      ticker: 'LAB', schedule: chainData.schedule, chain: chainData.chain, close: c.close, time: c.time,
      inputs: { 'Expirations to project': state.count, 'Show Fork': document.getElementById('showFork').checked },
    });
    if (my !== pending) return;
    last = { ticker: 'LAB', schedule: chainData.schedule, chain: chainData.chain, close: c.close, time: c.time };
    ImpliedResults.present(refs, { out: out, close: c.close, time: c.time, schedule: chainData.schedule, chain: chainData.chain, settings: settings });
  }
  var t;
  function schedule() { clearTimeout(t); t = setTimeout(run, 120); }

  ids.forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () { read(); sync(); schedule(); });
  });
  document.getElementById('showFork').addEventListener('change', schedule);
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      state = Object.assign({ seed: state.seed }, P[b.getAttribute('data-preset')]);
      document.querySelectorAll('[data-preset]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      sync(); run();
    });
  });
  document.getElementById('reseed').addEventListener('click', function () { state.seed = Math.floor(Math.random() * 1e6); run(); });
  document.getElementById('download').addEventListener('click', function () {
    if (!last) return;
    var blob = new Blob([JSON.stringify(last)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'implied-lab-chain.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  document.getElementById('analyze').addEventListener('click', function () {
    if (!last) return;
    try { sessionStorage.setItem('implied:chain', JSON.stringify(last)); } catch (e) { ImpliedUI.say('Could not hand the chain over; download it instead.'); return; }
    location.href = '/analyze/?from=lab';
  });
  var q = new URLSearchParams(location.search).get('preset');
  if (q && P[q]) { state = Object.assign({ seed: 7 }, P[q]); document.querySelectorAll('[data-preset]').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-preset') === q); }); }
  sync(); run();
})();
