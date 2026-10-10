'use strict';
/*
 * The one definition of the published catalogue, used by
 * scripts/build-published.js (from bearings_db.js) and the admin Worker's
 * publish step (from the master database).
 *
 *   buildCatalog(rawRows, { fields, prepareDB }) → { count, fields, rows }
 *
 * rawRows    catalogue rows with bearings_db.js field names. Not modified.
 * fields     api/published-fields.json
 * prepareDB  MYCELA.prepareDB from js/db.js: the website's own type
 *            correction and sanity filter.
 *
 * Each published row carries only fields from the allowlist, in allowlist
 * order, and leaves out empty (null) values, so the result is the same
 * whether the rows came from bearings_db.js or from the database.
 */
function buildCatalog(rawRows, opts) {
  const fields = opts.fields;
  const prepared = opts.prepareDB(rawRows.map(r => Object.assign({}, r)));
  const rows = prepared.map(b => {
    const out = {};
    fields.record.forEach(k => { if (b[k] !== undefined && b[k] !== null) out[k] = b[k]; });
    return out;
  });
  const leaked = Object.keys(fields.excluded).filter(k => rows.some(r => k in r));
  if (leaked.length) throw new Error('excluded field(s) in the published catalogue: ' + leaked.join(', '));
  return { count: rows.length, fields: fields.record, rows };
}

module.exports = { buildCatalog };
