#!/usr/bin/env node
'use strict';
/*
 * Escaping test: a part whose fields contain markup is displayed as plain
 * text everywhere on the page. (docs/todo-security.md)
 *
 *   node tests/escape.js
 *
 * The search API is replaced by a stand-in that answers with hostile parts:
 * every text field, the id, the numbers and the "note" carry
 * <img src=x onerror=alert(1)> or an attribute break-out. The real
 * js/renderer.js, js/features.js and js/app.js then draw every place a part
 * can appear: result cards, filter rail, autocomplete, details modal, suffix
 * list, same-size chips, load calculator, compare table, the list sheet and
 * the message block.
 *
 * Every piece of HTML the page code produced is then read back the way a
 * browser would read it: only this site's own tags may be in it, no tag may
 * carry an event handler, ids must come back out of their data- attributes
 * unchanged, and the hostile text must be there as text.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── hostile data ─────────────────────────────────────────────────────────
const IMG = '<img src=x onerror=alert(1)>';
const BREAK = '"><img src=x onerror=alert(2)> \' onmouseover=\'alert(3)';
const SCRIPT = '</div><script>alert(4)</script>';
const H1 = { id: 'H1' + BREAK, brand: IMG, pn: IMG + ' 6205-2RS', type: SCRIPT, bore: 25, od: 52, w: 15, cr: 14.8, c0r: 7.8,
             rpm: 18000, speed_ref: 28000, mass: 0.13, sealing: BREAK, alt: ['H2' + BREAK], source: IMG };
const H2 = { id: 'H2' + BREAK, brand: 'SKF' + BREAK, pn: 'P2' + IMG, type: IMG, bore: 25, od: 52, w: 15, cr: IMG, sealing: IMG, source: SCRIPT };
// numbers that are not numbers
const H3 = { id: 'H3', brand: 'FAG', pn: '6305', type: 'Tapered Roller', bore: IMG, od: BREAK, w: IMG, cr: IMG, c0r: IMG, rpm: IMG, speed_ref: IMG,
             mass: IMG, sealing: 'Open', _designationOnly: true, _queriedSealing: IMG };
// a part the load calculator accepts, with a hostile designation
const H4 = { id: 'H4', brand: 'SKF', pn: 'X' + IMG, type: 'Deep Groove Ball', bore: 25, od: 52, w: 15, cr: 14.8, c0r: 7.8, rpm: 18000, speed_ref: 28000,
             sealing: 'Open', source: IMG };
const NOTE = 'Nothing exact. ' + IMG;
const QUERY = 'q ' + IMG + BREAK;

// ── DOM shim that keeps every piece of HTML it is given ──────────────────
const els = {};
const all = [];
function El(id) {
  this.id = id || ''; this.value = ''; this.hidden = false; this.textContent = ''; this.placeholder = '';
  this.dataset = {}; this.style = {}; this.checked = false; this.disabled = false; this._h = {}; this._html = [];
  const cls = new Set();
  this.classList = { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
                     toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : on; v ? cls.add(c) : cls.delete(c); return v; } };
  all.push(this);
}
for (const prop of ['innerHTML', 'outerHTML']) {
  Object.defineProperty(El.prototype, prop, {
    get() { return this._html.length ? this._html[this._html.length - 1] : ''; },
    set(v) { this._html.push(String(v)); },
  });
}
El.prototype.addEventListener = function (t, fn) { (this._h[t] = this._h[t] || []).push(fn); };
El.prototype.fire = function (t, ev) { (this._h[t] || []).forEach(fn => fn(Object.assign({ target: { closest: () => null }, preventDefault() {} }, ev))); };
El.prototype.setAttribute = El.prototype.removeAttribute = El.prototype.focus = El.prototype.blur = El.prototype.appendChild = function () {};
El.prototype.insertAdjacentElement = function () {};
El.prototype.closest = function () { return new El(); };
El.prototype.contains = () => false;
El.prototype.querySelectorAll = () => [];
// the calculator's controls exist only if the section's markup has them
El.prototype.querySelector = function (sel) {
  const id = sel.replace(/^#/, '');
  if (!/^calc-/.test(id)) return els[id] || new El();
  return this.innerHTML.indexOf(`id="${id}"`) !== -1 ? (els[id] = els[id] || new El(id)) : null;
};
const byId = id => (els[id] = els[id] || new El(id));
global.document = {
  readyState: 'complete', getElementById: byId, createElement: () => new El('created'),
  querySelector: () => new El(), querySelectorAll: () => [], addEventListener() {}, body: new El('body'), activeElement: new El(),
};
global.location = { search: '', hostname: 'www.mycela.in', href: 'https://www.mycela.in/' };
global.scrollTo = () => {};
const store = k => { const s = {}; return { getItem: x => (x in s ? s[x] : null), setItem: (x, v) => { s[x] = String(v); } }; };
global.sessionStorage = store();
global.localStorage = store();
global.window = global;
global.MYCELA = {};

// ── stand-in API ─────────────────────────────────────────────────────────
global.fetch = url => {
  if (!url.startsWith('https://api.mycela.in/')) return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  const u = new URL(url);
  const body = u.pathname === '/stats' ? { count: 4 }
    : u.pathname === '/parts' ? { parts: [H2], count: 1 }
    : { results: [H1, H2, H3, H4], note: NOTE, stage: 3, count: 4 };
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) });
};

['js/config.js', 'js/escape.js', 'js/constants.js', 'js/api.js', 'js/tables/dgbb_tables.js', 'js/tables/fag_tables.js', 'js/dgbb_calc.js',
 'js/renderer.js', 'js/features.js', 'js/app.js'].forEach(f => require(path.join(ROOT, f)));
const M = global.MYCELA;

// ── reading HTML back ────────────────────────────────────────────────────
const TAGS = new Set(['article', 'b', 'br', 'button', 'circle', 'details', 'div', 'ellipse', 'em', 'form', 'h3', 'h4', 'input', 'label', 'p',
                      'path', 'rect', 'span', 'summary', 'svg', 'table', 'td', 'textarea', 'th', 'tr']);
const OWN_HANDLERS = new Set(['onclick="closeModalDirect()"']);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const decode = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&amp;/g, '&');
function read(html) {
  const tags = [], handlers = [], attrs = [];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    tags.push(m[2].toLowerCase());
    // attribute by attribute, as a browser splits them: a quoted value is
    // one value whatever it contains
    const ATTR = /\s+([^\s=>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
    let a;
    while ((a = ATTR.exec(m[3]))) {
      const name = a[1].toLowerCase(), raw = a[2] || '';
      if (/^on/.test(name)) handlers.push(name + '=' + raw);
      if (/^data-/.test(name)) attrs.push([name, decode(raw.replace(/^["']|["']$/g, ''))]);
    }
  }
  // what is left once the tags are taken out must have no "<" in it at all
  const text = html.replace(TAG, '');
  return { tags, handlers, attrs, strayAngle: text.indexOf('<') !== -1, text: decode(text) };
}
function check(label, html, expect) {
  const r = read(html);
  const foreign = [...new Set(r.tags.filter(t => !TAGS.has(t)))];
  const badHandlers = r.handlers.filter(h => !OWN_HANDLERS.has(h));
  ok(!foreign.length && !r.strayAngle, `${label}: only this site's own tags${foreign.length ? '  (found: ' + foreign.join(', ') + ')' : ''}`);
  ok(!badHandlers.length, `${label}: no tag carries an event handler${badHandlers.length ? '  (found: ' + badHandlers.join(' | ') + ')' : ''}`);
  (expect.text || []).forEach(t => ok(r.text.indexOf(t) !== -1, `${label}: the hostile text is there as plain text  ${JSON.stringify(t.slice(0, 40))}`));
  (expect.attrs || []).forEach(([k, v]) => ok(r.attrs.some(a => a[0] === k && a[1] === v), `${label}: ${k} carries the id unchanged`));
  return r;
}

(async () => {
  // ── 0. the escape function itself ──────────────────────────────────────
  ok(M.esc(IMG) === '&lt;img src=x onerror=alert(1)&gt;', 'esc() turns <img src=x onerror=alert(1)> into text');
  ok(M.esc('a&b"c\'d`e') === 'a&amp;b&quot;c&#39;d&#96;e', 'esc() escapes & " \' and `');
  ok(M.esc(null) === '' && M.esc(undefined) === '' && M.esc(0) === '0' && M.esc(12.5) === '12.5', 'esc() takes null, undefined and numbers');

  // ── 1. result cards, filter rail, header ───────────────────────────────
  byId('q').value = QUERY;
  byId('q').fire('keydown', { key: 'Enter' });
  await wait(60);
  check('result cards', byId('grid').innerHTML, {
    text: [IMG + ' 6205-2RS', SCRIPT, 'P2' + IMG],
    attrs: [['data-info', H1.id], ['data-add', H1.id], ['data-cmp', H2.id], ['data-x', H2.pn]],
  });
  ok(/Same fit from/.test(byId('grid').innerHTML), 'the cards include a "Same fit" link built from a looked-up part');
  ok(/Closest match:/.test(byId('grid').innerHTML), 'the cards include a sealing note built from a per-search flag');
  check('filter rail', byId('fbody').innerHTML, { text: [IMG, 'SKF' + BREAK], attrs: [['data-fb', IMG], ['data-fs', BREAK]] });
  ok(byId('rSub').textContent === NOTE && byId('rSub')._html.length === 0, 'the API\'s note is set as text, never as HTML');

  // ── 2. autocomplete ────────────────────────────────────────────────────
  byId('q').value = 'img';
  byId('q').fire('input');
  await wait(260);
  check('autocomplete', byId('ac').innerHTML, { text: [IMG + ' 6205-2RS', SCRIPT], attrs: [['data-ac', H1.pn]] });

  // ── 3. details modal ───────────────────────────────────────────────────
  M.Renderer.modal(H1.id);
  await M.Renderer._xrefs;
  ok(byId('modal-pn').textContent === H1.pn && byId('modal-pn')._html.length === 0, 'modal title: the part number is set as text');
  check('modal brand and type', byId('modal-meta').innerHTML, { text: [IMG, SCRIPT] });
  check('modal specs', byId('modal-specs').innerHTML, { text: [BREAK] });
  check('modal suffix list', byId('modal-suffix-box').innerHTML, { text: ['2RS'] });
  check('modal same-size chips', byId('modal-xref').innerHTML, { text: ['P2' + IMG, 'SKF' + BREAK], attrs: [['data-open', H2.id]] });
  check('modal source and list button', byId('modal-actions-box').innerHTML, { text: ['Source: ' + IMG], attrs: [['data-inq', H1.id]] });

  M.Renderer.modal('H3');
  await M.Renderer._xrefs;
  check('modal specs with text where numbers belong', byId('modal-specs').innerHTML, { text: [IMG + ' mm', BREAK + ' mm'] });

  // ── 4. load calculator ─────────────────────────────────────────────────
  M.Renderer.modal('H4');
  await M.Renderer._xrefs;
  const calc = byId('modal-calc-wrap');
  ok(calc.style.display === '' && /id="calc-run"/.test(calc.innerHTML), 'the calculator is offered for the hostile deep groove part');
  byId('calc-fr').value = '2'; byId('calc-n').value = '1450';
  byId('calc-run').fire('click');
  check('calculator result', byId('calc-out').innerHTML, {});
  ok(/calc-big/.test(byId('calc-out').innerHTML), 'the calculator produced a result');
  const realEvaluate = M.DGBBCalc.evaluate;
  M.DGBBCalc.evaluate = () => { throw new Error('bad input ' + IMG); };
  byId('calc-run').fire('click');
  M.DGBBCalc.evaluate = realEvaluate;
  check('calculator error message', byId('calc-out').innerHTML, { text: ['bad input ' + IMG] });

  // ── 5. compare ─────────────────────────────────────────────────────────
  [H1.id, H2.id, 'H3'].forEach(id => M.Renderer.toggleCompare(id, true));
  M.Renderer.openCompare();
  check('compare table', byId('modal-compare').innerHTML, { text: [IMG + ' 6205-2RS', 'P2' + IMG, SCRIPT, IMG + ' mm', IMG + ' kN'] });

  // ── 6. the list sheet ──────────────────────────────────────────────────
  global.toggleInquiry(H1.id);
  global.toggleInquiry(H2.id);
  byId('openBasket').fire('click');
  check('list sheet', byId('bBody').innerHTML, { text: [IMG + ' 6205-2RS', 'P2' + IMG], attrs: [['data-q', H1.id], ['data-rm', H2.id]] });
  ok(M.Basket.count() === 2, 'both hostile parts are in the list');

  // ── 7. the message block ───────────────────────────────────────────────
  M.Renderer.notice('T ' + IMG, 'B ' + BREAK, true);
  check('message block', byId('grid').innerHTML, { text: ['T ' + IMG, 'B ' + BREAK] });

  // ── 8. everything else the page code wrote ─────────────────────────────
  const every = all.flatMap(el => el._html);
  let bad = 0;
  every.forEach(html => {
    const r = read(html);
    if (r.strayAngle || r.tags.some(t => !TAGS.has(t)) || r.handlers.some(h => !OWN_HANDLERS.has(h))) bad++;
  });
  ok(every.length > 20 && bad === 0, `all ${every.length} pieces of HTML the page code produced: no foreign tag, no event handler`);
  ok(every.some(h => h.indexOf('&lt;img src=x onerror=alert(1)&gt;') !== -1) && !every.some(h => /<img/i.test(h)),
     '<img src=x onerror=alert(1)> appears only in its escaped form');

  // ── 9. no inline handler is built from data, anywhere in the source ────
  const fs = require('fs');
  const src = ['js/renderer.js', 'js/features.js', 'js/app.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const inline = (src.match(/on[a-z]+="[^"]*"/g) || []).filter(h => !OWN_HANDLERS.has(h));
  ok(inline.length === 0, 'the page code builds no inline event handler' + (inline.length ? '  (found: ' + inline.join(' | ') + ')' : ''));

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
