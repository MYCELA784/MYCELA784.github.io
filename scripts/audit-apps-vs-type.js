#!/usr/bin/env node
'use strict';
/*
 * Read-only audit: which records carry `apps` tags that contradict their
 * `type`? Same spirit as the Q5 `type` audit — report, do not touch the
 * data. Nothing is written.
 *
 *   node scripts/audit-apps-vs-type.js          summary + examples
 *   node scripts/audit-apps-vs-type.js --list   also dump every offending id
 *
 * Model — load direction only. A bearing type has a load-carrying
 * capability; an application tag can imply a load direction. A tag that
 * needs a direction the type cannot provide is a contradiction. Tags with
 * no clear direction (pumps, gearboxes, fans, conveyors, automotive,
 * mining, cement, paper mills, …) are NOT judged — they sit on every type
 * and flagging them would be guesswork, not a finding.
 *
 * This is deliberately conservative: it reports only combinations that are
 * wrong on bearing-selection first principles, so the list can be trusted
 * without a per-row rethink.
 */
const path = require('path');

global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
require(path.join(__dirname, '..', 'bearings_db.js'));
require(path.join(__dirname, '..', 'js', 'db.js'));
const DB = global.window.MYCELA.DB;

// ── Tags that imply the bearing must carry substantial THRUST ────────────
const AXIAL_TAGS = [
  'heavy axial loads', 'axial loads', 'screw drives',
  'vertical shaft applications', 'vertical shafts',
];
// ── Tags that imply substantial / dynamic RADIAL load ───────────────────
const RADIAL_TAGS = [
  'high radial loads', 'vibrating screens', 'crushers',
  'traction motors', 'axles', 'wheel hubs', 'differentials',
];

// Types that carry essentially no axial load — an AXIAL_TAG here is wrong.
// (Spherical Roller takes moderate thrust but not the screw-drive /
// "heavy axial" kind, so it is included.)
const RADIAL_ONLY_TYPES = [
  'Cylindrical Roller', 'Needle Roller', 'Self-Aligning Ball', 'Spherical Roller',
];
// Types that carry axial load only — a RADIAL_TAG here is wrong.
const AXIAL_ONLY_TYPES = ['Thrust Ball', 'Spherical Roller Thrust'];

const some = (b, list) => (b.apps || []).some(a => list.indexOf(a) !== -1);
const hits = (b, list) => (b.apps || []).filter(a => list.indexOf(a) !== -1);

const findings = [];
DB.forEach(b => {
  if (RADIAL_ONLY_TYPES.indexOf(b.type) !== -1 && some(b, AXIAL_TAGS)) {
    findings.push({ b, kind: 'axial tags on radial-only type', bad: hits(b, AXIAL_TAGS) });
  }
  if (AXIAL_ONLY_TYPES.indexOf(b.type) !== -1 && some(b, RADIAL_TAGS)) {
    findings.push({ b, kind: 'radial tags on thrust-only type', bad: hits(b, RADIAL_TAGS) });
  }
});

// ── Report ──────────────────────────────────────────────────────────────
const LIST = process.argv.indexOf('--list') !== -1;
console.log(`Catalogue: ${DB.length} records\n`);
console.log(`Hard load-direction contradictions: ${findings.length}\n`);

const byType = {};
findings.forEach(f => (byType[f.b.type] = byType[f.b.type] || []).push(f));

Object.keys(byType).sort().forEach(type => {
  const rows = byType[type];
  console.log(`── ${type}  (${rows.length})`);
  // group by the exact offending tag set
  const bySet = {};
  rows.forEach(f => {
    const k = f.bad.slice().sort().join(' + ');
    (bySet[k] = bySet[k] || []).push(f.b);
  });
  Object.keys(bySet).sort().forEach(k => {
    const ex = bySet[k].slice(0, 3).map(b => `${b.id} (${b.pn})`).join(', ');
    console.log(`   ${String(bySet[k].length).padStart(3)} ×  bad tags: ${k}`);
    console.log(`        e.g. ${ex}`);
    console.log(`        full apps of first: [${(bySet[k][0].apps || []).join(', ')}]`);
  });
  if (LIST) rows.forEach(f => console.log(`        ${f.b.id}`));
  console.log('');
});

// ── Context: softer directional mismatch, reported but NOT counted above ──
// Thrust-only bearings tagged with radial-machine industries (fans,
// conveyors, paper mills, agriculture, textile). The tag is
// direction-ambiguous in isolation, so this is a heads-up, not a finding.
const SOFT_RADIAL_INDUSTRY = [
  'fans', 'conveyors', 'paper mills', 'agriculture', 'agricultural machinery',
  'textile', 'textile machinery', 'electric motors', 'traction motors',
];
const soft = DB.filter(b =>
  AXIAL_ONLY_TYPES.indexOf(b.type) !== -1 &&
  !some(b, RADIAL_TAGS) &&                       // not already a hard hit
  some(b, SOFT_RADIAL_INDUSTRY));
console.log(`Soft mismatch (thrust-only type + radial-industry tag, not counted): ${soft.length}`);
const softByType = {};
soft.forEach(b => (softByType[b.type] = (softByType[b.type] || 0) + 1));
Object.keys(softByType).sort().forEach(t => console.log(`   ${String(softByType[t]).padStart(3)} × ${t}`));
if (soft[0]) console.log(`   e.g. ${soft.slice(0, 3).map(b => `${b.id} [${(b.apps || []).join(', ')}]`).join(' | ')}`);
