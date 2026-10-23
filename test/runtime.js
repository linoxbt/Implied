// Runs the built dist/implied.js against the TrendSpider stand-in shared with
// the website (web/assets/engine.js), so tests and site enforce the same rules.
// Crashes (anything other than a failed assert) are rethrown so tests fail loudly.
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('../web/assets/engine.js');

const SCRIPT = path.join(__dirname, '../dist/implied.js');

function runIndicator(opts) {
  return engine.runCode(opts.source || fs.readFileSync(SCRIPT, 'utf8'), { ...opts, rethrow: true });
}

module.exports = { runIndicator, limitStrikes: engine.limitStrikes, STYLES: engine.STYLES };
