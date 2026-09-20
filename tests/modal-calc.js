#!/usr/bin/env node
'use strict';
/*
 * Modal load-calculator UI tests: drives the real js/renderer.js modal()
 * against a minimal DOM shim, so the gates, the section markup, the
 * Calculate handler and the wording all run. No browser needed.
 *
 *   node tests/modal-calc.js
 *
 * Covers the radial-only calculator (every eligible deep groove row) and
 * combined loading, which exists for FAG single row rows only.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── DOM shim ───────────────────────────────────────────────────────────────
function El(id) {
  this.id = id; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.style = {}; this._h = {};
  const s = new Set();
  this.classList = { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)) };
}
El.prototype.addEventListener = function (k, fn) { (this._h[k] = this._h[k] || []).push(fn); };
El.prototype.fire = function (k, ev) { (this._h[k] || []).forEach(fn => fn(ev || {})); };
El.prototype.insertAdjacentElement = function () {};
// the calculator's own controls are looked up by id inside the section box; they exist only if the markup has them
El.prototype.querySelector = function (sel) {
  const id = sel.replace(/^#/, '');
  if (!/^calc-/.test(id)) return reg[id] || null;
  const html = reg['modal-calc-wrap'] ? reg['modal-calc-wrap'].innerHTML : '';
  return html.indexOf(`id="${id}"`) !== -1 ? (reg[id] = reg[id] || new El(id)) : null;
};
const reg = {};
['modal-compare', 'modal-detail', 'modal-pn', 'modal-meta', 'modal-specs', 'modal-apps-wrap', 'modal-xref-wrap', 'modal-xref', 'modal-overlay']
  .forEach(id => { reg[id] = new El(id); });
reg['modal-xref-wrap'].querySelector = () => ({ textContent: '' });

global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
global.MYCELA = global.window.MYCELA;
global.document = {
  getElementById: id => reg[id] || (reg[id] = new El(id)),
  createElement: () => new El('created'),
  querySelector: () => null,
};
['bearings_db.js', 'js/config.js', 'js/constants.js', 'js/db.js', 'data/dgbb_tables.js', 'data/fag_tables.js', 'js/dgbb_calc.js', 'js/renderer.js']
  .forEach(f => require(path.join(ROOT, f)));
const M = global.window.MYCELA;
const C = M.DGBBCalc;

let failures = 0;
function ok(cond, msg) { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; }
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '.').replace(/\s+/g, ' ');

function open(rec) {
  // modal() reads DB_MAP; register synthetic records under their own id
  if (!M.DB_MAP[rec.id]) M.DB_MAP[rec.id] = rec;
  ['calc-fr', 'calc-fa', 'calc-n', 'calc-out', 'calc-run'].forEach(k => delete reg[k]);
  M.Renderer.modal(rec.id);
  return reg['modal-calc-wrap'];
}
function control(k) { return reg[k] || (reg[k] = new El(k)); }
function run(fr, fa, n) {
  const out = control('calc-out'); out.innerHTML = '';
  control('calc-fr').value = fr; if (fa !== null) control('calc-fa').value = fa; control('calc-n').value = n;
  control('calc-run').fire('click');
  return out.innerHTML;
}

const fagRow = M.DB.find(b => C.supportsCombined(b));
const fagDouble = M.DB.find(b => b.brand === 'FAG' && C.supports(b) && C.isFagDoubleRow(b));
const skfRow = M.DB.find(b => b.brand === 'SKF' && C.supports(b));
const ntnRow = M.DB.find(b => b.brand === 'NTN' && C.supports(b));
const noF0 = Object.assign({}, fagRow, { id: 'TEST-FAG-NOF0', f0: undefined });

// ── FAG single row with f0: combined loading offered ──────────────────────
{
  const box = open(fagRow), h = box.innerHTML, t = text(h);
  ok(box.style.display === '' && /calc-fields-3/.test(h) && /id="calc-fa"/.test(h), `${fagRow.id}: an axial load input is offered`);
  ok(/Combined loading is available for FAG bearings only/.test(t), 'the section says combined loading is available for FAG bearings only');
  ok(/FAG's own factor table/.test(t) && /normal operating clearance/.test(t) && /no clearance choice is offered/.test(t), "it says FAG's own table and normal operating clearance are used, with no clearance choice");
  ok(/we do not combine one manufacturer's f0 with another's factor table/.test(t), 'it says why: no mixing of one manufacturer\'s f0 with another\'s table');
  ok(!/<select/.test(h) && !/C3|C4/.test(t), 'no clearance selector and no C3 / C4 mentioned');
  ok(!/—/.test(h), 'no em dash in the section');

  const out = run('2', '1', '1450');
  const ev = C.evaluate({ bearing: fagRow, Fr: 2, n: 1450, Fa: 1 });
  const to = text(out);
  ok(/FAG Table 10/.test(to) && /Factor table/.test(to), 'the working names the FAG table used');
  ok(/Axial load Fa/.test(to) && /f0 \(FAG, for this bearing\)/.test(to) && /e . X . Y/.test(to), 'the working shows Fa/Fr, f0, f0.Fa/C0r and e / X / Y');
  ok(to.indexOf(ev.P.P.toFixed(2) + ' kN') !== -1, `P shown equals evaluate() (${ev.P.P.toFixed(2)} kN)`);
  ok(/basic rating life \(L10h\)/.test(to) && /Fa 1\.00 kN/.test(to), 'life is labelled basic rating life and the subtitle carries Fa');

  const rad = text(run('2', '', '1450'));
  ok(/radial only, so P = Fr/.test(rad) && !/Factor table/.test(rad), 'an empty Fa field is a radial-only calculation');
  ok(/must be zero or more/.test(text(run('2', '-1', '1450'))), 'a negative Fa is refused with a message');
  ok(/below the first row \(0\.3\)/.test(text(run('2', '0.02', '1450'))) || /Fa\/Fr is at or below e/.test(text(run('2', '0.02', '1450'))), 'a very small Fa is handled (first-row note or Fa/Fr <= e)');
  const big = text(run('0.1', String(Math.round(fagRow.c0r * 3 * 100) / 100), '1450'));
  ok(/above the last row \(6\)/.test(big), "a large Fa beyond FAG's last row says the last row is used");
}

// ── SKF and NTN rows: radial only, and a neutral explanation ─────────────
for (const [label, rec] of [['SKF', skfRow], ['NTN', ntnRow]]) {
  const box = open(rec), h = box.innerHTML, t = text(h);
  ok(!/id="calc-fa"/.test(h) && !/calc-fields-3/.test(h), `${rec.id}: no axial load input`);
  ok(/Radial load only\. Combined loading is currently available for FAG bearings only/.test(t), `${label} row: says combined loading is currently available for FAG bearings only`);
  ok(/our database holds only for FAG parts/.test(t) && /taken from FAG's own catalogue/.test(t), `${label} row: says why in terms of our data`);
  ok(!/(does not|do not|never|doesn't) (print|publish|list)|inferior|worse|unreliable/i.test(t), `${label} row: nothing disparaging or claiming a manufacturer does not publish`);
  const out = text(run('2', null, '1450'));
  ok(/radial only, so P = Fr/.test(out), `${label} row: the radial calculation still works`);
}

// ── FAG double row and a FAG row without an f0 ───────────────────────────
if (fagDouble) {
  const h = open(fagDouble).innerHTML;
  ok(!/id="calc-fa"/.test(h) && /double row series/.test(text(h)), `${fagDouble.id}: FAG double row gets no axial input, with the reason`);
}
{
  const h = open(noF0).innerHTML;
  ok(!/id="calc-fa"/.test(h) && /this one is not there yet/.test(text(h)), 'a FAG single row without an f0 gets no axial input, with the reason');
}

// ── ineligible rows still get no calculator at all ───────────────────────
{
  const tapered = M.DB.find(b => b.type === 'Tapered Roller');
  const box = open(tapered);
  ok(box.style.display === 'none' && box.innerHTML === '', 'a tapered roller still gets no calculator');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
