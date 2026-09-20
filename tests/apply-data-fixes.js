#!/usr/bin/env node
'use strict';
/*
 * Tests for scripts/apply-data-fixes.js, in particular the "add" op.
 *
 *   node tests/apply-data-fixes.js
 *
 * Builds a tiny fixture in the same grammar as bearings_db.js (one flat
 * object per record, no nested braces), runs the real script as a child
 * process against changesets, and checks the output byte-for-byte where
 * that matters. Exits non-zero on any failure.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'apply-data-fixes.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'adf-'));

let failures = 0;
function ok(cond, msg) { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; }

const R1 = '{"id":"FAG-6205-C","brand":"FAG","pn":"6205-C","type":"Deep Groove Ball","bore":25.0,"od":52.0,"cr":14.0,"pu":0.335,"sealing":"Open","source":"FAG Rolling Bearings Catalog (HR 1)"}';
const R2 = '{"id":"SKF-6205","brand":"SKF","pn":"6205","type":"Deep Groove Ball","bore":25.0,"od":52.0,"cr":14.8,"sealing":"Open","source":"SKF US Bearings Catalog 2025"}';
const R3 = '{"id":"NTN-6205","brand":"NTN","pn":"6205","type":"Deep Groove Ball","bore":25.0,"od":52.0,"cr":14.0,"sealing":"Open"}';
const R4 = '{"id":"FAG-6206-C","brand":"FAG","pn":"6206-C","type":"Deep Groove Ball","bore":30.0,"od":62.0,"cr":20.3,"pu":0.5,"sealing":"Open","source":"FAG Rolling Bearings Catalog (HR 1)"}';
const RECORDS = [R1, R2, R3, R4];
const HEADER = '// fixture\n/* global window */\n';
const dbText = recs => HEADER + 'window.MYCELA_DB = [' + recs.join(',') + '];\n';

let n = 0;
function run(inText, changeset) {
  n++;
  const inP = path.join(TMP, `in${n}.js`);
  const csP = path.join(TMP, `cs${n}.json`);
  const outP = path.join(TMP, `out${n}.js`);
  fs.writeFileSync(inP, inText);
  fs.writeFileSync(csP, typeof changeset === 'string' ? changeset : JSON.stringify(changeset));   // a string is written as raw changeset text
  const r = spawnSync(process.execPath, [SCRIPT, inP, outP, csP], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: fs.existsSync(outP) ? fs.readFileSync(outP, 'utf8') : null, outP, inP };
}
function parse(text) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(text, sb);
  return sb.window.MYCELA_DB;
}
function aborted(r, msg) {
  ok(r.code !== 0 && r.out === null && /ABORT/.test(r.stderr), msg + `  (exit ${r.code}, output written: ${r.out !== null})`);
}

const BASE = dbText(RECORDS);

// ── 1. add appends the field to the right record and touches nothing else ──
{
  const r = run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8 } }]);
  ok(r.code === 0 && r.out !== null, 'add: exits 0 and writes the output');
  const expected = dbText([R1.slice(0, -1) + ',"f0":13.8}', R2, R3, R4]);
  ok(r.out === expected, 'add: output is byte-identical to the input plus ,"f0":13.8 before that record\'s closing brace');
  const recs = parse(r.out);
  ok(recs.length === 4 && recs[0].f0 === 13.8 && recs.slice(1).every(x => !('f0' in x)), 'add: only the targeted record gained f0, and the record count is unchanged');
  ok((r.out.match(/\{/g) || []).length === recs.length, 'add: brace count still equals record count');
  ok(JSON.stringify(recs.map(x => x.id)) === JSON.stringify(['FAG-6205-C', 'SKF-6205', 'NTN-6205', 'FAG-6206-C']), 'add: ids and their order are unchanged');
}

// ── 2. several adds, mixed with set, in one run ────────────────────────────
{
  const r = run(BASE, [
    { id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8 } },
    { id: 'FAG-6206-C', op: 'add', fields: { f0: 14.1 } },
    { id: 'SKF-6205', op: 'set', fields: { cr: 15.0 } },
  ]);
  const recs = r.out && parse(r.out);
  ok(r.code === 0 && recs && recs[0].f0 === 13.8 && recs[3].f0 === 14.1 && recs[1].cr === 15 && !('f0' in recs[1]),
     'add + set in one changeset: each op lands on its own record');
}

// ── 3. null and string values, and several fields at once ──────────────────
{
  const r = run(BASE, [{ id: 'NTN-6205', op: 'add', fields: { f0: null, note: 'from catalogue "HR 1"' } }]);
  const recs = r.out && parse(r.out);
  ok(r.code === 0 && recs && recs[2].f0 === null && recs[2].note === 'from catalogue "HR 1"', 'add: null and (quote-containing) string values round-trip');
}

// ── 4. refusals: nothing is written ────────────────────────────────────────
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { pu: 0.4 } }]), 'add: an existing field aborts (add never overwrites)');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8, pu: 0.4 } }]), 'add: one existing field among several aborts the whole run');
aborted(run(BASE, [{ id: 'FAG-9999', op: 'add', fields: { f0: 13.8 } }]), 'add: an unknown id aborts');
aborted(run(dbText([R1, R1]), [{ id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8 } }]), 'add: a non-unique id aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { f0: { x: 1 } } }]), 'add: an object value aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { f0: [1] } }]), 'add: an array value aborts');
aborted(run(BASE, '[{"id":"FAG-6205-C","op":"add","fields":{"f0":1e999}}]'), 'add: a non-finite number (1e999 parses to Infinity) aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: { 'f0":1,"x': 1 } }]), 'add: a field name that would inject JSON aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add', fields: {} }]), 'add: an empty fields object aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'add' }]), 'add: a missing fields object aborts');
aborted(run(BASE, [{ id: 'FAG-6205-C', op: 'frobnicate', fields: { f0: 1 } }]), 'an unknown op still aborts');

// ── 5. re-running the same changeset aborts instead of double-applying ─────
{
  const cs = [{ id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8 } }];
  const first = run(BASE, cs);
  const second = run(first.out, cs);
  aborted(second, 'add: applying the same changeset to its own output aborts (idempotence guard)');
}

// ── 6. a run that fails part-way leaves no output file ─────────────────────
aborted(run(BASE, [
  { id: 'FAG-6205-C', op: 'add', fields: { f0: 13.8 } },
  { id: 'FAG-6206-C', op: 'add', fields: { pu: 1 } },
]), 'a later failing op means no file is written, even though an earlier op was fine');

// ── 7. the existing ops still work ─────────────────────────────────────────
{
  const r = run(BASE, [
    { id: 'SKF-6205', op: 'set', fields: { cr: 99.5, sealing: 'Shielded' } },
    { id: 'NTN-6205', op: 'delete' },
  ]);
  const recs = r.out && parse(r.out);
  ok(r.code === 0 && recs && recs.length === 3 && recs[1].cr === 99.5 && recs[1].sealing === 'Shielded' && !recs.some(x => x.id === 'NTN-6205'),
     'set and delete are unchanged');
  ok(r.out === dbText([R1, R2.replace('"cr":14.8', '"cr":99.5').replace('"Open"', '"Shielded"'), R4]), 'set and delete: output is byte-identical apart from the intended edits');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`);
process.exit(failures ? 1 : 0);
