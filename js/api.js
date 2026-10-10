/* PUBLIC API
 *   MYCELA.Api.search(q, { signal })  → Promise<{ results, note, stage, count }>
 *   MYCELA.Api.cached(q)              → that answer if this page already has it
 *   MYCELA.Api.parts(ids)             → Promise<void>, after which known(id)
 *                                       answers for every id the API has
 *   MYCELA.Api.stats()                → Promise<{ count }>
 *   MYCELA.Api.known(id)              → the part, if this page has seen it
 *   MYCELA.Api.missing(id)            → true if the API said it has no such part
 *   MYCELA.Api.remember(rows)         → add parts to what the page has seen
 *   MYCELA.Api.message(error)         → { title, text } to show a visitor
 *
 * The browser no longer holds the catalogue. It asks the search API
 * (CONFIG.api.baseUrl, see api/README.md) and keeps only the parts it has
 * been sent: search results and /parts lookups. Everything on the page that
 * needs a part by id (details, compare, calculator, list) reads known().
 *
 * A failed request rejects with an Error whose .kind is 'rate' (429),
 * 'unreachable' (no answer, timeout, 5xx) or 'refused' (4xx). A request
 * cancelled through its signal rejects with the browser's AbortError.
 */
(function (ns) {
  const CFG = () => ns.CONFIG.api;
  const MAX_IDS = 50;
  const MAX_CACHED_SEARCHES = 200;
  // The id rule of the API (api/src/index.js). Anything else is never sent.
  const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,63}$/;

  const seen = new Map();       // id → part
  const absent = new Set();     // ids the API answered it does not have
  const searches = new Map();   // query → answer
  let statsPromise = null;

  function fail(kind, status) {
    const e = new Error('search API: ' + kind + (status ? ' (' + status + ')' : ''));
    e.kind = kind;
    e.status = status || 0;
    return e;
  }

  // GET a JSON answer. `signal` cancels it from outside; the timeout cancels
  // it from inside and counts as unreachable.
  function get(pathAndQuery, signal) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, CFG().timeoutMs);
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', onAbort);
    }
    return fetch(CFG().baseUrl + pathAndQuery, { signal: ctrl.signal })
      .then(res => {
        if (res.status === 429) throw fail('rate', 429);
        if (res.status >= 500) throw fail('unreachable', res.status);
        if (!res.ok) throw fail('refused', res.status);
        return res.json();
      }, e => {
        if (e && e.name === 'AbortError' && !timedOut) throw e;
        throw fail('unreachable');
      })
      .finally(() => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      });
  }

  function remember(rows) {
    (rows || []).forEach(b => {
      if (!b || typeof b.id !== 'string') return;
      // A search result carries per-search flags (_designationOnly ...);
      // keep the plain part, so a flag from one search never shows in another.
      const part = {};
      Object.keys(b).forEach(k => { if (k.charAt(0) !== '_') part[k] = b[k]; });
      seen.set(b.id, part);
      absent.delete(b.id);
    });
  }

  function search(q, opts) {
    if (searches.has(q)) return Promise.resolve(searches.get(q));
    return get('/search?q=' + encodeURIComponent(q), opts && opts.signal).then(body => {
      const answer = {
        results: Array.isArray(body.results) ? body.results : [],
        note: body.note == null ? null : String(body.note),
        stage: body.stage === undefined ? null : body.stage,
      };
      answer.count = answer.results.length;
      remember(answer.results);
      if (searches.size >= MAX_CACHED_SEARCHES) searches.delete(searches.keys().next().value);
      searches.set(q, answer);
      return answer;
    });
  }

  function parts(ids) {
    const want = [...new Set(ids)].filter(id => typeof id === 'string' && !seen.has(id) && !absent.has(id));
    want.filter(id => !ID_PATTERN.test(id)).forEach(id => absent.add(id));
    const ask = want.filter(id => ID_PATTERN.test(id));
    const chunks = [];
    for (let i = 0; i < ask.length; i += MAX_IDS) chunks.push(ask.slice(i, i + MAX_IDS));
    return Promise.all(chunks.map(chunk =>
      get('/parts?ids=' + chunk.map(encodeURIComponent).join(',')).then(body => {
        remember(body.parts);
        chunk.forEach(id => { if (!seen.has(id)) absent.add(id); });
      }))).then(() => {});
  }

  function stats() {
    if (!statsPromise) {
      statsPromise = get('/stats').then(body => ({ count: Number(body.count) || 0 }));
      statsPromise.catch(() => { statsPromise = null; });
    }
    return statsPromise;
  }

  function message(e) {
    if (e && e.kind === 'rate') {
      return { title: 'Too many searches in a short time',
               text: 'Please wait a minute, then try again.' };
    }
    return { title: 'Search is not available right now',
             text: 'We could not reach the catalogue. Check your connection and try again in a moment.' };
  }

  ns.Api = {
    search, parts, stats, remember, message,
    cached: q => searches.get(q) || null,
    known: id => seen.get(id),
    missing: id => absent.has(id),
  };
})(window.MYCELA = window.MYCELA || {});
