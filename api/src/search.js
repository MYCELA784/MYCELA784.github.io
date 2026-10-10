/*
 * PUBLIC API
 *   setCatalog(rows)  install the published catalogue as MYCELA.DB / DB_MAP
 *   hasCatalog()      true once setCatalog() has run
 *   runSearch(q)      → { results, note, stage, count }
 *   getParts(ids)     → the published rows for those ids, in the order asked
 *   catalogCount()    → how many parts the published catalogue holds
 *
 * Adapter only: the search itself is the website's own code in js/ and
 * schemas/, imported here unchanged, in the same order as index.html.
 * Nothing in this file ranks or filters bearings.
 *
 * Differences from the browser, all outside the search logic:
 * - schemas/bearing.schema.json is imported and handed to
 *   MYCELA.Schemas.ingest(); the browser loads it with a synchronous XHR.
 * - bearings_db.js and js/db.js are not loaded here. The published
 *   catalogue (scripts/build-published.js) is MYCELA.DB after js/db.js has
 *   already normalised and filtered it, so the rows are the same.
 */
import './globals.js';
import '../../js/config.js';
import '../../js/constants.js';
import '../../js/schema-registry.js';
import '../../js/search/parsers.js';
import '../../js/search/rules.js';
import '../../js/search/scoring.js';
import '../../js/search/fallback.js';
import '../../js/search/engine.js';
import bearingSchema from '../../schemas/bearing.schema.json' with { type: 'json' };
import FIELDS from '../published-fields.json' with { type: 'json' };

const NS = globalThis.MYCELA;
if (!NS.Schemas.get('bearing')) NS.Schemas.ingest(bearingSchema);

export const MAX_RESULTS = 40;
const ALLOWED = FIELDS.record.concat(FIELDS.result);

export function setCatalog(rows) {
  NS.DB = rows;
  NS.DB_MAP = {};
  rows.forEach(b => { NS.DB_MAP[b.id] = b; });
}

export function hasCatalog() { return Array.isArray(NS.DB) && NS.DB.length > 0; }

// Copy only allowlisted fields, in allowlist order. Anything else on the
// row (ranking internals, a field added to the data later) is dropped here.
function publish(b) {
  const out = {};
  ALLOWED.forEach(k => { if (b[k] !== undefined) out[k] = b[k]; });
  return out;
}

// Same steps as doSearch() in js/app.js: exact search, and the fallback
// only when exact search finds nothing.
// stage: "exact" when exact search answered; otherwise the fallback's own
// stage (1 to 4 relaxed into results, 0 a size or type with nothing near
// it, null nothing parsable), as in js/search/fallback.js.
export function runSearch(q) {
  let hits = NS.SearchEngine.fast(q);
  let note = null;
  let stage = 'exact';
  if (hits.length === 0) {
    const fb = NS.SearchEngine.fallback(q);
    hits = fb.results;
    note = fb.note;
    stage = fb.stage;
  }
  const results = hits.slice(0, MAX_RESULTS).map(publish);
  return { results, note, stage, count: results.length };
}

// The published rows for these ids, in the order asked, each once. An id
// that is not in the catalogue is simply left out.
export function getParts(ids) {
  const seen = new Set();
  const out = [];
  ids.forEach(id => {
    if (seen.has(id)) return;
    seen.add(id);
    if (Object.prototype.hasOwnProperty.call(NS.DB_MAP, id)) out.push(publish(NS.DB_MAP[id]));
  });
  return out;
}

export function catalogCount() { return hasCatalog() ? NS.DB.length : 0; }
