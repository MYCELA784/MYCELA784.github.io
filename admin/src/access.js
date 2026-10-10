/*
 * Cloudflare Access check for every admin request.
 *
 *   verifyAccess(request, env) → { ok: true, email } | { ok: false, status, error }
 *
 * Access puts a signed token (JWT) in the Cf-Access-Jwt-Assertion header of
 * each request it lets through. The token must be:
 * - signed with RS256 by one of the team's current keys, fetched from
 *   https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs;
 * - issued by https://<ACCESS_TEAM_DOMAIN>;
 * - for this application (ACCESS_AUD in its "aud");
 * - not expired; and
 * - for a person (an "email" claim, which becomes the audit actor).
 *
 * There is no way to switch this off. If ACCESS_TEAM_DOMAIN or ACCESS_AUD is
 * missing, every request is refused. Tests sign tokens with their own key
 * and serve that key at the certs address; the code path is the same.
 */
const LEEWAY_S = 30;
const KEYS_TTL_MS = 60 * 60 * 1000;
const KEYS_REFETCH_MS = 60 * 1000;
const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

let keyCache = { team: null, keys: [], fetchedAt: 0 };

const fail = (status, error) => ({ ok: false, status, error });

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function teamKeys(team, force) {
  const now = Date.now();
  const fresh = keyCache.team === team && now - keyCache.fetchedAt < (force ? KEYS_REFETCH_MS : KEYS_TTL_MS);
  if (fresh) return keyCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const body = await res.json();
  keyCache = { team, keys: Array.isArray(body.keys) ? body.keys : [], fetchedAt: now };
  return keyCache.keys;
}

export async function verifyAccess(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').trim().toLowerCase();
  const aud = String(env.ACCESS_AUD || '').trim();
  if (!TEAM_DOMAIN.test(team) || !aud) return fail(500, 'admin access is not configured');

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return fail(401, 'sign in through Cloudflare Access');
  const parts = token.split('.');
  if (parts.length !== 3) return fail(401, 'invalid access token');

  let header, claims, signature;
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
    signature = b64urlBytes(parts[2]);
  } catch (e) {
    return fail(401, 'invalid access token');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return fail(401, 'invalid access token');

  let jwk;
  try {
    jwk = (await teamKeys(team, false)).find(k => k.kid === header.kid);
    if (!jwk) jwk = (await teamKeys(team, true)).find(k => k.kid === header.kid);
  } catch (e) {
    return fail(503, 'cannot check access right now');
  }
  if (!jwk) return fail(401, 'invalid access token');

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch (e) {
    valid = false;
  }
  if (!valid) return fail(401, 'invalid access token');

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_S < now) return fail(401, 'access token expired');
  if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY_S > now) return fail(401, 'access token not valid yet');
  if (claims.iss !== `https://${team}`) return fail(403, 'access token is for another team');
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return fail(403, 'access token is for another application');
  if (typeof claims.email !== 'string' || !claims.email.includes('@')) return fail(403, 'access token has no user email');
  return { ok: true, email: claims.email.toLowerCase() };
}

// Tests only: forget fetched keys between cases.
export function _resetKeyCache() { keyCache = { team: null, keys: [], fetchedAt: 0 }; }
