(function () {
  'use strict';
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips') };
  var seq = 0;
  async function show(key) {
    var my = ++seq, p = Object.assign({ seed: 7 }, Implied.PRESETS[key]), d = Implied.synth(p), c = Implied.candles(p.S, 260, 5);
    var out = await Implied.runScript({ ticker: 'DEMO', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    if (my !== seq) return;
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

// The rope: a curve that curls in from the left edge and runs through the
// top of each hanging card, redrawn whenever the layout changes.
(function () {
  'use strict';
  var stage = document.querySelector('.rope-stage'), path = document.getElementById('rope-path');
  if (!stage || !path) return;
  function draw() {
    var box = stage.getBoundingClientRect();
    var pts = [].map.call(stage.querySelectorAll('.hang a'), function (a) {
      var r = a.getBoundingClientRect();
      return [r.left - box.left + r.width / 2, r.top - box.top + 34];
    });
    if (!pts.length) return;
    var W = box.width, first = pts[0], last = pts[pts.length - 1];
    var d = 'M -20 ' + (first[1] - 70) + ' C 40 ' + (first[1] - 90) + ', ' + (first[0] - 120) + ' ' + (first[1] - 40) + ', ' + first[0] + ' ' + first[1];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2, sag = 46;
      d += ' C ' + (a[0] + (b[0] - a[0]) * 0.35) + ' ' + (a[1] + sag) + ', ' + (b[0] - (b[0] - a[0]) * 0.35) + ' ' + (b[1] + sag) + ', ' + b[0] + ' ' + b[1];
    }
    d += ' C ' + (last[0] + 90) + ' ' + (last[1] + 30) + ', ' + (W - 10) + ' ' + (last[1] - 10) + ', ' + (W + 30) + ' ' + (last[1] + 40);
    path.setAttribute('d', d);
    var len = Math.ceil(path.getTotalLength ? path.getTotalLength() : 4000);
    path.style.setProperty('--len', len);
  }
  draw();
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(stage); else window.addEventListener('resize', draw);
  var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { draw(); stage.classList.add('in'); io.disconnect(); } });
  }, { threshold: 0.25 });
  if (io) io.observe(stage); else stage.classList.add('in');
})();
