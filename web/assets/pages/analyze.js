(function () {
  'use strict';
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips'), table: document.getElementById('table'), status: document.getElementById('status') };
  var notice = document.getElementById('notice'), paste = document.getElementById('paste'), current = null, seq = 0;
  var MAX_BYTES = 25 * 1024 * 1024;
  var fields = { exp: function (v) { return v; }, rate: function (v) { return (+v).toFixed(1) + '%'; }, spr: function (v) { return (+v).toFixed(2) + ' of mid'; }, mins: function (v) { return v; } };
  var esc = ImpliedResults.esc;

  function note(kind, html) { notice.className = 'notice ' + kind; notice.innerHTML = '<i></i><span>' + html + '</span>'; }
  function settings() { return { expirations: +document.getElementById('exp').value, rate: +document.getElementById('rate').value, spread: +document.getElementById('spr').value, minStrikes: +document.getElementById('mins').value }; }
  function clearResults() {
    ImpliedCharts.clear(refs.chart);
    refs.chart.innerHTML = '<div class="on-chart-msg"><span>Your chart appears here.</span></div>';
    refs.chips.innerHTML = ''; refs.table.innerHTML = ''; refs.status.textContent = '';
  }

  function parse(text) {
    if (text.length > MAX_BYTES) throw new Error('That file is over 25 MB. Save one ticker at a time.');
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON: ' + e.message); }
    if (data && data.resultByExpiration) throw new Error('This looks like the chain only. Include the schedule too: {"schedule": …, "chain": …}.');
    if (!data || !Array.isArray(data.schedule) || !data.chain || typeof data.chain !== 'object') throw new Error('Expected an object with "schedule" (a list) and "chain", as printed by the snippet on the left.');
    return data;
  }

  // The chart's candles: the file's own close/time when they are usable,
  // otherwise a flat history at the chain's spot price ending today.
  function candlesOf(data) {
    var S = Number(data.chain.underlyingSymbolQuote && data.chain.underlyingSymbolQuote.lastPrice);
    var close = Array.isArray(data.close) ? data.close.map(Number) : [];
    var good = close.length >= 2 && close.every(function (v) { return v > 0 && isFinite(v); });
    if (!good) {
      if (!(S > 0)) throw new Error('No price to anchor the cloud: include "close" (the chart\'s closes) or the chain\'s underlyingSymbolQuote.lastPrice.');
      close = new Array(260).fill(S);
    }
    var time = Array.isArray(data.time) ? data.time.map(Number) : [];
    if (!(good && time.length === close.length && time.every(function (v) { return v > 0 && isFinite(v); }))) {
      var d = new Date(), today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
      time = close.map(function (_, i) { return today - (close.length - 1 - i) * 86400; });
    }
    return { close: close, time: time, S: S > 0 ? S : close[close.length - 1], synthetic: !good };
  }

  async function analyze(data, label) {
    var my = ++seq, s = settings(), c;
    current = data;
    try { c = candlesOf(data); } catch (e) { clearResults(); note('err', esc(e.message)); return; }
    refs.status.textContent = 'running…';
    var out = await Implied.runScript({
      ticker: String(data.ticker || 'TICKER'), schedule: data.schedule, chain: data.chain, close: c.close, time: c.time,
      inputs: { 'Expirations to project': s.expirations, 'Risk-free rate (%)': s.rate, 'Max bid-ask spread (fraction of mid)': s.spread, 'Min usable strikes per expiry': s.minStrikes },
    });
    if (my !== seq) return; // a newer run started meanwhile
    try {
      ImpliedResults.present(refs, { out: out, close: c.close, time: c.time, schedule: data.schedule, chain: data.chain, settings: s });
    } catch (e) {
      clearResults(); note('err', 'Could not draw this chain: ' + esc(e.message)); return;
    }
    var n = Object.keys(data.chain.resultByExpiration || {}).length, name = esc(String(data.ticker || 'This chain'));
    if (out.crash) note('err', esc(out.error));
    else if (out.error) note('warn', '<b class="tk">' + name + '</b>: the indicator would show this message instead of a cloud.');
    else {
      var full = '';
      try { sessionStorage.setItem('implied:chain', JSON.stringify(data)); full = ' · <a class="link" href="/symbol/?t=custom">Open full charts →</a>'; } catch (e) { /* too large or storage blocked */ }
      note('ok', '<b class="tk">' + name + '</b> · spot ' + ImpliedCharts.fmtPrice(c.S) + ' · ' + n + ' expirations in the file' + (label ? ' · ' + esc(label) : '') +
        (c.synthetic ? ' · no closes in the file, so the history is flat' : '') + full);
    }
  }

  function handle(text, label) {
    var data;
    try { data = parse(text); } catch (e) { seq++; current = null; clearResults(); note('err', esc(e.message)); return; }
    run(data, label);
  }
  function run(data, label) {
    analyze(data, label).catch(function (e) { clearResults(); note('err', esc(e && e.message || String(e))); });
  }
  function readFile(f) {
    if (!f) return;
    if (f.size > MAX_BYTES) { note('err', 'That file is over 25 MB. Save one ticker at a time.'); return; }
    f.text().then(function (t) { handle(t, f.name); }, function () { note('err', 'Could not read that file.'); });
  }

  document.getElementById('run').addEventListener('click', function () { if (paste.value.trim()) handle(paste.value); else note('warn', 'Paste the JSON first, or drop a file.'); });
  document.getElementById('example').addEventListener('click', function () {
    var d = Implied.synth(Object.assign({ seed: 11 }, Implied.PRESETS.earnings)), c = Implied.candles(190, 260, 5);
    var text = JSON.stringify({ ticker: 'EXAMPLE', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time });
    paste.value = text;
    handle(text, 'simulated earnings-week chain');
  });
  document.getElementById('file').addEventListener('change', function (e) { readFile(e.target.files[0]); e.target.value = ''; });
  var drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });
  Object.keys(fields).forEach(function (id) {
    var input = document.getElementById(id);
    input.addEventListener('input', function () {
      document.querySelector('output[data-for="' + id + '"]').textContent = fields[id](input.value);
      if (current) { clearTimeout(input._t); input._t = setTimeout(function () { run(current); }, 150); }
    });
  });

  if (new URLSearchParams(location.search).get('from') === 'lab') {
    var saved = null;
    try { saved = sessionStorage.getItem('implied:chain'); } catch (e) { /* storage blocked: nothing to load */ }
    if (saved) handle(saved, 'handed over from the Lab');
  }
})();
