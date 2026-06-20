/* PUBLIC API
 *   MYCELA.DB      — bearing array (sourced from window.MYCELA_DB set by bearings_db.js)
 *   MYCELA.DB_MAP  — id → bearing object lookup
 */
(function (ns) {
  ns.DB = window.MYCELA_DB || [];

  // ── Type corrections by designation prefix ──────────────────────────────
  ns.DB.forEach(b => {
    const pn = (b.pn || '').toUpperCase().replace(/\s+/g, '');
    if (/^(6\d{3,4}|16\d{2,3}|60\d{2})/.test(pn))   b.type = 'Deep Groove Ball';
    if (/^7\d{3,4}/.test(pn))                          b.type = 'Angular Contact Ball';
    if (/^(22|23|24)\d{3}/.test(pn))                  b.type = 'Spherical Roller';
    if (/^(51|52|53|54|81|82|29)\d{2,4}/.test(pn))   b.type = 'Thrust Ball';
    if (/^(NA|NK|RNA|NKI|NKS|HK|BK)\d/.test(pn))     b.type = 'Needle Roller';
    if (/^(NU|NJ|NUP|NF|N|NN)\d/.test(pn))           b.type = 'Cylindrical Roller';
    if (/^(292|293|294)\d{2}/.test(pn))               b.type = 'Spherical Roller Thrust';
    if (/^(1[2-9]|2[0-3])\d{2}$/.test(pn))           b.type = 'Self-Aligning Ball';
  });

  // ── Remove impossible dimension records ─────────────────────────────────
  ns.DB = ns.DB.filter(b => {
    const bore = b.bore||0, od = b.od||0, w = b.w||0, cr = b.cr||0;
    if (bore<=0||od<=0||w<=0)              return false;
    if (od<=bore)                           return false;
    if (bore<50  && od>bore*15)            return false;
    if (bore<200 && od>bore*10)            return false;
    if (w>od)                              return false;
    if (bore>100 && cr>0 && cr<bore*0.04) return false;
    return true;
  });

  // ── Build lookup map AFTER filter ───────────────────────────────────────
  ns.DB_MAP = {};
  ns.DB.forEach(b => { ns.DB_MAP[b.id] = b; });

  console.log(`MYCELA DB: ${ns.DB.length} bearings loaded`);
})(window.MYCELA = window.MYCELA || {});