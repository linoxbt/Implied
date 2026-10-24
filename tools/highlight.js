// Build-time syntax highlighting for the script page (no browser code, so the
// CSP needs nothing new). Returns one <span class="l"> per source line, with
// comments, strings, numbers, keywords and TrendSpider's API names wrapped in
// classed spans. Line numbers come from CSS, so selecting or copying the code
// never picks them up, and the page's text is the script byte for byte.
'use strict';

const KEYWORDS = new Set(('const let var function return if else for of in while do break continue new typeof instanceof ' +
  'throw try catch finally class extends async await switch case default delete void this null undefined true false').split(' '));
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof']);

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tokenize(src, apiNames) {
  const out = [];
  let i = 0, prev = ''; // prev: last significant token, to tell a regex from a division
  const push = (type, text) => { out.push([type, text]); if (type !== 'c' && !/^\s+$/.test(text)) prev = type === 'p' || type === 'k' ? text : 'x'; };
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i);
    let m;
    if ((m = /^\s+/.exec(rest))) push('', m[0]);
    else if (rest.startsWith('//')) push('c', /^\/\/[^\n]*/.exec(rest)[0]);
    else if (rest.startsWith('/*')) { const e = src.indexOf('*/', i + 2); push('c', src.slice(i, e < 0 ? src.length : e + 2)); }
    else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j++; else if (ch !== '`' && src[j] === '\n') break; j++; }
      push('s', src.slice(i, j + 1));
    } else if (ch === '/' && REGEX_AFTER.has(prev)) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++;
      while (/[a-z]/.test(src[j] || '')) j++;
      push('s', src.slice(i, j));
    } else if ((m = /^(?:0[xX][\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest))) push('n', m[0]);
    else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) push(KEYWORDS.has(m[0]) ? 'k' : apiNames.has(m[0]) ? 'a' : '', m[0]);
    else push('p', ch);
    i += out[out.length - 1][1].length;
  }
  return out;
}

// html: the highlighted lines; the text inside is the source exactly.
function highlight(src, apiNames = []) {
  const api = new Set(apiNames);
  let html = '';
  for (const [type, text] of tokenize(src, api)) {
    // A token never spans a line break in the output: each piece is wrapped
    // on its own, so every line's HTML is balanced.
    html += text.split('\n').map(t => !t ? '' : type && type !== 'p' ? `<span class="${type}">${escapeHtml(t)}</span>` : escapeHtml(t)).join('\n');
  }
  const lines = html.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // the file's final newline
  return lines.map(l => `<span class="l">${l}</span>`).join('\n') + (src.endsWith('\n') ? '\n' : '');
}

module.exports = { highlight, tokenize };
