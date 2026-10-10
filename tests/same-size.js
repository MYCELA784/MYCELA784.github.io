#!/usr/bin/env node
'use strict';
/*
 * The same-size list in the details modal: parts of the viewed part's own
 * type come first, and parts of another type sit under a "Same size,
 * different type" label, each naming its type.
 *
 *   node tests/same-size.js
 *
 * A cylindrical roller and a deep groove ball of the same size fit the same
 * seat and are not replacements for each other, so the list must never show
 * one as a plain equivalent of the other.
 *
 * Drives the real js/renderer.js modal() against a minimal DOM shim, as
 * tests/modal-calc.js does. The size search the modal makes is answered here
 * from a table (rows of the real catalogue, or made-up rows where a case
 * needs an exact shape); tests/site-search.js checks the real API's answer
 * to that search. No browser, no network.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── DOM shim ───────────────────────────────────────────────────────────────
function El(id) { this.id = id; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.style = {}; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; }
El.prototype.addEventListener = function () {};
El.prototype.insertAdjacentElement = function () {};
El.prototype.querySelector = function () { return null; };
const reg = {};
const label = new El('xref-label');
const byId = id => reg[id] || (reg[id] = new El(id));
byId('modal-xref-wrap').querySelector = () => label;

global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
global.document = { getElementById: byId, createElement: () => new El('created'), querySelector: () => null };

// What the search API answers for each size the modal asks about.
const ANSWERS = {};
const asked = [];
global.fetch = url => {
  const q = decodeURIComponent(String(url).split('/search?q=')[1] || '');
  asked.push(q);
  if (!ANSWERS[q]) return Promise.reject(new Error('no answer set for ' + q));
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ results: ANSWERS[q], note: null, stage: 'exact' }) });
};

const quiet = console.log;
console.log = () => {};       // bearings_db.js announces itself
['bearings_db.js', 'js/config.js', 'js/escape.js', 'js/constants.js', 'js/db.js', 'js/api.js', 'js/tables/dgbb_tables.js', 'js/tables/fag_tables.js', 'js/dgbb_calc.js', 'js/renderer.js']
  .forEach(f => require(path.join(ROOT, f)));
console.log = quiet;
const M = global.window.MYCELA;

let failures = 0;
function ok(cond, msg) { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; }

const LABEL = 'Same size, different type';
const sizeOf = b => `${b.bore}x${b.od}x${b.w}`;
// The chips as the visitor reads them, in order, with the label as its own entry.
function shown(html) {
  return html.split(/(?=<button)|(?=<div class="xref-sub")/).map(part => ({
    isLabel: /^<div class="xref-sub"/.test(part),
    id: (part.match(/data-open="([^"]*)"/) || [])[1],
    text: part.replace(/<\/button>.*$/s, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  })).filter(p => p.text);
}
async function open(part, answer) {
  ANSWERS[sizeOf(part)] = answer;
  M.Api.remember([part]);
  M.Renderer.modal(part.id);
  await M.Renderer._xrefs;
  return shown(byId('modal-xref').innerHTML);
}
const row = (id, type, extra) => Object.assign({ id, brand: 'SKF', pn: id, type, bore: 91, od: 191, w: 41, cr: 10 }, extra);

(async () => {
  // ── 1. a real size that several types share: 25 x 52 x 15 ──────────────
  const DB = M.DB;
  const viewed = DB.find(b => b.id === 'NTN-6205');
  const size = DB.filter(b => b.bore === 25 && b.od === 52 && b.w === 15);
  const types = new Set(size.map(b => b.type));
  ok(viewed && types.size >= 3, `the catalogue has 25x52x15 in ${types.size} types (${[...types].join(', ')})`);

  // answered with the other types first, to show the page does the ordering
  const answer = size.filter(b => b.type !== viewed.type).concat(size.filter(b => b.type === viewed.type));
  let list = await open(viewed, answer);
  ok(asked.includes('25x52x15'), 'the modal asks the API for the size');
  const at = list.findIndex(p => p.isLabel);
  const before = list.slice(0, at), after = list.slice(at + 1);
  const part = p => DB.find(b => b.id === p.id);
  ok(list.filter(p => !p.isLabel).length === 5 && !list.some(p => p.id === viewed.id), 'five parts are listed and the viewed part is not one of them');
  ok(at > 0 && before.every(p => part(p).type === viewed.type), `the ${before.length} listed first are all ${viewed.type}, the viewed part's type`);
  ok(before.length === size.filter(b => b.type === viewed.type).length - 1, 'every other part of the same type is listed, none pushed out by another type');
  ok(list[at].text === LABEL, `then the label "${LABEL}"`);
  ok(after.length > 0 && after.every(p => part(p).type !== viewed.type), `the ${after.length} under the label are all of another type`);
  ok(after.every(p => p.text.includes(` · ${part(p).type} · `)), `each of those names its type (${after.map(p => p.text).join(' | ')})`);
  ok(before.every(p => !p.text.includes(viewed.type)), `a part of the same type does not repeat the type (${before[0].text})`);

  // the task's own example: a cylindrical roller seen from a deep groove ball
  // (another size, since the page keeps each size's answer once it has it)
  const v2 = DB.find(b => b.id === 'NTN-6206');
  const nu = DB.find(b => b.id === 'NTN-NU206E');
  const size2 = DB.filter(b => b.bore === v2.bore && b.od === v2.od && b.w === v2.w);
  list = await open(v2, [nu].concat(size2.filter(b => b.type === v2.type)));
  const nuChip = list.find(p => p.id === nu.id);
  ok(nuChip && nuChip.text === `NTN ${nu.pn} · Cylindrical Roller · ${nu.cr} kN`, `the cylindrical roller reads "${nuChip && nuChip.text}"`);
  ok(list.findIndex(p => p.id === nu.id) > list.findIndex(p => p.isLabel) && list.findIndex(p => p.isLabel) > 0,
     'and it sits under the label, though the API listed it first');

  // seen from the other side, everything that is not a cylindrical roller is the different type
  const nu5 = DB.find(b => b.id === 'NTN-NU205E');
  list = await open(nu5, answer);
  const lab = list.findIndex(p => p.isLabel);
  ok(lab > 0 && list.slice(0, lab).every(p => part(p).type === 'Cylindrical Roller'), 'opened on a cylindrical roller, the other cylindrical roller comes first');
  ok(list.slice(lab + 1).length > 0 && list.slice(lab + 1).every(p => part(p).type !== 'Cylindrical Roller' && p.text.includes(` · ${part(p).type} · `)),
     `and the rest are under the label, each named (${list.slice(lab + 1).map(p => p.text).join(' | ')})`);

  // ── 2. shapes of list, with made-up rows (a size of its own each) ──────
  let bore = 90;
  const scene = () => { const d = ++bore; return (id, type, extra) => row(id, type, Object.assign({ bore: d }, extra)); };
  let r = scene();
  list = await open(r('T-ME1', 'Deep Groove Ball'), [r('T-A', 'Deep Groove Ball'), r('T-B', 'Deep Groove Ball')]);
  ok(list.length === 2 && !list.some(p => p.isLabel), 'only the same type at that size: no label');

  r = scene();
  list = await open(r('T-ME2', 'Deep Groove Ball'), [r('T-C', 'Cylindrical Roller'), r('T-D', 'Tapered Roller')]);
  ok(list[0].isLabel && list.length === 3, 'only other types at that size: the label comes first, so none reads as like for like');

  r = scene();
  list = await open(r('T-ME3', 'Deep Groove Ball'), [1, 2, 3, 4].map(i => r('T-O' + i, 'Cylindrical Roller')).concat([1, 2, 3].map(i => r('T-S' + i, 'Deep Groove Ball'))));
  ok(list.map(p => p.isLabel ? '|' : p.id).join(' ') === 'T-S1 T-S2 T-S3 | T-O1 T-O2',
     'four of another type answered ahead of three of the same type: all three same-type parts are kept, in the order the API gave, and the limit of five cuts the others');

  r = scene();
  list = await open(r('T-ME4', 'Deep Groove Ball'), [1, 2, 3, 4, 5, 6].map(i => r('T-M' + i, 'Deep Groove Ball')).concat([r('T-P', 'Cylindrical Roller')]));
  ok(list.length === 5 && !list.some(p => p.isLabel), 'five or more of the same type: only those, and no empty label');

  r = scene();
  list = await open(r('T-ME5', 'Deep Groove Ball'), [r('T-N', undefined), r('T-K', 'Deep Groove Ball', { cr: null })]);
  ok(list.length === 3 && list[0].text === 'SKF T-K · not verified' && list[2].text === 'SKF T-N · type not verified · 10 kN',
     'a part with no type goes under the label as "type not verified"; a missing load rating still reads "not verified"');

  r = scene();
  list = await open(r('T-ME6', 'Deep Groove Ball'), [r('T-FAR', 'Deep Groove Ball', { w: 43 }), r('T-NEAR', 'Deep Groove Ball', { w: 41.4 })]);
  ok(list.length === 1 && list[0].id === 'T-NEAR', 'the 0.5 mm size rule is unchanged');

  // ── 3. the markup ──────────────────────────────────────────────────────
  r = scene();
  const me = r('T-ME7', 'Deep Groove Ball');
  await open(me, [r('T-X', '<img src=x onerror=alert(1)>')]);
  const html = byId('modal-xref').innerHTML;
  ok(!/<img/.test(html) && /&lt;img/.test(html), 'a type is escaped like every other field');
  ok(!/—/.test(html) && !/—/.test(LABEL), 'no em dash');
  ok(label.textContent.includes(`Same Size ${me.bore}×191×41`), 'the section heading still gives the size');
  const css = require('fs').readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
  ok(/\.xref-sub\{[^}]*flex:0 0 100%/.test(css), 'the label takes its own line (css/components.css .xref-sub)');

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
