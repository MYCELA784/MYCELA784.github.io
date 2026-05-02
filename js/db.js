/* PUBLIC API
 *   MYCELA.DB      — bearing array (sourced from window.MYCELA_DB set by bearings_db.js)
 *   MYCELA.DB_MAP  — id → bearing object lookup
 */
(function (ns) {
  ns.DB = window.MYCELA_DB || [];
  ns.DB_MAP = {};
  ns.DB.forEach(b => { ns.DB_MAP[b.id] = b; });
  console.log(`MYCELA DB: ${ns.DB.length} bearings loaded`);
})(window.MYCELA = window.MYCELA || {});
