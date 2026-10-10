#!/usr/bin/env node
'use strict';
/*
 * Local preview of the website as it will be published.
 *
 *   node scripts/preview.js
 *
 * 1. Builds dist/ (scripts/build-site.js): the public files only.
 * 2. Makes sure there is a local published catalogue for the search API. If
 *    you have published one from the master database it is used as it is;
 *    if there is none yet, one is built from bearings_db.js
 *    (scripts/build-published.js).
 * 3. Starts the search API on http://localhost:8787 (wrangler dev, local).
 * 4. Serves dist/ on http://localhost:8080.
 *
 * Open http://localhost:8080 and search. Press Ctrl+C here to stop both.
 * Everything runs on this computer: no Cloudflare login, nothing uploaded.
 * Needs `npm install` in api/ once. See docs/local-preview.md.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { build } = require('./build-site.js');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');
const DIST = path.join(ROOT, 'dist');
const STATE = path.join(ROOT, 'admin', '.wrangler', 'state');
const WRANGLER = path.join(API, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const SITE_PORT = 8080;
const API_PORT = 8787;
const ENV = Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

// Serves files that are in dist/ and nothing else. Anything not there is 404.
function siteServer() {
  const root = fs.realpathSync(DIST);
  return http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { rel = null; }
    if (rel === '/') rel = '/index.html';
    const file = rel === null ? null : path.join(root, rel);
    const inside = file && (file === root || file.startsWith(root + path.sep));
    if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile() || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 not found\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}

function hasLocalCatalogue() {
  const r = spawnSync(process.execPath, [WRANGLER, 'kv', 'key', 'get', 'published/current', '--binding', 'CATALOG', '--local',
                                         '--persist-to', STATE, '--text'], { cwd: API, encoding: 'utf8', env: ENV });
  return r.status === 0 && /published\/v\d+/.test(r.stdout || '');
}

async function waitForApi(child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('the search API stopped while starting (see its output above)');
    try {
      const r = await fetch(`http://localhost:${API_PORT}/health`);
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('the search API did not start within a minute');
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  // wrangler starts its own child process; on Windows take the whole tree.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function main() {
  if (!fs.existsSync(WRANGLER)) throw new Error('api/node_modules is missing: run `npm install` in api/ first.');

  const built = build(DIST);
  console.log(`1/4  Built dist/: ${built.files.length} public files, ${(built.bytes / 1024).toFixed(0)} KB`);

  if (hasLocalCatalogue()) {
    console.log('2/4  Using the local published catalogue that is already there');
  } else {
    console.log('2/4  No local published catalogue yet: building one from bearings_db.js');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-published.js')], { cwd: ROOT, stdio: 'inherit', env: ENV });
    if (r.status !== 0) throw new Error('could not build the local published catalogue');
  }

  console.log(`3/4  Starting the search API on http://localhost:${API_PORT} ...`);
  const api = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(API_PORT), '--persist-to', STATE],
                    { cwd: API, env: ENV, stdio: ['ignore', 'inherit', 'inherit'] });
  const server = siteServer();
  let stopping = false;
  const shutdown = code => {
    if (stopping) return;
    stopping = true;
    server.close();
    stop(api);
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  api.on('exit', () => { if (!stopping) { console.error('The search API stopped.'); shutdown(1); } });

  try {
    await waitForApi(api);
    const count = (await (await fetch(`http://localhost:${API_PORT}/stats`)).json()).count;
    console.log(`     The search API is answering: ${Number(count).toLocaleString()} parts in the catalogue`);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(SITE_PORT, resolve); });
  } catch (e) {
    console.error(e.code === 'EADDRINUSE' ? `Port ${SITE_PORT} is already in use. Close whatever is using it and try again.` : e.message);
    shutdown(1);
    return;
  }
  console.log(`4/4  Serving dist/ on http://localhost:${SITE_PORT}`);
  console.log(`\nOpen http://localhost:${SITE_PORT} in your browser and try a search.\nPress Ctrl+C to stop.\n`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
