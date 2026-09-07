#!/usr/bin/env node
'use strict';
/*
 * Surgical, reviewable edits to bearings_db.js from a JSON changeset.
 * Same guarantees as scripts/fix-sealing.js: every record's literal is a
 * flat object with no nested braces (verified by open-brace count ===
 * record count), so a record's span never contains another `{`/`}`. Only
 * the targeted "field":value slices (or whole records, for deletes) are
 * touched; every other byte is left identical. Always writes a new file.
 *
 * Usage:
 *   node scripts/apply-data-fixes.js <in-bearings_db.js> <out-file> <changeset.json>
 *
 * changeset.json: [
 *   { "id": "NTN-NU2320", "op": "set", "fields": { "cr": null, "c0r": null } },
 *   { "id": "NTN-4T-32205R2_", "op": "delete" }
 * ]
 * A "set" value may be null or a finite number. Every field must resolve to
 * exactly one `"field":<number|null>` inside that record's span or the run
 * aborts with no file written.
 */
const fs = require('fs');
const vm = require('vm');

const [, , inPath, outPath, csPath] = process.argv;
if (!inPath || !outPath || !csPath) {
  console.error('Usage: node scripts/apply-data-fixes.js <in> <out> <changeset.json>');
  process.exit(1);
}
const die = m => { console.error('ABORT: ' + m + ' — no file written.'); process.exit(1); };

const src = fs.readFileSync(inPath, 'utf8');
const changes = JSON.parse(fs.readFileSync(csPath, 'utf8'));

// sanity: brace count === record count
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: inPath });
const records = sandbox.window.MYCELA_DB;
if (!Array.isArray(records)) die(inPath + ' did not produce window.MYCELA_DB');
const opens = (src.match(/\{/g) || []).length;
if (opens !== records.length) die(`brace count ${opens} !== record count ${records.length}`);
const byId = {};
records.forEach(r => { (byId[r.id] = byId[r.id] || []).push(r); });

let out = src;
let applied = 0;

changes.forEach(ch => {
  const marker = `{"id":"${ch.id}",`;
  const start = out.indexOf(marker);
  if (start === -1) die(`record ${ch.id} not found`);
  if (out.indexOf(marker, start + 1) !== -1) die(`record ${ch.id} not unique`);
  const endRel = out.slice(start).indexOf('}');
  if (endRel === -1) die(`no closing brace for ${ch.id}`);
  let span = out.slice(start, start + endRel + 1);

  if (ch.op === 'delete') {
    let s = start, e = start + span.length;
    if (out[e] === ',') e++;                 // eat trailing comma
    else if (out[s - 1] === ',') s--;        // or leading comma
    out = out.slice(0, s) + out.slice(e);
    console.log(`${ch.id}\tDELETED\t${span.slice(0, 90)}...`);
    applied++;
    return;
  }

  if (ch.op === 'set') {
    Object.keys(ch.fields).forEach(f => {
      const nv = ch.fields[f];
      const isNum = typeof nv === 'number' && isFinite(nv);
      const isStr = typeof nv === 'string';
      if (nv !== null && !isNum && !isStr) die(`${ch.id}.${f}: bad value ${JSON.stringify(nv)}`);
      const re = new RegExp(`("${f}":)("(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?|null)`);
      const m = re.exec(span);
      if (!m) die(`${ch.id}: field "${f}" not found in span`);
      if (re.exec(span.slice(m.index + m[0].length))) die(`${ch.id}: field "${f}" appears more than once`);
      const lit = nv === null ? 'null' : isStr ? JSON.stringify(nv) : String(nv);
      const newSpan = span.slice(0, m.index) + m[1] + lit + span.slice(m.index + m[0].length);
      console.log(`${ch.id}\t${f}: ${m[2]} -> ${lit}`);
      out = out.slice(0, start) + newSpan + out.slice(start + span.length);
      span = newSpan;
      applied++;
    });
    return;
  }

  die(`${ch.id}: unknown op ${ch.op}`);
});

fs.writeFileSync(outPath, out, 'utf8');
console.log(`\nWrote ${outPath}  (${applied} field/record change(s); byte-identical to ${inPath} otherwise).`);
