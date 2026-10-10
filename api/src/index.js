/*
 * MYCELA search API (Cloudflare Worker).
 *
 *   GET /search?q=...     → { results, note, stage, count }
 *   GET /parts?ids=a,b,c  → { parts, count }  the published rows for up to
 *                           50 ids; an id not in the catalogue is left out
 *   GET /stats            → { count }  parts in the published catalogue
 *   GET /health           → { ok: true }
 *   other paths 404, other methods 405.
 *   /search, /parts and /stats share one rate limit per visitor IP (binding
 *   SEARCH_LIMITER, wrangler.toml): over the limit → 429.
 *
 * The published catalogue is read from Workers KV (binding CATALOG): the
 * key named by published/current, kept in memory per Worker instance and
 * re-checked at most once a minute, so a search never waits on storage.
 * This Worker only reads KV and has no database binding. See api/README.md.
 */
import { setCatalog, hasCatalog, runSearch, getParts, catalogCount } from './search.js';

const POINTER_KEY = 'published/current';
const MAX_Q = 200;
const MAX_IDS = 50;
// The id rule of the master database (admin/src/validate.js).
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,63}$/;
const PATHS = ['/search', '/parts', '/stats', '/health'];
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

// One counter per visitor IP. Fails open: if the limiter is missing or
// errors, the search still runs rather than the API going down with it.
async function overLimit(request, env) {
  if (!env.SEARCH_LIMITER) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const { success } = await env.SEARCH_LIMITER.limit({ key: ip });
    return !success;
  } catch (e) {
    return false;
  }
}

// The published catalogue lives in KV under published/v<N>, and
// published/current holds the key of the live one. Each Worker instance
// keeps the catalogue in memory and re-reads the pointer at most once a
// minute, so a publish or rollback goes live within a minute (plus however
// long KV takes to spread the new pointer) without a redeploy. If KV cannot
// be read, the instance keeps serving the version it already has.
const RECHECK_MS = 60 * 1000;
const VERSION_KEY = /^published\/v[1-9]\d{0,8}$/;
let live = { key: null, checkedAt: 0 };
let refreshing = null;

async function refreshCatalog(env) {
  const key = await env.CATALOG.get(POINTER_KEY);
  if (!key || !VERSION_KEY.test(key)) return;
  if (key === live.key && hasCatalog()) return;
  const data = await env.CATALOG.get(key, 'json');
  if (data && Array.isArray(data.rows) && data.rows.length) {
    setCatalog(data.rows);
    live.key = key;
  }
}

async function ensureCatalog(env) {
  if (hasCatalog() && Date.now() - live.checkedAt < RECHECK_MS) return true;
  // Once a catalogue is loaded, the next check is a minute away whatever
  // this one found, so a KV problem does not mean a KV read per request.
  refreshing = refreshing || refreshCatalog(env).catch(() => {}).finally(() => {
    refreshing = null;
    if (hasCatalog()) live.checkedAt = Date.now();
  });
  await refreshing;
  return hasCatalog();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request.headers.get('Origin'));

    if (!PATHS.includes(url.pathname)) {
      return json({ error: 'not found' }, 404, origin);
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin, { 'Allow': 'GET' });
    }
    if (url.pathname === '/health') return json({ ok: true }, 200, origin);

    if (await overLimit(request, env)) {
      return json({ error: 'too many requests, try again in a minute' }, 429, origin, { 'Retry-After': '60' });
    }

    if (url.pathname === '/stats') {
      if (!(await ensureCatalog(env))) return json({ error: 'catalogue not available' }, 503, origin);
      return json({ count: catalogCount() }, 200, origin);
    }

    if (url.pathname === '/parts') {
      const rawIds = url.searchParams.get('ids');
      if (rawIds == null || rawIds === '') return json({ error: 'ids is required' }, 400, origin);
      const ids = rawIds.split(',');
      if (ids.length > MAX_IDS) return json({ error: `at most ${MAX_IDS} ids` }, 400, origin);
      if (!ids.every(id => ID_PATTERN.test(id))) return json({ error: 'ids must be part ids separated by commas' }, 400, origin);
      if (!(await ensureCatalog(env))) return json({ error: 'catalogue not available' }, 503, origin);
      const parts = getParts(ids);
      return json({ parts, count: parts.length }, 200, origin);
    }

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
