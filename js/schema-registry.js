/* PUBLIC API
 *   MYCELA.Schemas — category schemas loaded from schemas/*.json
 *
 *     .byCategory        { <category>: schema }   raw parsed JSON, keyed by schema.category
 *     .list              [<category>, ...]        load order
 *     .get(category)     → schema | undefined
 *     .primary()         → first loaded schema (the site currently ships one: "bearing")
 *     .ingest(schema)    → register a schema object (used by the Node test harness)
 *     .<category>        convenience alias, e.g. MYCELA.Schemas.bearing
 *
 * The schema is the single source of truth for query vocabulary: brand,
 * sealing, type and clearance terms, field aliases, unit words and the
 * query modifiers. parsers.js / scoring.js read from here — nothing about
 * a specific bearing family is hardcoded in js/. Adding a category is a
 * data edit: drop a <name>.schema.json in schemas/ and list it in
 * schemas/index.json.
 *
 * Load order: this file must evaluate BEFORE js/search/parsers.js.
 * In the browser it does a synchronous same-origin fetch so MYCELA.Schemas
 * is fully populated by the time parsers.js runs. In Node it reads the
 * files straight off disk.
 */
(function (ns) {
  ns.Schemas = ns.Schemas || {};
  var store = ns.Schemas;
  store.byCategory = store.byCategory || {};
  store.list = store.list || [];

  function ingest(schema, fallbackName) {
    if (!schema || typeof schema !== 'object') return;
    var cat = schema.category || fallbackName;
    if (!cat) return;
    store.byCategory[cat] = schema;
    if (store.list.indexOf(cat) === -1) store.list.push(cat);
    store[cat] = schema;
  }
  store.ingest = function (schema) { ingest(schema); };
  store.get = function (cat) { return store.byCategory[cat]; };
  store.primary = function () { return store.byCategory[store.list[0]]; };

  var MANIFEST = 'index.json';

  // ── Browser: synchronous same-origin load ────────────────────────────────
  if (typeof XMLHttpRequest !== 'undefined') {
    var read = function (url) {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send(null);
      if (x.status >= 400) throw new Error(url + ' -> HTTP ' + x.status);
      return JSON.parse(x.responseText);
    };
    var base = 'schemas/';
    var names = [];
    try {
      names = read(base + MANIFEST).schemas || [];
    } catch (e) {
      try { console.warn('MYCELA.Schemas: cannot read ' + base + MANIFEST, e); } catch (_) {}
    }
    names.forEach(function (n) {
      try {
        ingest(read(base + n + '.schema.json'), n);
      } catch (e) {
        try { console.warn('MYCELA.Schemas: cannot load schema "' + n + '"', e); } catch (_) {}
      }
    });
    return;
  }

  // ── Node (tests / scripts): read from disk ───────────────────────────────
  try {
    var fs = require('fs');
    var path = require('path');
    var dir = path.join(__dirname, '..', 'schemas');
    var manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'));
    (manifest.schemas || []).forEach(function (n) {
      ingest(JSON.parse(fs.readFileSync(path.join(dir, n + '.schema.json'), 'utf8')), n);
    });
  } catch (e) {
    // No fs or no files reachable — caller can still MYCELA.Schemas.ingest(obj).
  }
})(window.MYCELA = window.MYCELA || {});
