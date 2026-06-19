/* PUBLIC API
 *   MYCELA.DB      — bearing array (sourced from window.MYCELA_DB set by bearings_db.js)
 *   MYCELA.DB_MAP  — id → bearing object lookup
 */
(function (ns) {
  ns.DB = window.MYCELA_DB || [];
  ns.DB_MAP = {};
  ns.DB.forEach(b => { ns.DB_MAP[b.id] = b; });

  // Correct type for standard 6xxx DGBB designations (6 + 3–4 digits, optional suffix)
  const _DGBB_PN = /^6\d{3,4}(?:[A-Z\/\-]|$)/i;
  ns.DB.forEach(b => { if (_DGBB_PN.test(b.pn)) b.type = 'Deep Groove Ball'; });

  console.log(`MYCELA DB: ${ns.DB.length} bearings loaded`);
})(window.MYCELA = window.MYCELA || {});
