// The script page: copy (from the code on the page, so it works inside the
// click in every browser), select all, and line wrapping.
(function () {
  'use strict';
  var code = document.getElementById('code'), status = document.getElementById('status'), timer;
  var lines = function (t) { return t.split('\n').length - (/\n$/.test(t) ? 1 : 0); };
  function say(msg) { status.textContent = msg; clearTimeout(timer); timer = setTimeout(function () { status.textContent = ''; }, 4000); }
  function selectAll() {
    var r = document.createRange(); r.selectNodeContents(code);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  document.getElementById('copy').addEventListener('click', function () {
    var text = code.textContent; // the file byte for byte (line numbers are CSS)
    var done = function () { say('Copied ' + lines(text) + ' lines. Paste them into the TrendSpider Custom Indicator editor.'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { selectAll(); say('Copying was blocked. The code is selected: press Ctrl+C (⌘C on Mac).'); });
    } else { selectAll(); say('The code is selected: press Ctrl+C (⌘C on Mac).'); }
  });
  document.getElementById('select').addEventListener('click', function () { selectAll(); code.parentNode.focus({ preventScroll: true }); say('All ' + lines(code.textContent) + ' lines selected.'); });
  var wrap = document.getElementById('wrap'), box = document.getElementById('code-box');
  wrap.addEventListener('click', function () {
    var on = wrap.getAttribute('aria-pressed') !== 'true';
    wrap.setAttribute('aria-pressed', on); box.classList.toggle('wrap', on);
    try { localStorage.setItem('implied-wrap', on ? '1' : ''); } catch (e) { /* storage blocked: not remembered */ }
  });
  try { if (localStorage.getItem('implied-wrap')) wrap.click(); } catch (e) { /* storage blocked */ }
})();
