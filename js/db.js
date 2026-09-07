(function (ns) {
  ns.DB = window.MYCELA_DB || [];
  ns.DB.forEach(b => {
    const pn = (b.pn || '').toUpperCase().replace(/\s+/g, '');
    if (/^(6\d{3,4}|16\d{2,3}|60\d{2})/.test(pn))      b.type = 'Deep Groove Ball';
    if (/^7\d{3,4}/.test(pn))                             b.type = 'Angular Contact Ball';
    if (/^(22|23|24)\d{3}/.test(pn))                     b.type = 'Spherical Roller';
    if (/^(30|31|32|33)\d{3,4}/.test(pn))                b.type = 'Tapered Roller';
    if (/^(NU|NJ|NUP|NF|NN)\d/.test(pn))                 b.type = 'Cylindrical Roller';
    if (/^(NA|NK|RNA|NKI|NKIS|NKS|HK|BK)\d/.test(pn))   b.type = 'Needle Roller';
    if (/^29[2-4]\d{2}/.test(pn))                        b.type = 'Spherical Roller Thrust';
    if (/^(511|512|513|514|81|82)\d{2,3}/.test(pn))      b.type = 'Thrust Ball';
    if (/^(1[23]|2[23])\d{2}$/.test(pn))                 b.type = 'Self-Aligning Ball';
    if (/^C\d{4}/.test(pn))                               b.type = 'CARB Toroidal Roller';
  });
  ns.DB = ns.DB.filter(b => {
    const bore=b.bore||0, od=b.od||0, w=b.w||0, cr=b.cr||0;
    const pn=(b.pn||'').trim();
    if (bore<=0||od<=0||w<=0)                             return false;
    if (od<=bore)                                         return false;
    if (bore<50  && od>bore*15)                           return false;
    if (bore<200 && od>bore*10)                           return false;
    if (w>od)                                             return false;
    if (w<1 && bore>5)                                    return false;
    if (/^\d+\.\d+$/.test(pn))                              return false;
    if (cr>0 && cr<0.1 && bore>10)                        return false;
    if (bore>=20  && bore<50  && cr>0 && cr<0.5)         return false;
    if (bore>=50  && bore<100 && cr>0 && cr<bore*0.05)   return false;
    if (bore>=100 && bore<300 && cr>0 && cr<bore*0.04)   return false;
    if (bore>=300 &&             cr>0 && cr<bore*0.05)   return false;
    return true;
  });
  // Build the id->record map, and assert id uniqueness while doing it.
  // bearings_db.js has carried the same id on two different rows before
  // (Q6, docs/data-quarantine.md); DB_MAP silently keeps the last, so a
  // repeat is invisible unless we look. Under ?debug=1, name both records.
  const DEBUG = (function () {
    try { return new URLSearchParams(location.search).get('debug') === '1'; }
    catch (e) { return false; }
  })();
  ns.DB_MAP = {};
  const dupes = {};
  ns.DB.forEach(b => {
    if (Object.prototype.hasOwnProperty.call(ns.DB_MAP, b.id)) {
      (dupes[b.id] = dupes[b.id] || [ns.DB_MAP[b.id]]).push(b);
    }
    ns.DB_MAP[b.id] = b;
  });
  const dupIds = Object.keys(dupes);
  if (dupIds.length && DEBUG) {
    console.warn(`MYCELA DB: ${dupIds.length} duplicate id(s) — DB_MAP keeps the last of each:`);
    dupIds.forEach(id => {
      const rows = dupes[id].map(r => `{pn:${JSON.stringify(r.pn)} ${r.type} ${r.bore}x${r.od}x${r.w}}`).join('  vs  ');
      console.warn(`  ${id}: ${dupes[id].length} rows — ${rows}`);
    });
  }
  console.log(`MYCELA DB: ${ns.DB.length} bearings loaded`);
})(window.MYCELA = window.MYCELA || {});
