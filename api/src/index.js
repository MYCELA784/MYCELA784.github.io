/*
 * MYCELA search API (Cloudflare Worker).
 *
 *   GET /search?q=...  → { results, note, stage, count }
 *   GET /health        → { ok: true }
 *   other paths 404, other methods 405.
 *
 * The published catalogue is read from Workers KV (binding CATALOG, key
 * published/v1) once per Worker instance and kept in memory, so a search
 * never waits on storage. See api/README.md.
 */
import { setCatalog, hasCatalog, runSearch } from './search.js';

const CATALOG_KEY = 'published/v1';
const MAX_Q = 200;
const ORIGINS = ['https://mycela.in', 'https://www.mycela.in'];
const LOCALHOST = /^http:\/\/localhost(:\d{1,5})?$/;

function allowedOrigin(origin) {
  if (!origin) return null;
  return ORIGINS.includes(origin) || LOCALHOST.test(origin) ? origin : null;
}

function json(body, status, origin, extra) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers: Object.assign(headers, extra) });
}

let loading = null;
async function ensureCatalog(env) {
  if (hasCatalog()) return true;
  loading = loading || env.CATALOG.get(CATALOG_KEY, 'json').then(data => {
    loading = null;
    if (data && Array.isArray(data.rows) && data.rows.length) setCatalog(data.rows);
    return hasCatalog();
  }, err => { loading = null; throw err; });
  return loading;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request.headers.get('Origin'));

    if (url.pathname !== '/search' && url.pathname !== '/health') {
      return json({ error: 'not found' }, 404, origin);
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin, { 'Allow': 'GET' });
    }
    if (url.pathname === '/health') return json({ ok: true }, 200, origin);

    const raw = url.searchParams.get('q');
    if (raw == null) return json({ error: 'q is required' }, 400, origin);
    const q = raw.trim();
    if (q.length < 1 || q.length > MAX_Q) {
      return json({ error: `q must be 1 to ${MAX_Q} characters` }, 400, origin);
    }

    if (!(await ensureCatalog(env))) {
      return json({ error: 'catalogue not available' }, 503, origin);
    }
    return json(runSearch(q), 200, origin);
  },
};
