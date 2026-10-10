#!/usr/bin/env node
'use strict';
/*
 * Admin Worker: master database, import, publish and rollback.
 *
 *   node tests/admin.js
 *
 * Works on a throwaway local database in a temp folder (a copy of
 * admin/wrangler.toml pointed at it), never on admin/.wrangler. The real
 * commands build it: `wrangler d1 migrations apply --local`, then
 * scripts/seed-master.js --publish. The admin Worker's own fetch handler
 * (admin/src/index.js) is then called in Node against that database and its
 * local KV, and the search Worker's handler (api/src/index.js) reads the
 * same KV, with the clock moved forward to show a publish going live.
 *
 * Cloudflare Access is not switched off: the test makes its own RSA signing
 * keys, signs tokens with them and serves the public key at the team's certs
 * address (a stubbed fetch). Nothing leaves this machine. Needs
 * `npm install` in admin/ once.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ADMIN = path.join(ROOT, 'admin');
const WRANGLER_DIR = path.join(ADMIN, 'node_modules', 'wrangler');
const WRANGLER = path.join(WRANGLER_DIR, 'bin', 'wrangler.js');
if (!fs.existsSync(WRANGLER)) {
  console.error('admin/node_modules is missing: run `npm install` in admin/ first.');
  process.exit(1);
}
const { getPlatformProxy } = require(WRANGLER_DIR);
const { build, loadRawRows } = require('../scripts/build-published.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── throwaway database ───────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mycela-admin-test-'));
const CONFIG = path.join(TMP, 'wrangler.toml');
const fwd = p => p.replace(/\\/g, '/');
fs.writeFileSync(CONFIG, fs.readFileSync(path.join(ADMIN, 'wrangler.toml'), 'utf8')
  .replace('main = "src/index.js"', `main = "${fwd(path.join(ADMIN, 'src', 'index.js'))}"`)
  .replace('migrations_dir = "../db/migrations"', `migrations_dir = "${fwd(path.join(ROOT, 'db', 'migrations'))}"`));

const CHILD_ENV = Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false', CI: 'true' });
function run(args, cwd) {
  const r = spawnSync(process.execPath, args, { cwd: cwd || ROOT, encoding: 'utf8', env: CHILD_ENV });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const PERSIST = { path: path.join(TMP, '.wrangler', 'state', 'v3') };
const migrate = () => run([WRANGLER, 'd1', 'migrations', 'apply', 'mycela-master', '--local', '--config', CONFIG], TMP);

// ── Access: our own signing keys, served at the team's certs address ─────
const TEAM = 'mycela-test.cloudflareaccess.com';
const AUD = 'test-audience-0123456789abcdef';
const EMAIL = 'Tester@Example.com';
const ACTOR = 'tester@example.com';
const CERTS_URL = `https://${TEAM}/cdn-cgi/access/certs`;
const newKey = kid => {
  const k = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey: k.privateKey, jwk: Object.assign(k.publicKey.export({ format: 'jwk' }), { kid, alg: 'RS256', use: 'sig' }) };
};
const TEAM_KEY = newKey('team-key-1');
const OTHER_KEY = newKey('team-key-1');  // same key id, not the team's key

// Simulated time: the clock can be moved forward, never frozen.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const nowS = () => Math.floor(Date.now() / 1000);

const realFetch = globalThis.fetch;
let outsideCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input && input.url ? input.url : input);
  if (url === CERTS_URL) return new Response(JSON.stringify({ keys: [TEAM_KEY.jwk] }), { headers: { 'Content-Type': 'application/json' } });
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return realFetch(input, init);
  outsideCalls++;
  throw new Error('unexpected network call: ' + url);
};

const b64url = x => Buffer.from(x).toString('base64url');
function token(over, opts) {
  opts = opts || {};
  const key = opts.key || TEAM_KEY;
  const header = Object.assign({ alg: 'RS256', kid: key.kid, typ: 'JWT' }, opts.header);
  const claims = Object.assign({ iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, iat: nowS(), exp: nowS() + 300 }, over);
  Object.keys(claims).forEach(k => { if (claims[k] === undefined) delete claims[k]; });
  const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  const sig = opts.unsigned ? '' : crypto.createSign('RSA-SHA256').update(data).sign(key.privateKey).toString('base64url');
  return data + '.' + sig;
}

// ── CSV ──────────────────────────────────────────────────────────────────
const COLS = ['id', 'brand', 'pn', 'type', 'bore', 'od', 'w', 'cr', 'c0r', 'rpm', 'speed_ref', 'mass', 'pu', 'f0',
              'sealing', 'apps', 'alt', 'source'];
function csv(rows) {
  const cell = v => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join(';') : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [COLS.join(',')].concat(rows.map(r => COLS.map(c => cell(r[c])).join(','))).join('\r\n') + '\r\n';
}

const INJECTION = "x'); DROP TABLE parts;--";

(async () => {
  let proxy = null;
  try {
    // ── 1. migrations on an empty database ────────────────────────────────
    const m1 = migrate();
    ok(m1.status === 0, 'migrations apply to an empty database' + (m1.status === 0 ? '' : '\n' + m1.out));
    const m2 = migrate();
    ok(m2.status === 0 && /No migrations to apply/i.test(m2.out), 'applying them a second time does nothing');

    proxy = await getPlatformProxy({ configPath: CONFIG, persist: PERSIST });
    let db = proxy.env.DB;
    const names = async type => (await db.prepare("SELECT name FROM sqlite_master WHERE type = ?1 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name")
      .bind(type).all()).results.map(r => r.name);
    ok(same(await names('table'), ['audit_log', 'import_batches', 'parts', 'publishes', 'staged_parts']),
       'tables: audit_log, import_batches, parts, publishes, staged_parts');
    ok(same(await names('view'), ['staged_vs_master']), 'view: staged_vs_master');
    ok(same(await names('trigger'), ['audit_log_no_delete', 'audit_log_no_update']), 'triggers: audit_log_no_delete, audit_log_no_update');
    const emptyCounts = await db.prepare('SELECT (SELECT count(*) FROM parts) + (SELECT count(*) FROM import_batches) + (SELECT count(*) FROM audit_log) + (SELECT count(*) FROM publishes) AS n').first();
    ok(emptyCounts.n === 0, 'every table starts empty');
    await proxy.dispose();
    proxy = null;

    // ── 2. seed from bearings_db.js, with the real script ─────────────────
    const raw = loadRawRows();
    const seed = run([path.join(ROOT, 'scripts', 'seed-master.js'), '--config', CONFIG, '--publish']);
    ok(seed.status === 0 && seed.out.includes(`${raw.length} added`) && seed.out.includes('Published published/v1'),
       `seed-master.js --publish loads all ${raw.length} rows as batch 0 and publishes v1` + (seed.status === 0 ? '' : '\n' + seed.out));
    const seed2 = run([path.join(ROOT, 'scripts', 'seed-master.js'), '--config', CONFIG]);
    ok(seed2.status !== 0 && /already has 1 import/.test(seed2.out), 'the seed refuses to run a second time');

    proxy = await getPlatformProxy({ configPath: CONFIG, persist: PERSIST });
    db = proxy.env.DB;
    const kv = proxy.env.CATALOG;
    const env = { DB: db, CATALOG: kv, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
    const admin = (await import(pathToFileURL(path.join(ADMIN, 'src', 'index.js')).href)).default;
    const searchWorker = (await import(pathToFileURL(path.join(ROOT, 'api', 'src', 'index.js')).href)).default;

    const one = async (sql, ...binds) => db.prepare(sql).bind(...binds).first();
    const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
    const kvKeys = async () => (await kv.list({ prefix: 'published/' })).keys.map(k => k.name).sort();
    // Everything an admin action could change.
    const snapshot = async () => JSON.stringify({
      db: await one(`SELECT (SELECT count(*) FROM parts) AS parts,
                            (SELECT total(bore) + total(od) + total(w) + total(mass) + total(cr) FROM parts) AS sums,
                            (SELECT max(updated_at) FROM parts) AS updated,
                            (SELECT count(*) FROM import_batches) AS batches,
                            (SELECT count(*) FROM staged_parts) AS staged,
                            (SELECT count(*) FROM audit_log) AS audit,
                            (SELECT count(*) FROM publishes) AS publishes`),
      current: await kv.get('published/current'),
      keys: await kvKeys(),
    });
    const call = async (method, p, opts) => {
      opts = opts || {};
      const headers = {};
      const tok = opts.token === undefined ? token() : opts.token;
      if (tok !== null) headers['Cf-Access-Jwt-Assertion'] = tok;
      if (opts.type) headers['Content-Type'] = opts.type;
      const res = await admin.fetch(new Request('https://admin.mycela.in' + p, { method, headers, body: opts.body }), opts.env || env);
      let body = null;
      try { body = await res.json(); } catch (e) { /* no body */ }
      return { status: res.status, body };
    };
    const upload = (text, opts) => call('POST', '/admin/import?source_name=' + encodeURIComponent((opts && opts.source) || 'Test OEM') +
                                        '&file_name=' + encodeURIComponent((opts && opts.file) || 'test.csv'),
                                        Object.assign({ type: 'text/csv', body: text }, opts));
    const search = async q => {
      const res = await searchWorker.fetch(new Request('https://api.mycela.in/search?q=' + encodeURIComponent(q)), { CATALOG: kv });
      return { status: res.status, body: await res.json() };
    };

    ok((await one('SELECT count(*) AS n FROM parts')).n === raw.length, `parts holds ${raw.length} rows after the seed`);
    const seedAudit = await all('SELECT action, count(*) AS n FROM audit_log GROUP BY action ORDER BY action');
    ok(same(seedAudit, [{ action: 'import.commit', n: 1 }, { action: 'import.stage', n: 1 },
                        { action: 'part.add', n: raw.length }, { action: 'publish', n: 1 }]),
       'the seed is in the audit log: one stage, one commit, one part.add per row, one publish');
    ok(await kv.get('published/current') === 'published/v1', 'published/current points to published/v1');
    const v1Text = await kv.get('published/v1');
    const fromFile = build();
    ok(same(JSON.parse(v1Text), JSON.parse(JSON.stringify(fromFile))),
       `published/v1 from the database is identical to the catalogue built from bearings_db.js (${fromFile.count} rows)`);

    // ── 3. a good CSV: import, preview, commit ────────────────────────────
    const r6205 = raw.find(r => r.id === 'SKF-6205');
    const r6206 = raw.find(r => r.id === 'SKF-6206');
    const NEW_MASS = r6206.mass + 0.01;
    const newPart = { id: 'TEST-NEW-1', brand: 'SKF', pn: 'ZT9001', type: 'Deep Groove Ball', bore: 27, od: 53, w: 14,
                      cr: 12.5, c0r: 6.5, rpm: 15000, mass: 0.12, sealing: 'Open', apps: ['test rigs'], alt: ['SKF-6205'], source: 'Test OEM sheet' };
    const injPart = { id: 'TEST-INJ-1', brand: 'FAG', pn: INJECTION, type: 'Deep Groove Ball', bore: 28, od: 54, w: 13, source: 'Test OEM sheet' };
    const goodCsv = csv([r6205, Object.assign({}, r6206, { mass: NEW_MASS }), newPart, injPart]);

    const before3 = await snapshot();
    const partsBefore = JSON.parse(before3).db.parts;
    const imp = await upload(goodCsv);
    ok(imp.status === 201 && imp.body.status === 'staged' && imp.body.row_count === 4 && imp.body.error_count === 0,
       'good CSV: accepted and staged (201), 4 rows, no errors');
    const batchId = imp.body.batch_id;
    const staged3 = JSON.parse(await snapshot());
    ok(staged3.db.parts === partsBefore && staged3.db.sums === JSON.parse(before3).db.sums && staged3.db.staged === 4,
       'staging does not touch parts: the 4 rows wait in staged_parts');

    const prev = await call('GET', `/admin/import/${batchId}`);
    const pv = prev.body.preview || {};
    ok(prev.status === 200 && pv.added === 2 && pv.changed === 1 && pv.unchanged === 1,
       'preview: 2 added, 1 changed, 1 unchanged');
    const chg = (pv.first_changes || []).find(c => c.id === 'SKF-6206') || {};
    ok(chg.kind === 'changed' && same(chg.fields, { mass: { from: r6206.mass, to: NEW_MASS } }),
       `preview shows the one changed field: SKF-6206 mass ${r6206.mass} to ${NEW_MASS}`);
    const addedIds = (pv.first_changes || []).filter(c => c.kind === 'added').map(c => c.id);
    ok(same(addedIds, ['TEST-NEW-1', 'TEST-INJ-1']) && !(pv.first_changes || []).some(c => c.id === 'SKF-6205'),
       'preview lists the two new parts and leaves out the unchanged one');

    const com = await call('POST', `/admin/import/${batchId}/commit`);
    ok(com.status === 200 && com.body.added === 2 && com.body.changed === 1 && com.body.unchanged === 1,
       'commit: 200 with 2 added, 1 changed, 1 unchanged');
    ok((await one('SELECT count(*) AS n FROM parts')).n === partsBefore + 2, 'parts has 2 more rows');
    const p6206 = await one('SELECT mass, import_batch_id, brand_source, source_file FROM parts WHERE id = ?1', 'SKF-6206');
    ok(p6206.mass === NEW_MASS && p6206.import_batch_id === batchId && p6206.brand_source === 'Test OEM' && p6206.source_file === 'test.csv',
       'the changed part has the new value and records the batch, source and file it came from');
    const p6205 = await one('SELECT import_batch_id FROM parts WHERE id = ?1', 'SKF-6205');
    ok(p6205.import_batch_id === 0, 'the unchanged part still belongs to the seed batch');
    const pNew = await one('SELECT pn, bore, apps, alt FROM parts WHERE id = ?1', 'TEST-NEW-1');
    ok(pNew && pNew.pn === 'ZT9001' && pNew.bore === 27 && pNew.apps === '["test rigs"]' && pNew.alt === '["SKF-6205"]',
       'the new part is stored with its values and lists');
    const batchAudit = await all('SELECT action, actor, entity_id, before_json, after_json FROM audit_log WHERE batch_id = ?1 ORDER BY id', batchId);
    ok(same(batchAudit.map(a => a.action).sort(), ['import.commit', 'import.stage', 'part.add', 'part.add', 'part.change']),
       'audit rows for the batch: stage, commit, 2 part.add, 1 part.change');
    ok(batchAudit.every(a => a.actor === ACTOR), `every audit row names the signed-in person (${ACTOR})`);
    const change = batchAudit.find(a => a.action === 'part.change') || {};
    ok(change.entity_id === 'SKF-6206' && JSON.parse(change.before_json || '{}').mass === r6206.mass &&
       JSON.parse(change.after_json || '{}').mass === NEW_MASS, 'the part.change row keeps the value before and after');
    ok((await one('SELECT count(*) AS n FROM staged_parts')).n === 0, 'staged rows are cleared after the commit');
    const after3 = await snapshot();
    const again = await call('POST', `/admin/import/${batchId}/commit`);
    ok(again.status === 409 && await snapshot() === after3, 'committing the same import again is refused (409) and changes nothing');

    // ── 4. SQL in a designation ───────────────────────────────────────────
    const pInj = await one('SELECT pn FROM parts WHERE id = ?1', 'TEST-INJ-1');
    ok(pInj && pInj.pn === INJECTION, `designation ${INJECTION} is accepted and stored as plain text, character for character`);
    ok((await one('SELECT count(*) AS n FROM parts')).n === partsBefore + 2, 'the parts table is still there with every row');
    const injId = await upload(csv([Object.assign({}, injPart, { id: INJECTION, pn: 'ZT9002' })]));
    ok(injId.status === 422 && injId.body.errors.some(e => e.field === 'id' && /may only use/.test(e.problem)),
       'the same text as an id is rejected by the id character rule');
    const markup = await upload(csv([Object.assign({}, injPart, { id: 'TEST-INJ-2', pn: '<img src=x onerror=alert(1)>' })]));
    ok(markup.status === 422 && markup.body.errors.some(e => e.field === 'pn' && /< >/.test(e.problem)),
       'a designation with < > is rejected by the character rule');

    // ── 5. a bad file is rejected whole ───────────────────────────────────
    const base = { brand: 'SKF', type: 'Deep Groove Ball', bore: 20, od: 47, w: 14, source: 'Test OEM sheet' };
    const badCsv = csv([
      Object.assign({}, base, { id: 'TEST-OK-9', pn: 'ZT9100' }),                      // row 1: fine
      Object.assign({}, base, { id: 'TEST-BAD-1', pn: 'ZT9101', bore: 60, od: 47 }),   // row 2: bore > od
      Object.assign({}, base, { id: 'TEST-BAD-2', pn: 'ZT9102', brand: 'Acme' }),      // row 3: unknown brand
      Object.assign({}, base, { id: 'TEST-BAD-3', pn: null }),                         // row 4: no designation
      Object.assign({}, base, { id: 'TEST-DUP-1', pn: 'ZT9104' }),                     // row 5: fine
      Object.assign({}, base, { id: 'TEST-DUP-1', pn: 'ZT9105' }),                     // row 6: same id as row 5
    ]);
    const before5 = JSON.parse(await snapshot());
    const bad = await upload(badCsv, { file: 'bad.csv' });
    ok(bad.status === 422 && bad.body.status === 'rejected' && bad.body.row_count === 6 && bad.body.error_count === 4,
       'bad file: rejected (422), 6 rows read, 4 problems');
    const errs = bad.body.errors || [];
    const has = (row, field, re) => errs.some(e => e.row === row && e.field === field && re.test(e.problem));
    ok(has(2, 'bore', /bore \(60\) must be smaller than od \(47\)/), 'report: row 2, bore larger than od');
    ok(has(3, 'brand', /unknown brand "Acme"/), 'report: row 3, unknown brand');
    ok(has(4, 'pn', /is required/), 'report: row 4, designation missing');
    ok(has(6, 'id', /duplicate id: also on row 5/), 'report: row 6, duplicate id (also on row 5)');
    ok(errs.find(e => e.row === 2).id === 'TEST-BAD-1', 'each problem names the id of its row');
    const after5 = JSON.parse(await snapshot());
    ok(after5.db.parts === before5.db.parts && after5.db.sums === before5.db.sums && after5.db.updated === before5.db.updated && after5.db.staged === 0,
       'parts is unchanged and nothing is staged');
    ok((await one("SELECT count(*) AS n FROM parts WHERE id LIKE 'TEST-OK-%' OR id LIKE 'TEST-BAD-%' OR id LIKE 'TEST-DUP-%'")).n === 0,
       'not even the good rows of the bad file were loaded');
    const badSummary = await call('GET', `/admin/import/${bad.body.batch_id}`);
    ok(badSummary.status === 200 && badSummary.body.status === 'rejected' && badSummary.body.error_report.error_count === 4 &&
       badSummary.body.error_report.errors.length === 4, 'the full report can be read again later from the import');
    ok((await one("SELECT count(*) AS n FROM audit_log WHERE action = 'import.reject' AND batch_id = ?1", bad.body.batch_id)).n === 1,
       'the rejection is in the audit log');
    const badCommit = await call('POST', `/admin/import/${bad.body.batch_id}/commit`);
    ok(badCommit.status === 409 && JSON.parse(await snapshot()).db.parts === before5.db.parts, 'a rejected import cannot be committed (409)');
    const wrongType = await upload(badCsv, { type: 'text/plain' });
    ok(wrongType.status === 415, 'a file that is neither CSV nor JSON is refused (415)');
    const tooBig = await upload('id,brand,pn,type\r\n' + 'x'.repeat(10 * 1024 * 1024));
    ok(tooBig.status === 413, 'a file over 10 MB is refused (413)');

    // ── 6. the audit log cannot be edited ─────────────────────────────────
    const auditBefore = await one('SELECT count(*) AS n, max(id) AS last FROM audit_log');
    const refused = async sql => { try { await db.prepare(sql).run(); return false; } catch (e) { return /append-only/.test(String(e.message)); } };
    ok(await refused("UPDATE audit_log SET actor = 'someone else'"), 'UPDATE on audit_log fails: "audit_log is append-only"');
    ok(await refused('DELETE FROM audit_log'), 'DELETE on audit_log fails: "audit_log is append-only"');
    ok(await refused(`DELETE FROM audit_log WHERE id = ${auditBefore.last}`), 'DELETE of a single audit row fails too');
    const auditAfter = await one("SELECT count(*) AS n, (SELECT count(*) FROM audit_log WHERE actor = 'someone else') AS edited FROM audit_log");
    ok(auditAfter.n === auditBefore.n && auditAfter.edited === 0, 'the audit log is exactly as it was');

    // ── 7. Access: bad tokens get nothing done ────────────────────────────
    const tampered = (() => {
      const t = token().split('.');
      const claims = JSON.parse(Buffer.from(t[1], 'base64url').toString());
      claims.email = 'intruder@example.com';
      return t[0] + '.' + b64url(JSON.stringify(claims)) + '.' + t[2];
    })();
    const BAD_TOKENS = [
      ['missing token', null, 401],
      ['token that is not a JWT', 'not-a-token', 401],
      ['expired token', token({ iat: nowS() - 7200, exp: nowS() - 3600 }), 401],
      ['token for another application (wrong audience)', token({ aud: ['some-other-application'] }), 403],
      ['token from another team (wrong issuer)', token({ iss: 'https://other-team.cloudflareaccess.com' }), 403],
      ['token signed with a key that is not the team\'s', token({}, { key: OTHER_KEY }), 401],
      ['token naming an unknown key', token({}, { key: Object.assign({}, OTHER_KEY, { kid: 'no-such-key' }) }), 401],
      ['unsigned token (alg none)', token({}, { header: { alg: 'none' }, unsigned: true }), 401],
      ['token whose claims were altered after signing', tampered, 401],
      ['token with no email', token({ email: undefined }), 403],
    ];
    const ACTIONS = [
      ['POST', '/admin/import?source_name=Intruder', { type: 'text/csv', body: csv([Object.assign({}, base, { id: 'TEST-INTRUDER', pn: 'ZT9200' })]) }],
      ['POST', `/admin/import/${batchId}/commit`, {}],
      ['POST', '/admin/publish', {}],
      ['POST', '/admin/rollback/1', {}],
      ['GET', '/admin/audit', {}],
    ];
    const before7 = await snapshot();
    for (const [label, tok, want] of BAD_TOKENS) {
      const got = [];
      for (const [method, p, opts] of ACTIONS) got.push((await call(method, p, Object.assign({}, opts, { token: tok }))).status);
      ok(got.every(s => s === want), `${label}: ${want} on import, commit, publish, rollback and audit` + (got.every(s => s === want) ? '' : ` (got ${got.join(', ')})`));
    }
    ok(await snapshot() === before7, 'after all of those: no import, no audit row, no publish, pointer unchanged');
    const noConfig = await call('POST', '/admin/publish', { env: { DB: db, CATALOG: kv, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' } });
    ok(noConfig.status === 500 && await snapshot() === before7, 'with Access not configured every request is refused, even with a good token');
    const audit = await call('GET', '/admin/audit?limit=5');
    ok(audit.status === 200 && audit.body.entries.length === 5, 'a good token is let in (audit list, 200)');
    ok((await call('GET', '/admin/nowhere')).status === 404 && (await call('DELETE', '/admin/audit')).status === 405,
       'unknown paths get 404 and other methods 405; there is no way to delete audit rows');

    // ── 8. publish v2, live within a minute, roll back ────────────────────
    const NEW_DIMS = '27x53x14';
    const seesNew = async () => (await search(NEW_DIMS)).body.results.some(r => r.id === 'TEST-NEW-1');
    const mass6206 = async () => ((await search('6206')).body.results.find(r => r.id === 'SKF-6206') || {}).mass;
    ok(!(await seesNew()) && await mass6206() === r6206.mass, 'search Worker is serving v1: no new part, old SKF-6206 mass');

    const pub = await call('POST', '/admin/publish');
    ok(pub.status === 200 && pub.body.version === 2 && pub.body.key === 'published/v2' && pub.body.previous === 'published/v1',
       'publish: 200, version 2, stored as published/v2');
    ok(await kv.get('published/current') === 'published/v2', 'published/current now points to published/v2');
    const v2Text = await kv.get('published/v2');
    const v2 = JSON.parse(v2Text);
    ok(v2.version === 2 && v2.count === fromFile.count + 2 && v2.rows.some(r => r.id === 'TEST-NEW-1') &&
       v2.rows.find(r => r.id === 'SKF-6206').mass === NEW_MASS, `published/v2 has the committed changes (${v2.count} rows)`);
    ok(v2.rows.every(r => !('apps' in r) && !('pu' in r) && !('brand_source' in r) && !('import_batch_id' in r)),
       'published/v2 carries no unpublished or provenance fields');
    ok(await kv.get('published/v1') === v1Text, 'published/v1 is still stored, untouched');
    const sha = t => crypto.createHash('sha256').update(t).digest('hex');
    const pubRows = await all('SELECT version, actor, row_count, sha256 FROM publishes ORDER BY version');
    ok(pubRows.length === 2 && pubRows[0].sha256 === sha(v1Text) && pubRows[1].sha256 === sha(v2Text) && pubRows[1].actor === ACTOR,
       'publishes records both versions with the checksum of what was stored');
    const pubAudit = await one("SELECT actor, before_json, after_json FROM audit_log WHERE action = 'publish' ORDER BY id DESC LIMIT 1");
    ok(pubAudit.actor === ACTOR && JSON.parse(pubAudit.before_json).current === 'published/v1' && JSON.parse(pubAudit.after_json).current === 'published/v2',
       'the publish is in the audit log, from v1 to v2');

    ok(!(await seesNew()), 'straight after the publish the search Worker still serves v1 (it re-checks once a minute)');
    clockOffset += 60 * 1000;
    ok(await seesNew() && await mass6206() === NEW_MASS, '60 seconds later (simulated) the search Worker serves v2: new part found, new mass');

    const back = await call('POST', '/admin/rollback/1');
    ok(back.status === 200 && back.body.current === 'published/v1' && back.body.previous === 'published/v2', 'rollback to version 1: 200');
    ok(await kv.get('published/current') === 'published/v1' && await kv.get('published/v2') === v2Text,
       'published/current points to published/v1 again; published/v2 is kept');
    clockOffset += 60 * 1000;
    ok(!(await seesNew()) && await mass6206() === r6206.mass, '60 seconds later (simulated) the search Worker serves v1 again');
    const backAudit = await one("SELECT actor, entity_id FROM audit_log WHERE action = 'publish.rollback' ORDER BY id DESC LIMIT 1");
    ok(backAudit && backAudit.actor === ACTOR && backAudit.entity_id === 'published/v1', 'the rollback is in the audit log');
    ok((await one('SELECT count(*) AS n FROM parts')).n === partsBefore + 2, 'a rollback does not touch the master database');
    const noSuch = await call('POST', '/admin/rollback/99');
    ok(noSuch.status === 404 && await kv.get('published/current') === 'published/v1', 'rollback to a version never published: 404, pointer unchanged');
    ok(outsideCalls === 0, 'no network call left this machine');

    const COUNTS = `SELECT (SELECT count(*) FROM parts) AS parts, (SELECT count(*) FROM import_batches) AS batches,
                           (SELECT count(*) FROM audit_log) AS audit, (SELECT count(*) FROM publishes) AS publishes,
                           (SELECT count(*) FROM sqlite_master WHERE type = 'trigger') AS triggers,
                           (SELECT count(*) FROM sqlite_master WHERE type = 'view') AS views`;
    const finalCounts = await one(COUNTS);
    await proxy.dispose();
    proxy = null;

    // ── 9. the search Worker has no database ──────────────────────────────
    const stripComments = t => t.split(/\r?\n/).map(l => l.replace(/#.*$/, '')).join('\n');
    const apiToml = stripComments(fs.readFileSync(path.join(ROOT, 'api', 'wrangler.toml'), 'utf8'));
    const adminToml = stripComments(fs.readFileSync(path.join(ADMIN, 'wrangler.toml'), 'utf8'));
    ok(!/d1_databases/.test(apiToml) && !/database_(id|name)/.test(apiToml), 'api/wrangler.toml (search Worker) has no D1 binding');
    const bindings = [...apiToml.matchAll(/^\s*(?:binding|name)\s*=\s*"([^"]+)"/gm)].map(m => m[1]).sort();
    ok(same(bindings, ['CATALOG', 'SEARCH_LIMITER', 'mycela-search-api']), 'its only bindings are CATALOG (KV) and SEARCH_LIMITER');
    ok(/\[\[d1_databases\]\]/.test(adminToml), 'admin/wrangler.toml is the one with the D1 binding');
    const apiSrc = fs.readdirSync(path.join(ROOT, 'api', 'src')).map(f => fs.readFileSync(path.join(ROOT, 'api', 'src', f), 'utf8')).join('\n');
    ok(!/env\.DB\b/.test(apiSrc) && !/\.put\(/.test(apiSrc), 'the search Worker code never touches a database and never writes to KV');

    // ── 10. backup ────────────────────────────────────────────────────────
    const outDir = path.join(TMP, 'backups');
    const bk = run([path.join(ROOT, 'scripts', 'backup-master.js'), '--config', CONFIG, '--out-dir', outDir]);
    const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
    const sql = files.length ? fs.readFileSync(path.join(outDir, files[0]), 'utf8') : '';
    ok(bk.status === 0 && files.length === 1 && /^master-\d{4}-\d{2}-\d{2}\.sql$/.test(files[0]),
       'backup-master.js writes master-<date>.sql' + (bk.status === 0 ? '' : '\n' + bk.out));
    ok(/CREATE TABLE (IF NOT EXISTS )?"?parts"?/.test(sql) && /audit_log_no_update/.test(sql) && sql.includes('TEST-NEW-1') && sql.includes('SKF-6205'),
       'the backup has the tables, the audit triggers and the rows');

    // ...and it loads back into an empty database.
    const TMP2 = path.join(TMP, 'restore');
    fs.mkdirSync(TMP2);
    const CONFIG2 = path.join(TMP2, 'wrangler.toml');
    fs.copyFileSync(CONFIG, CONFIG2);
    const rs = files.length ? run([WRANGLER, 'd1', 'execute', 'mycela-master', '--local', '--config', CONFIG2,
                                   '--file', path.join(outDir, files[0])], TMP2) : { status: 1, out: 'no backup file' };
    ok(rs.status === 0, 'the backup loads into an empty database (wrangler d1 execute --file)' + (rs.status === 0 ? '' : '\n' + rs.out.slice(-600)));
    proxy = await getPlatformProxy({ configPath: CONFIG2, persist: { path: path.join(TMP2, '.wrangler', 'state', 'v3') } });
    const restored = await proxy.env.DB.prepare(COUNTS).first().catch(() => null);
    ok(same(restored, finalCounts), `the restored database has the same ${finalCounts.parts} parts, ${finalCounts.audit} audit rows, triggers and view`);
    const stillLocked = await proxy.env.DB.prepare('DELETE FROM audit_log').run().then(() => false, e => /append-only/.test(String(e.message)));
    ok(stillLocked, 'its audit log is append-only too');
    await proxy.dispose();
    proxy = null;
  } catch (e) {
    failures++;
    console.log('FAIL  the test run stopped: ' + (e && e.stack || e));
  } finally {
    if (proxy) await proxy.dispose().catch(() => {});
    try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder, left for the OS */ }
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
