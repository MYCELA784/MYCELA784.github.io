/*
 * The import and publish pipeline over the master database (env.DB, D1)
 * and the published catalogue (env.CATALOG, KV). Used by the admin Worker
 * (src/index.js) and by scripts/seed-master.js, so the first load of the
 * catalogue goes through the same checks and audit trail as any file.
 *
 *   importFile(env, { bytes, kind, sourceName, fileName, actor })
 *   batchSummary(env, id)
 *   commitBatch(env, id, actor)
 *   publish(env, actor)
 *   rollback(env, version, actor)
 *   auditList(env, limit)
 *
 * Every SQL statement is a fixed text with ?N placeholders; values are only
 * ever bound, never put into the SQL. Steps that change several things run
 * as one D1 batch, which commits all of it or none of it.
 */
import '../../api/src/globals.js';
import '../../js/db.js';
import catalogLib from '../../scripts/lib/published-catalog.js';
import schema from '../../schemas/bearing.schema.json' with { type: 'json' };
import FIELDS from '../../api/published-fields.json' with { type: 'json' };
import { parseFile, validateRecords } from './validate.js';

export const POINTER_KEY = 'published/current';
export const versionKey = v => `published/v${v}`;
const MAX_REPORTED_ERRORS = 1000;
const STAGE_CHUNK_CHARS = 500000;
const now = () => new Date().toISOString();

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SQL ──────────────────────────────────────────────────────────────────
const SQL = {
  nextBatchId: `SELECT coalesce(max(id), -1) + 1 AS next FROM import_batches`,
  insertBatch: `INSERT INTO import_batches (id, source_name, file_name, file_sha256, uploaded_by, uploaded_at, row_count, status, error_report)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  stageRows: `INSERT INTO staged_parts (batch_id, row_no, id, brand, pn, type, bore, od, w, cr, c0r, rpm, speed_ref, mass, pu, f0, sealing, apps, alt, source)
              SELECT ?1,
                     json_extract(value, '$.row_no'), json_extract(value, '$.id'), json_extract(value, '$.brand'),
                     json_extract(value, '$.pn'), json_extract(value, '$.type'),
                     json_extract(value, '$.bore'), json_extract(value, '$.od'), json_extract(value, '$.w'),
                     json_extract(value, '$.cr'), json_extract(value, '$.c0r'), json_extract(value, '$.rpm'),
                     json_extract(value, '$.speed_ref'), json_extract(value, '$.mass'), json_extract(value, '$.pu'),
                     json_extract(value, '$.f0'), json_extract(value, '$.sealing'), json_extract(value, '$.apps'),
                     json_extract(value, '$.alt'), json_extract(value, '$.source')
              FROM json_each(?2)`,
  audit: `INSERT INTO audit_log (at, actor, action, entity, entity_id, batch_id, before_json, after_json)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  batch: `SELECT id, source_name, file_name, file_sha256, uploaded_by, uploaded_at, row_count, status, error_report,
                 committed_by, committed_at
          FROM import_batches WHERE id = ?1`,
  diffCounts: `SELECT count(*) AS total, coalesce(sum(is_new), 0) AS added, coalesce(sum(is_changed), 0) AS changed
               FROM staged_vs_master WHERE batch_id = ?1`,
  diffFirst: `SELECT row_no, id, is_new, staged_json, master_json
              FROM staged_vs_master WHERE batch_id = ?1 AND (is_new OR is_changed)
              ORDER BY row_no LIMIT ?2`,
  commitSummary: `SELECT after_json FROM audit_log WHERE action = 'import.commit' AND batch_id = ?1 ORDER BY id DESC LIMIT 1`,
  maxOrder: `SELECT coalesce(max(catalogue_order), 0) AS base FROM parts`,
  // Commit, in this order, as one batch. Each statement only acts while the
  // batch is still 'staged', so a second commit of the same batch does nothing.
  commitAuditSummary: `INSERT INTO audit_log (at, actor, action, entity, entity_id, batch_id, before_json, after_json)
              SELECT ?2, ?3, 'import.commit', 'import_batch', CAST(?1 AS TEXT), ?1, NULL,
                     json_object('added', added, 'changed', changed, 'unchanged', total - added - changed)
              FROM (SELECT count(*) AS total, coalesce(sum(is_new), 0) AS added, coalesce(sum(is_changed), 0) AS changed
                    FROM staged_vs_master WHERE batch_id = ?1)
              WHERE EXISTS (SELECT 1 FROM import_batches WHERE id = ?1 AND status = 'staged')`,
  commitAuditParts: `INSERT INTO audit_log (at, actor, action, entity, entity_id, batch_id, before_json, after_json)
              SELECT ?2, ?3, CASE WHEN is_new THEN 'part.add' ELSE 'part.change' END, 'part', id, batch_id,
                     master_json, staged_json
              FROM staged_vs_master
              WHERE batch_id = ?1 AND (is_new OR is_changed)
                AND EXISTS (SELECT 1 FROM import_batches WHERE id = ?1 AND status = 'staged')
              ORDER BY row_no`,
  commitParts: `INSERT INTO parts (id, brand, pn, type, bore, od, w, cr, c0r, rpm, speed_ref, mass, pu, f0, sealing, apps, alt, source,
                                   brand_source, source_file, import_batch_id, updated_at, catalogue_order)
              SELECT s.id, s.brand, s.pn, s.type, s.bore, s.od, s.w, s.cr, s.c0r, s.rpm, s.speed_ref, s.mass, s.pu, s.f0,
                     s.sealing, s.apps, s.alt, s.source, b.source_name, b.file_name, b.id, ?2, ?4 + s.row_no
              FROM staged_parts s
              JOIN import_batches b ON b.id = s.batch_id
              JOIN staged_vs_master v ON v.batch_id = s.batch_id AND v.id = s.id
              WHERE s.batch_id = ?1 AND b.status = 'staged' AND (v.is_new OR v.is_changed)
              ORDER BY s.row_no
              ON CONFLICT (id) DO UPDATE SET
                brand = excluded.brand, pn = excluded.pn, type = excluded.type,
                bore = excluded.bore, od = excluded.od, w = excluded.w, cr = excluded.cr, c0r = excluded.c0r,
                rpm = excluded.rpm, speed_ref = excluded.speed_ref, mass = excluded.mass, pu = excluded.pu,
                f0 = excluded.f0, sealing = excluded.sealing, apps = excluded.apps, alt = excluded.alt,
                source = excluded.source, brand_source = excluded.brand_source, source_file = excluded.source_file,
                import_batch_id = excluded.import_batch_id, updated_at = excluded.updated_at`,
  commitStatus: `UPDATE import_batches SET status = 'committed', committed_by = ?3, committed_at = ?2
                 WHERE id = ?1 AND status = 'staged'`,
  commitClearStaged: `DELETE FROM staged_parts WHERE batch_id = ?1
                      AND EXISTS (SELECT 1 FROM import_batches WHERE id = ?1 AND status = 'committed')`,
  publishRows: `SELECT id, brand, pn, type, bore, od, w, cr, c0r, rpm, speed_ref, mass, pu, f0, sealing, apps, alt, source
                FROM parts ORDER BY catalogue_order, id`,
  nextVersion: `SELECT coalesce(max(version), 0) + 1 AS next FROM publishes`,
  insertPublish: `INSERT INTO publishes (version, at, actor, row_count, sha256) VALUES (?1, ?2, ?3, ?4, ?5)`,
  publishOf: `SELECT version, at, actor, row_count, sha256 FROM publishes WHERE version = ?1`,
  auditList: `SELECT id, at, actor, action, entity, entity_id, batch_id, before_json, after_json
              FROM audit_log ORDER BY id DESC LIMIT ?1`,
};

const auditStmt = (db, a) => db.prepare(SQL.audit).bind(
  a.at, a.actor, a.action, a.entity, a.entityId == null ? null : String(a.entityId), a.batchId == null ? null : a.batchId,
  a.before == null ? null : JSON.stringify(a.before), a.after == null ? null : JSON.stringify(a.after));

const isConflict = e => /UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY/.test(String(e && e.message));

// ── import ───────────────────────────────────────────────────────────────
export async function importFile(env, { bytes, kind, sourceName, fileName, actor }) {
  const db = env.DB;
  const sha = await sha256Hex(bytes);
  let text = null;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* reported below */ }

  let records = [], errors = [], rows = [];
  if (text === null) {
    errors.push({ row: null, id: null, field: null, problem: 'the file is not UTF-8 text' });
  } else {
    const parsed = parseFile(text, kind);
    records = parsed.records;
    parsed.fileErrors.forEach(p => errors.push({ row: null, id: null, field: null, problem: p }));
    if (!parsed.fileErrors.length) {
      const checked = validateRecords(records, schema);
      rows = checked.rows;
      errors = errors.concat(checked.errors);
      if (!rows.length && !errors.length) errors.push({ row: null, id: null, field: null, problem: 'the file has no rows' });
    }
  }

  const at = now();
  const status = errors.length ? 'rejected' : 'staged';
  const report = errors.length ? { error_count: errors.length, errors: errors.slice(0, MAX_REPORTED_ERRORS) } : null;

  // Batch ids count up from 0 (the seed). Two uploads at the same moment
  // could pick the same id; the second one's insert then fails as a whole
  // and is retried with the next id.
  for (let attempt = 0; ; attempt++) {
    const id = (await db.prepare(SQL.nextBatchId).first()).next;
    const stmts = [db.prepare(SQL.insertBatch).bind(id, sourceName, fileName || null, sha, actor, at, records.length,
                                                     status, report ? JSON.stringify(report) : null)];
    if (status === 'staged') {
      chunkRows(rows).forEach(json => stmts.push(db.prepare(SQL.stageRows).bind(id, json)));
    }
    stmts.push(auditStmt(db, {
      at, actor, action: status === 'staged' ? 'import.stage' : 'import.reject', entity: 'import_batch', entityId: id, batchId: id,
      after: { source_name: sourceName, file_name: fileName || null, file_sha256: sha, row_count: records.length,
               error_count: errors.length },
    }));
    try {
      await db.batch(stmts);
      return { batch_id: id, status, row_count: records.length, error_count: errors.length,
               errors: errors.slice(0, 50) };
    } catch (e) {
      if (!isConflict(e) || attempt >= 2) throw e;
    }
  }
}

function chunkRows(rows) {
  const chunks = [];
  let cur = [], size = 2;
  rows.forEach(r => {
    const s = JSON.stringify(Object.assign({}, r, { apps: JSON.stringify(r.apps), alt: JSON.stringify(r.alt) }));
    if (cur.length && size + s.length + 1 > STAGE_CHUNK_CHARS) { chunks.push('[' + cur.join(',') + ']'); cur = []; size = 2; }
    cur.push(s);
    size += s.length + 1;
  });
  if (cur.length) chunks.push('[' + cur.join(',') + ']');
  return chunks;
}

// ── preview ──────────────────────────────────────────────────────────────
const DATA_FIELDS = ['brand', 'pn', 'type', 'bore', 'od', 'w', 'cr', 'c0r', 'rpm', 'speed_ref', 'mass', 'pu', 'f0',
                     'sealing', 'apps', 'alt', 'source'];

export async function batchSummary(env, id) {
  const db = env.DB;
  const b = await db.prepare(SQL.batch).bind(id).first();
  if (!b) return null;
  const out = Object.assign({}, b, { error_report: b.error_report ? JSON.parse(b.error_report) : null });
  if (b.status === 'staged') {
    const c = await db.prepare(SQL.diffCounts).bind(id).first();
    out.preview = { added: c.added, changed: c.changed, unchanged: c.total - c.added - c.changed, first_changes: [] };
    const first = (await db.prepare(SQL.diffFirst).bind(id, 50).all()).results;
    out.preview.first_changes = first.map(r => {
      const staged = JSON.parse(r.staged_json);
      if (r.is_new) return { row: r.row_no, id: r.id, kind: 'added', values: staged };
      const master = JSON.parse(r.master_json);
      const fields = {};
      DATA_FIELDS.forEach(f => {
        if (JSON.stringify(staged[f]) !== JSON.stringify(master[f])) fields[f] = { from: master[f], to: staged[f] };
      });
      return { row: r.row_no, id: r.id, kind: 'changed', fields };
    });
  } else if (b.status === 'committed') {
    const s = await db.prepare(SQL.commitSummary).bind(id).first();
    out.committed = s ? JSON.parse(s.after_json) : null;
  }
  return out;
}

// ── commit ───────────────────────────────────────────────────────────────
export async function commitBatch(env, id, actor) {
  const db = env.DB;
  const b = await db.prepare(SQL.batch).bind(id).first();
  if (!b) return { status: 404, error: 'no such import' };
  if (b.status !== 'staged') return { status: 409, error: `this import is ${b.status}, only a staged import can be committed` };
  const at = now();
  const base = (await db.prepare(SQL.maxOrder).first()).base;
  const res = await db.batch([
    db.prepare(SQL.commitAuditSummary).bind(id, at, actor),
    db.prepare(SQL.commitAuditParts).bind(id, at, actor),
    db.prepare(SQL.commitParts).bind(id, at, actor, base),
    db.prepare(SQL.commitStatus).bind(id, at, actor),
    db.prepare(SQL.commitClearStaged).bind(id),
  ]);
  if (res[3].meta.changes !== 1) return { status: 409, error: 'this import was committed by someone else meanwhile' };
  const s = await db.prepare(SQL.commitSummary).bind(id).first();
  return Object.assign({ status: 200, batch_id: id }, JSON.parse(s.after_json));
}

// ── publish and rollback ─────────────────────────────────────────────────
export function catalogueFromParts(parts) {
  const raw = parts.map(p => Object.assign({}, p, {
    apps: p.apps == null ? [] : JSON.parse(p.apps),
    alt: p.alt == null ? [] : JSON.parse(p.alt),
  }));
  return catalogLib.buildCatalog(raw, { fields: FIELDS, prepareDB: globalThis.MYCELA.prepareDB });
}

export async function publish(env, actor) {
  const db = env.DB;
  const parts = (await db.prepare(SQL.publishRows).all()).results;
  if (!parts.length) return { status: 409, error: 'the master database is empty' };
  const built = catalogueFromParts(parts);
  const previous = await env.CATALOG.get(POINTER_KEY);
  const at = now();

  // Reserve the version number in the database first: two publishes at the
  // same moment cannot both get it, so neither can overwrite the other's KV
  // key. Then store the catalogue, then move the pointer.
  let version, text, sha;
  for (let attempt = 0; ; attempt++) {
    version = (await db.prepare(SQL.nextVersion).first()).next;
    text = JSON.stringify(Object.assign({ version }, built));
    sha = await sha256Hex(text);
    try {
      await db.batch([
        db.prepare(SQL.insertPublish).bind(version, at, actor, built.count, sha),
        auditStmt(db, { at, actor, action: 'publish', entity: 'catalogue', entityId: versionKey(version),
                        before: { current: previous }, after: { current: versionKey(version), row_count: built.count, sha256: sha } }),
      ]);
      break;
    } catch (e) {
      if (!isConflict(e) || attempt >= 2) throw e;
    }
  }
  await env.CATALOG.put(versionKey(version), text);
  await env.CATALOG.put(POINTER_KEY, versionKey(version));
  return { status: 200, version, key: versionKey(version), row_count: built.count, sha256: sha, previous };
}

export async function rollback(env, version, actor) {
  const db = env.DB;
  const p = await db.prepare(SQL.publishOf).bind(version).first();
  if (!p) return { status: 404, error: `version ${version} was never published` };
  const key = versionKey(version);
  const stored = await env.CATALOG.get(key);
  if (stored === null) return { status: 409, error: `${key} is missing from the catalogue store` };
  const previous = await env.CATALOG.get(POINTER_KEY);
  await db.batch([auditStmt(db, { at: now(), actor, action: 'publish.rollback', entity: 'catalogue', entityId: key,
                                  before: { current: previous }, after: { current: key } })]);
  await env.CATALOG.put(POINTER_KEY, key);
  return { status: 200, current: key, previous };
}

// ── audit ────────────────────────────────────────────────────────────────
export async function auditList(env, limit) {
  const rows = (await env.DB.prepare(SQL.auditList).bind(limit).all()).results;
  return rows.map(r => Object.assign({}, r, {
    before: r.before_json == null ? null : JSON.parse(r.before_json),
    after: r.after_json == null ? null : JSON.parse(r.after_json),
    before_json: undefined, after_json: undefined,
  }));
}
