(function () {
  'use strict';
  var refs = { chart: document.getElementById('chart'), chips: document.getElementById('chips'), table: document.getElementById('table'), status: document.getElementById('status') };
  var notice = document.getElementById('notice'), paste = document.getElementById('paste'), current = null;
  var fields = { exp: function (v) { return v; }, rate: function (v) { return (+v).toFixed(1) + '%'; }, spr: function (v) { return (+v).toFixed(2) + ' of mid'; }, mins: function (v) { return v; } };

  function note(kind, html) { notice.className = 'notice ' + kind; notice.innerHTML = '<i></i><span>' + html + '</span>'; }
  function settings() { return { expirations: +document.getElementById('exp').value, rate: +document.getElementById('rate').value, spread: +document.getElementById('spr').value, minStrikes: +document.getElementById('mins').value }; }

  function parse(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON: ' + e.message); }
    if (data && data.schedule && data.chain) return data;
    if (data && data.resultByExpiration) throw new Error('This looks like the chain only. Include the schedule too: {"schedule": …, "chain": …}.');
    throw new Error('Expected an object with "schedule" and "chain", as printed by the snippet on the left.');
  }

  async function analyze(data, label) {
    current = data;
    var s = settings();
    var S = Number(data.chain && data.chain.underlyingSymbolQuote && data.chain.underlyingSymbolQuote.lastPrice) || 100;
    var close = Array.isArray(data.close) && data.close.length ? data.close : new Array(260).fill(S);
    var now = Math.floor(Date.now() / 1000);
    var time = Array.isArray(data.time) && data.time.length === close.length ? data.time : close.map(function (_, i) { return now - (close.length - 1 - i) * 86400; });
    var out = await Implied.runScript({
      ticker: data.ticker || 'TICKER', schedule: data.schedule, chain: data.chain, close: close, time: time,
      inputs: { 'Expirations to project': s.expirations, 'Risk-free rate (%)': s.rate, 'Max bid-ask spread (fraction of mid)': s.spread, 'Min usable strikes per expiry': s.minStrikes },
    });
    ImpliedResults.present(refs, { out: out, close: close, time: time, schedule: data.schedule, chain: data.chain, settings: s });
    var n = Object.keys(data.chain.resultByExpiration || {}).length;
    if (out.crash) note('err', ImpliedResults.esc(out.error));
    else if (out.error) note('warn', '<b>' + ImpliedResults.esc(data.ticker || 'This chain') + '</b>: the indicator would show this message instead of a cloud.');
    else note('ok', '<b>' + ImpliedResults.esc(data.ticker || 'Chain') + '</b> · spot ' + ImpliedCharts.fmtPrice(S) + ' · ' + n + ' expirations in the file' + (label ? ' · ' + label : ''));
  }

  function handle(text, label) {
    try { analyze(parse(text), label); } catch (e) { note('err', ImpliedResults.esc(e.message)); }
  }

  document.getElementById('run').addEventListener('click', function () { if (paste.value.trim()) handle(paste.value); else note('warn', 'Paste the JSON first, or drop a file.'); });
  document.getElementById('example').addEventListener('click', function () {
    var d = Implied.synth(Object.assign({ seed: 11 }, Implied.PRESETS.earnings)), c = Implied.candles(190, 260, 5);
    var data = { ticker: 'EXAMPLE', schedule: d.schedule, chain: d.chain, close: c.close, time: c.time };
    paste.value = JSON.stringify(data).slice(0, 4000) + '…';
    analyze(data, 'simulated earnings-week chain');
  });
  document.getElementById('file').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) f.text().then(function (t) { handle(t, f.name); }); });
  var drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) f.text().then(function (t) { handle(t, f.name); }); });
  Object.keys(fields).forEach(function (id) {
    var input = document.getElementById(id);
    input.addEventListener('input', function () {
      document.querySelector('output[data-for="' + id + '"]').textContent = fields[id](input.value);
      if (current) { clearTimeout(input._t); input._t = setTimeout(function () { analyze(current); }, 150); }
    });
  });

  if (new URLSearchParams(location.search).get('from') === 'lab') {
    try { var saved = sessionStorage.getItem('implied:chain'); if (saved) analyze(JSON.parse(saved), 'handed over from the Lab'); } catch (e) { /* storage blocked: nothing to load */ }
  }
})();
