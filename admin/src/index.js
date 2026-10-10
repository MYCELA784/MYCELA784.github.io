/*
 * MYCELA admin Worker. The only Worker bound to the master database (D1)
 * and allowed to write the published catalogue (KV).
 *
 * Every request, whatever its path, must first pass the Cloudflare Access
 * check (src/access.js); the signed-in email is the actor in the audit log.
 *
 *   POST /admin/import?source_name=..&file_name=..   CSV or JSON body, max 10 MB
 *   GET  /admin/import/:id                           summary, errors or preview
 *   POST /admin/import/:id/commit
 *   POST /admin/publish
 *   POST /admin/rollback/:version
 *   GET  /admin/audit?limit=                         newest first
 *
 * There is no endpoint that edits or deletes audit rows, and the database
 * refuses it anyway (db/migrations/0001_master_tables.sql).
 */
import { verifyAccess } from './access.js';
import { importFile, batchSummary, commitBatch, publish, rollback, auditList } from './pipeline.js';

const MAX_UPLOAD = 10 * 1024 * 1024;
const SAFE_LABEL = /^[^<>"`\u0000-\u001f\u007f]{1,200}$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
const error = (status, message) => json({ error: message }, status);

// Read the body, stopping as soon as it passes the limit.
async function readLimited(request, max) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  parts.forEach(p => { out.set(p, at); at += p.byteLength; });
  return out;
}

const ROUTES = [
  { method: 'POST', pattern: /^\/admin\/import$/, handler: handleImport },
  { method: 'GET', pattern: /^\/admin\/import\/(\d{1,9})$/, handler: (req, env, actor, m) => handleSummary(env, Number(m[1])) },
  { method: 'POST', pattern: /^\/admin\/import\/(\d{1,9})\/commit$/, handler: (req, env, actor, m) => result(commitBatch(env, Number(m[1]), actor)) },
  { method: 'POST', pattern: /^\/admin\/publish$/, handler: (req, env, actor) => result(publish(env, actor)) },
  { method: 'POST', pattern: /^\/admin\/rollback\/([1-9]\d{0,8})$/, handler: (req, env, actor, m) => result(rollback(env, Number(m[1]), actor)) },
  { method: 'GET', pattern: /^\/admin\/audit$/, handler: handleAudit },
];

async function result(promise) {
  const r = await promise;
  const status = r.status;
  delete r.status;
  return status >= 400 ? error(status, r.error) : json(r, status);
}

async function handleImport(request, env, actor) {
  const url = new URL(request.url);
  const sourceName = (url.searchParams.get('source_name') || '').trim();
  const fileName = (url.searchParams.get('file_name') || '').trim() || null;
  if (!SAFE_LABEL.test(sourceName)) return error(400, 'source_name is required (1 to 200 characters, no < > " `)');
  if (fileName !== null && !SAFE_LABEL.test(fileName)) return error(400, 'file_name must be 1 to 200 characters, no < > " `');
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const kind = type === 'text/csv' ? 'csv' : type === 'application/json' ? 'json' : null;
  if (!kind) return error(415, 'send the file as text/csv or application/json');
  const bytes = await readLimited(request, MAX_UPLOAD);
  if (bytes === null) return error(413, 'the file is larger than 10 MB');

  const r = await importFile(env, { bytes, kind, sourceName, fileName, actor });
  return json(r, r.status === 'staged' ? 201 : 422);
}

async function handleSummary(env, id) {
  const s = await batchSummary(env, id);
  return s ? json(s) : error(404, 'no such import');
}

async function handleAudit(request, env) {
  const raw = new URL(request.url).searchParams.get('limit');
  const n = raw === null ? 50 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) return error(400, 'limit must be a whole number from 1 to 500');
  return json({ entries: await auditList(env, n) });
}

export default {
  async fetch(request, env) {
    const auth = await verifyAccess(request, env);
    if (!auth.ok) return error(auth.status, auth.error);

    const path = new URL(request.url).pathname;
    const matches = ROUTES.map(r => ({ r, m: r.pattern.exec(path) })).filter(x => x.m);
    if (!matches.length) return error(404, 'not found');
    const hit = matches.find(x => x.r.method === request.method);
    if (!hit) return error(405, 'method not allowed');
    try {
      return await hit.r.handler(request, env, auth.email, hit.m);
    } catch (e) {
      console.error('admin error:', e && e.message);
      return error(500, 'internal error');
    }
  },
};
