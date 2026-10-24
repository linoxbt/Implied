(function () {
  'use strict';
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips') };
  var bell = document.getElementById('bell'), caption = document.getElementById('caption'), seq = 0, last = null, key = 'earnings';
  var CAPTIONS = {
    earnings: '<b>Dashed lines:</b> a bell curve with the same median and spread. A bell curve says the middle is the most likely place to land. Here the market prices two outcomes after the event (orange ticks), and the middle is the least likely.',
    index: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s lower edge reaches below it: index options pay for crash risk a bell curve leaves out.',
    meme: '<b>Dashed lines:</b> a bell curve with the same median and spread. The cloud\'s upper edge runs past it: the market prices a fat right tail, big rallies a bell curve calls near-impossible.',
  };
  function draw() {
    if (!last) return;
    ImpliedResults.present(refs, Object.assign({ bell: bell.checked }, last));
    caption.innerHTML = CAPTIONS[key];
    caption.hidden = !bell.checked;
  }
  async function show(k) {
    var my = ++seq, p = Object.assign({ seed: 7 }, Implied.PRESETS[k]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    if (my !== seq) return;
    last = { out: out, close: c.close, time: c.time, schedule: d.schedule, chain: d.chain, settings: { expirations: 4, rate: 4, spread: 0.5, minStrikes: 8 } };
    draw();
  }
  document.querySelectorAll('[data-demo]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-demo]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      key = b.getAttribute('data-demo'); show(key);
    });
  });
  bell.addEventListener('change', draw);
  show(key);
})();
