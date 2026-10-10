#!/usr/bin/env node
'use strict';
/*
 * Phone layout: at 360 px and 390 px wide no page scrolls sideways and no
 * text is cut off.
 *
 *   node tests/phone-layout.js       (run `npm install` in api/ once first)
 *
 * Opens the built website (dist/, as scripts/build-site.js makes it) in a
 * real headless browser, Chrome or Edge, whichever is installed, and looks
 * at twelve views at each width: home, search results, the details modal,
 * the list, about, dealers and contact, plus the empty state, the load
 * calculator, compare, find by size and the enquiry form. Searches are answered by the real
 * search Worker (tests/api-harness.js); nothing listens on port 8787, the
 * page's requests to it are answered inside the browser session.
 *
 * For each view:
 *   - document.documentElement.scrollWidth <= window.innerWidth
 *   - nothing visible sticks out past the left or right edge of the screen
 *   - no box hides part of its own text (overflow hidden and too narrow)
 *   - the modal and the open sheet do not scroll sideways inside themselves
 *   - on the home page, the search box placeholder fits in the box
 *
 * A screenshot of every view is saved to screenshots/phone/ (git-ignored).
 * Set CHROME_PATH to use a particular browser. No npm package is needed: the
 * browser is driven over its DevTools socket with Node's own WebSocket.
 */
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const H = require('./api-harness.js');
const { build } = require('../scripts/build-site.js');

const SHOTS = path.join(H.ROOT, 'screenshots', 'phone');
const WIDTHS = [360, 390];
const HEIGHT = 780;
const API_ORIGIN = 'http://localhost:8787';
const QUERY = '6205';

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}

function findBrowser() {
  const env = process.env;
  const list = [
    env.CHROME_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return list.find(p => p && fs.existsSync(p)) || null;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
function siteServer(root) {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 not found\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

// ── the browser, over its DevTools socket ────────────────────────────────
async function launch(exe, profile) {
  const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
                            '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) {
    if (child.exitCode !== null) throw new Error('the browser stopped while starting');
    await new Promise(r => setTimeout(r, 100));
  }
  if (!fs.existsSync(portFile)) throw new Error('the browser did not start within 15 seconds');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not connect to the browser')); });

  let seq = 0;
  const waiting = new Map();
  const listeners = {};
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result);
    } else if (m.method && listeners[m.method]) listeners[m.method](m.params);
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  return { child, send, on: (method, fn) => { listeners[method] = fn; }, close: () => ws.close() };
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

// Runs in the page. Returns what is wrong with the layout, as plain lists.
function measure() {
  const vw = window.innerWidth;
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const out = { innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, outside: [], cut: [], inner: [], placeholder: null };
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('.sheet:not(.on)') || el.closest('.hp') || el.closest('svg') || el.closest('[hidden]')) return;
    // the compare table is meant to scroll sideways inside its own box
    const scroller = el.closest('#modal-compare');
    if (scroller && el !== scroller) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.right > vw + 0.5 || r.left < -0.5) out.outside.push(`${name(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    const hides = /hidden|clip/.test(cs.overflowX);
    const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (hides && ownText && el.scrollWidth > el.clientWidth + 1) out.cut.push(`${name(el)} needs ${el.scrollWidth}, has ${el.clientWidth}`);
  });
  document.querySelectorAll('.modal-overlay.open .modal, .sheet.on, .sheet.on .sh-body').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1) out.inner.push(`${name(el)} needs ${el.scrollWidth}, has ${el.clientWidth}`);
  });
  const q = document.getElementById('q');
  if (q && q.getBoundingClientRect().width) {
    const ph = getComputedStyle(q, '::placeholder');
    const probe = document.createElement('span');
    probe.textContent = q.placeholder;
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${ph.font};letter-spacing:${ph.letterSpacing}`;
    document.body.appendChild(probe);
    out.placeholder = { needs: Math.ceil(probe.getBoundingClientRect().width), has: q.clientWidth };
    probe.remove();
  }
  return out;
}

(async () => {
  const exe = findBrowser();
  if (!exe) {
    console.error('No Chrome or Edge found. Install one, or set CHROME_PATH to the browser to use.');
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mycela-phone-'));
  const dist = path.join(tmp, 'dist');
  build(dist);
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const api = await H.start();
  const server = siteServer(fs.realpathSync(dist));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const site = `http://localhost:${server.address().port}`;
  let browser;

  try {
    browser = await launch(exe, path.join(tmp, 'profile'));
    const { send, on } = browser;
    await send('Page.enable');
    await send('Runtime.enable');

    // The page's requests to the search API never leave the browser session:
    // each one is answered by the Worker in the harness.
    const apiCalls = [];
    on('Fetch.requestPaused', async p => {
      try {
        // Anything else the page would send out (the gap log, the enquiry
        // form) is stopped here: a test run reports nothing to anyone.
        if (!p.request.url.startsWith(API_ORIGIN + '/')) {
          await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' });
          return;
        }
        const rel = p.request.url.slice(API_ORIGIN.length);
        apiCalls.push(rel);
        const res = await api.get(rel, { method: p.request.method, headers: { Origin: site } });
        const body = Buffer.from(await res.arrayBuffer()).toString('base64');
        const headers = [];
        res.headers.forEach((value, name) => headers.push({ name, value }));
        await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: res.status, responseHeaders: headers, body });
      } catch (e) {
        await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }).catch(() => {});
      }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: API_ORIGIN + '/*' }, { urlPattern: 'https://script.google.com/*' }, { urlPattern: 'https://dns.google/*' }] });

    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('in the page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const until = async (expr, what) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`!!(${expr})`)) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('timed out waiting for ' + what);
    };
    const open = async (file) => {
      await send('Page.navigate', { url: `${site}/${file}` });
      await until(`document.readyState === 'complete' && location.pathname.endsWith('${file}')`, file);
      await evaluate(`document.fonts.ready.then(() => true)`);
    };
    const settle = () => new Promise(r => setTimeout(r, 400));   // sheet and scrim transitions
    const shot = async (file, wholePage) => {
      const params = { format: 'png' };
      if (wholePage) {
        const m = await send('Page.getLayoutMetrics');
        params.captureBeyondViewport = true;
        params.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
      }
      const r = await send('Page.captureScreenshot', params);
      fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
    };

    // Each view: how to get there from a freshly opened page.
    const VIEWS = [
      { name: 'home', file: 'index.html', whole: true },
      { name: 'search', file: 'index.html', whole: true, go: async () => {
        await evaluate(`(() => { const q = document.getElementById('q'); q.value = ${JSON.stringify(QUERY)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await until(`document.querySelector('#grid .item')`, 'search results');
        await evaluate(`document.getElementById('results').scrollIntoView({ behavior: 'instant' })`);
      } },
      { name: 'modal', file: 'index.html', go: async () => {
        await VIEWS[1].go();
        await evaluate(`document.querySelector('#grid [data-info]').click()`);
        await until(`document.querySelector('.modal-overlay.open') && document.getElementById('modal-xref').children.length`, 'the details modal and its same-size list');
      } },
      { name: 'list', file: 'index.html', go: async () => {
        await VIEWS[1].go();
        await evaluate(`Array.from(document.querySelectorAll('#grid [data-add]')).slice(0, 3).forEach(b => b.click())`);
        await evaluate(`document.getElementById('openBasket').click()`);
        await until(`document.querySelector('#basket.on') && document.querySelector('#bBody .brow')`, 'the list');
        await settle();
      } },
      { name: 'about', file: 'about.html', whole: true },
      // not asked for one by one, but each is a place a phone can overflow
      { name: 'no-results', file: 'index.html', go: async () => {
        await evaluate(`(() => { const q = document.getElementById('q'); q.value = 'zzqqxx'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await until(`document.querySelector('#grid .blank')`, 'the empty state');
        await evaluate(`document.getElementById('results').scrollIntoView({ behavior: 'instant' })`);
      } },
      { name: 'modal-calculator', file: 'index.html', go: async () => {
        await VIEWS[2].go();
        await evaluate(`(() => { document.querySelector('.calc').open = true; document.getElementById('calc-fr').value = '2.65';
          document.getElementById('calc-n').value = '1450'; document.getElementById('calc-run').click();
          document.querySelector('.calc').scrollIntoView({ behavior: 'instant' }); })()`);
        await until(`document.querySelector('#calc-out .calc-big')`, 'the calculator result');
      } },
      { name: 'compare', file: 'index.html', go: async () => {
        await VIEWS[1].go();
        await evaluate(`Array.from(document.querySelectorAll('#grid .cmp-chk')).slice(0, 4).forEach(c => c.click())`);
        await evaluate(`document.getElementById('compareBtn').click()`);
        await until(`document.querySelector('#modal-compare.open table')`, 'the compare table');
      } },
      { name: 'find-by-size', file: 'index.html', go: async () => {
        await evaluate(`document.getElementById('openSize').click()`);
        await until(`document.querySelector('#size.on')`, 'the size sheet');
        await settle();
      } },
      { name: 'enquiry-form', file: 'index.html', go: async () => {
        await VIEWS[3].go();
        await evaluate(`document.getElementById('sendBtn').click()`);
        await until(`document.getElementById('inquiryForm')`, 'the enquiry form');
      } },
      { name: 'dealers', file: 'dealers.html', whole: true },
      { name: 'contact', file: 'contact.html', whole: true },
    ];

    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
      for (const v of VIEWS) {
        const label = `${width} px, ${v.name}`;
        try {
          await open(v.file);
          await evaluate(`localStorage.clear()`);
          if (v.go) { await open(v.file); await v.go(); }
          const m = await evaluate(`(${measure.toString()})()`);
          await shot(`${width}-${v.name}.png`, false);
          if (v.whole) await shot(`${width}-${v.name}-whole-page.png`, true);
          ok(m.innerWidth === width, `${label}: the screen is ${width} px wide (innerWidth ${m.innerWidth})`);
          ok(m.scrollWidth <= m.innerWidth, `${label}: no sideways scrolling (scrollWidth ${m.scrollWidth}, innerWidth ${m.innerWidth})`);
          ok(!m.outside.length, `${label}: nothing sticks out past the screen edge${m.outside.length ? ': ' + m.outside.slice(0, 6).join('; ') : ''}`);
          ok(!m.cut.length, `${label}: no text is cut off${m.cut.length ? ': ' + m.cut.slice(0, 6).join('; ') : ''}`);
          ok(!m.inner.length, `${label}: the open panel does not scroll sideways${m.inner.length ? ': ' + m.inner.join('; ') : ''}`);
          if (v.name === 'home') {
            ok(m.placeholder && m.placeholder.needs <= m.placeholder.has,
               `${label}: the search placeholder fits (needs ${m.placeholder && m.placeholder.needs} px, box has ${m.placeholder && m.placeholder.has} px)`);
          }
        } catch (e) {
          ok(false, `${label}: ${e.message}`);
        }
      }
    }
    ok(apiCalls.some(c => c.startsWith('/search?q=' + QUERY)), 'the searches were answered by the search Worker');
  } catch (e) {
    ok(false, e.message);
  } finally {
    if (browser) { browser.close(); stop(browser.child); }
    server.close();
    await api.stop();
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the browser may still hold its profile */ }
  }

  console.log(`\nScreenshots: ${SHOTS}`);
  console.log(failures ? `${failures} FAILED` : 'All phone layout checks passed');
  process.exit(failures ? 1 : 0);
})();
