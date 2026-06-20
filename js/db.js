/* PUBLIC API
 *   MYCELA.DB      — bearing array (sourced from window.MYCELA_DB set by bearings_db.js)
 *   MYCELA.DB_MAP  — id → bearing object lookup
 */
(function (ns) {
  ns.DB = window.MYCELA_DB || [];
  ns.DB_MAP = {};
  ns.DB.forEach(b => { ns.DB_MAP[b.id] = b; });

  // Correct type for standard 6xxx DGBB designations (6 + 3–4 digits, optional suffix)
const _DGBB_PN = /^(6\d{3,4}|16\d{2,3})(?:[A-Z\/\-]|$)/i;
ns.DB.forEach(b => { if (_DGBB_PN.test(b.pn)) b.type = 'Deep Groove Ball'; });
ns.DB = ns.DB.filter(b => {
  const bore = b.bore||0, od = b.od||0, w = b.w||0;
  if (bore<=0||od<=0||w<=0) return false;
  if (od<=bore) return false;
  if (bore<50  && od>bore*15) return false;
  if (bore<200 && od>bore*10) return false;
  if (w>od) return false;
  return true;
});

  console.log(`MYCELA DB: ${ns.DB.length} bearings loaded`);
})(window.MYCELA = window.MYCELA || {});
