#!/usr/bin/env node
'use strict';
/*
 * Derives `sealing` from each bearing's part-number suffix and rewrites
 * only the records where the derived value differs from what's stored.
 * A record whose pn carries no recognised sealing suffix is never
 * touched. Background: docs/catalogue-gaps.md.
 *
 * Mutation is a surgical per-record text replace on the original file
 * (find the record's exact `{"id":"...", ... }` span — bearings_db.js
 * has no nested object literals, verified by open-brace count ===
 * record count, so a record's span never contains another `{`/`}` —
 * and swap only its "sealing":"..." value). Every other byte of the
 * file, including number formatting and whitespace, is left untouched.
 * Always writes to a new file — never in place.
 *
 * Usage:
 *   node scripts/fix-sealing.js <input-bearings_db.js> <output-file>
 */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/fix-sealing.js <input-bearings_db.js> <output-file>');
  process.exit(1);
}

// Sealing-relevant subset of js/constants.js's SUFFIX_CODES. Codes not
// listed here (clearance, cage, precision, etc.) never trigger a change.
// Sealed is checked first: nothing in the current catalogue carries both,
// but a contact seal implies more than a shield if that ever changes.
const SEALED_CODES   = ['2RS', '2RS1', '2RS2', '2RSR', '2RSH', '2RSL', '2RZ', '2RS5', '2HRS', 'RS', 'LLU', 'LLB', 'LLH'];
const SHIELDED_CODES = ['2Z', 'Z', 'ZZ'];

// Sanity check: every code above must actually exist in constants.js's
// SUFFIX_CODES, so this script can't silently drift from that source of truth.
const constantsPath = path.join(__dirname, '..', 'js', 'constants.js');
const constantsSandbox = { window: {} };
vm.createContext(constantsSandbox);
vm.runInContext(fs.readFileSync(constantsPath, 'utf8'), constantsSandbox, { filename: constantsPath });
const SUFFIX_CODES = constantsSandbox.window.MYCELA.SUFFIX_CODES;
[...SEALED_CODES, ...SHIELDED_CODES].forEach(code => {
  if (!(code in SUFFIX_CODES)) {
    console.error(`Suffix code "${code}" is not in js/constants.js SUFFIX_CODES — aborting.`);
    process.exit(1);
  }
});

function tokensOf(pn) {
  return pn.toUpperCase().split(/[-\/\s]+/).slice(1);
}

function deriveSealing(pn) {
  const tokens = tokensOf(pn);
  if (tokens.some(t => SEALED_CODES.includes(t)))   return 'Sealed';
  if (tokens.some(t => SHIELDED_CODES.includes(t))) return 'Shielded';
  return null; // no recognised sealing suffix — never touch this record
}

// Load bearings_db.js the same way the browser does, to compute what
// needs to change and what the old/new values are.
const dbSrc = fs.readFileSync(inputPath, 'utf8');
const dbSandbox = { window: {} };
vm.createContext(dbSandbox);
vm.runInContext(dbSrc, dbSandbox, { filename: inputPath });
const records = dbSandbox.window.MYCELA_DB;
if (!Array.isArray(records)) {
  console.error(`${inputPath} did not produce window.MYCELA_DB as an array — aborting.`);
  process.exit(1);
}

const changes = [];
records.forEach(b => {
  const derived = deriveSealing(b.pn);
  if (derived && b.sealing !== derived) {
    changes.push({ id: b.id, pn: b.pn, oldSealing: b.sealing, newSealing: derived });
  }
});

console.log(`${changes.length} record(s) to change:`);
changes.forEach(c => console.log(`  ${c.id}\t${c.pn}\t${c.oldSealing} -> ${c.newSealing}`));
console.log(`\nTotal records in source: ${records.length}`);

// Surgical text replace: locate each record's exact `{"id":"<id>", ... }`
// span in the original source and swap only its sealing value there.
let output = dbSrc;
changes.forEach(c => {
  const idMarker = `{"id":"${c.id}",`;
  const startIdx = output.indexOf(idMarker);
  if (startIdx === -1) {
    console.error(`Could not locate record ${c.id} in ${inputPath} — aborting, no file written.`);
    process.exit(1);
  }
  if (output.indexOf(idMarker, startIdx + 1) !== -1) {
    console.error(`Record id ${c.id} is not unique in ${inputPath} — aborting, no file written.`);
    process.exit(1);
  }
  const endIdx = output.indexOf('}', startIdx);
  if (endIdx === -1) {
    console.error(`Could not find the closing brace for record ${c.id} — aborting, no file written.`);
    process.exit(1);
  }
  const span = output.slice(startIdx, endIdx + 1);
  const oldFieldStr = c.oldSealing === null ? '"sealing":null' : `"sealing":"${c.oldSealing}"`;
  const newFieldStr = `"sealing":"${c.newSealing}"`;
  const occurrences = span.split(oldFieldStr).length - 1;
  if (occurrences !== 1) {
    console.error(`Expected exactly one ${oldFieldStr} in record ${c.id}'s span, found ${occurrences} — aborting, no file written.`);
    process.exit(1);
  }
  const newSpan = span.replace(oldFieldStr, newFieldStr);
  output = output.slice(0, startIdx) + newSpan + output.slice(endIdx + 1);
});

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`\nWrote ${outputPath} (${changes.length} record(s) changed, everything else byte-identical to ${inputPath}).`);
