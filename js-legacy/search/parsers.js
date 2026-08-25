/* PUBLIC API (consumed by engine.js via MYCELA.SearchEngine.parse)
 *   MYCELA.SearchEngine.parse(raw)
 *     → { tokens, bore, od, od_min, od_max, width, rpm, cr_min, c0r_min,
 *          type, brand, sealing, typeHints[], apps[], envNotes[], rawQ }
 *
 * Bug fixes vs. original:
 *   - Compact "15x32x9" / "15×32×9" format: parsed before token pipeline
 *   - Number-first OD: "72mm OD", "72 outer diameter"
 *   - Number-first width: "17mm wide", "9mm width"
 * Reads EnvironmentRules and ApplicationRules from MYCELA.SearchEngine (rules.js).
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  const NOISE = new Set([
    'bearing','bearings','ball','roller','type','grade',
    'a','an','the','for','with','want','need','find','get','show','me','i',
    'please','should','be','can','that','will','work','in','on','of','at','to',
    'and','or','but','is','are','have','has','rated','quality','suitable',
    'something','range','between','from','size','approximately','about','around',
    'roughly','exactly','minimum','maximum','min','max','mm','cm','m','meter',
    'meters','inch','inches','kg','kn','rpm','n','kgf','id','od','bore',
    'inner','outer','diameter','load','force','axial','radial','thrust',
    'speed','self','lubricated','sealed','open','shielded','marine',
    'environment','application','use','used','suitable','conditions',
  ]);

  function toMM(v, u) {
    if (!u) return v;
    u = u.toLowerCase();
    if (u === 'm' || u === 'meter' || u === 'meters') return v * 1000;
    if (u === 'cm' || u === 'centimeter')              return v * 10;
    if (u === 'in' || u === 'inch' || u === 'inches' || u === '"') return v * 25.4;
    return v;
  }

  function toKN(v, u) {
    if (!u) return v;
    u = u.toLowerCase();
    if (u === 'kg' || u === 'kgf' || u === 'kilogram') return v / 101.97;
    if (u === 'n'  || u === 'newton')                   return v / 1000;
    if (u === 'lb' || u === 'lbs'  || u === 'pound')    return v * 0.00444822;
    if (u === 'kn') return v;
    return v;
  }

  ns.SearchEngine.parse = function (raw) {
    const q = raw.toLowerCase().trim();
    const p = { tokens: [], apps: [], typeHints: [], envNotes: [] };
    const consumed = new Set();
    let m;

    // ── Compact format: 15x32x9 or 15×32×9 (optional spaces around ×) ───────
    const compact = /^([0-9]+(?:\.[0-9]+)?)[x×]([0-9]+(?:\.[0-9]+)?)[x×]([0-9]+(?:\.[0-9]+)?)$/i
      .exec(q.replace(/\s/g, ''));
    if (compact) {
      p.bore  = parseFloat(compact[1]);
      p.od    = parseFloat(compact[2]);
      p.width = parseFloat(compact[3]);
      p.rawQ  = q;
      return p;
    }

    // ── Bore ──────────────────────────────────────────────────────────────────
    const borePat = /(?:bore|inner\s*dia(?:meter)?|id\b|i\.d\.|shaft\s*(?:size|dia(?:meter)?)|internal\s*dia(?:meter)?)\s*(?:is|=|:|\bof\b|should\s+be|@)?\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|meter|meters|in\b|inch(?:es)?|")?/gi;
    while ((m = borePat.exec(q)) !== null) { p.bore = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    if (p.bore == null) {
      const b2 = /\b([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|in\b)?\s*(?:id\b|i\.d\.|bore\b|inner)/gi;
      while ((m = b2.exec(q)) !== null) { p.bore = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    }

    // ── OD ────────────────────────────────────────────────────────────────────
    const odPat = /(?:od\b|o\.d\.|outer\s*dia(?:meter)?|external\s*dia(?:meter)?|outside\s*dia(?:meter)?)\s*(?:is|=|:|\bof\b|should\s+be|@)?\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|in\b|inch(?:es)?)?/gi;
    while ((m = odPat.exec(q)) !== null) { p.od = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    // Number-first OD: "72mm OD", "72 outer"
    if (p.od == null) {
      const od2 = /\b([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|in\b)?\s*(?:od\b|o\.d\.|outer(?:\s*dia(?:meter)?)?|outside(?:\s*dia(?:meter)?)?)/gi;
      while ((m = od2.exec(q)) !== null) { p.od = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    }
    // OD range
    const odR = /(?:od\b|o\.d\.|outer\s*dia(?:meter)?)\s*(?:can\s+be\s+)?(?:in\s+(?:the\s+)?rang[e]?\s*(?:of|form|from)?|between|from|rang[e]?\s*(?:of|form|from)?|upto|up\s*to)?\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|meter|in\b|inch(?:es)?)?\s*(?:to|-|and)\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|meter|in\b|inch(?:es)?)?/gi;
    while ((m = odR.exec(q)) !== null) { p.od_min = toMM(parseFloat(m[1]), m[2]); p.od_max = toMM(parseFloat(m[3]), m[4]); consumed.add(+m[1]); consumed.add(+m[3]); }

    // ── Width ─────────────────────────────────────────────────────────────────
    const wPat = /(?:width|height|thickness|\bB\b|face\s*width)\s*(?:is|=|:|\bof\b)?\s*([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|in\b)?/gi;
    while ((m = wPat.exec(q)) !== null) { p.width = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    // Number-first width: "17mm wide", "9mm width"
    if (p.width == null) {
      const w2 = /\b([0-9]*\.?[0-9]+)\s*(mm|cm|m\b|in\b)?\s*(?:wide\b|width\b|thick(?:ness)?\b)/gi;
      while ((m = w2.exec(q)) !== null) { p.width = toMM(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    }

    // ── RPM ───────────────────────────────────────────────────────────────────
    const rpmP = /([0-9,]+)\s*(?:rpm|r\.?p\.?m\.?|rev(?:s|olution)?s?\s*(?:per|\/)\s*min(?:ute)?)/gi;
    while ((m = rpmP.exec(q)) !== null) { p.rpm = parseInt(m[1].replace(/,/g, '')); consumed.add(+m[1].replace(/,/g, '')); }

    // ── Loads ─────────────────────────────────────────────────────────────────
    const rL  = /([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)\s*radial(?:\s+(?:load|force))?/gi;
    while ((m = rL.exec(q))  !== null) { p.cr_min  = toKN(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    const rL2 = /radial(?:\s+(?:load|force))?\s+(?:of\s+)?([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)/gi;
    while ((m = rL2.exec(q)) !== null) { p.cr_min  = toKN(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    const aL  = /([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)\s*(?:axial(?:\s+(?:load|force))?|thrust)/gi;
    while ((m = aL.exec(q))  !== null) { p.c0r_min = toKN(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }
    const aL2 = /(?:axial(?:\s+(?:load|force))?|thrust)\s+(?:of\s+)?([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)/gi;
    while ((m = aL2.exec(q)) !== null) { p.c0r_min = toKN(parseFloat(m[1]), m[2]); consumed.add(+m[1]); }

    // ── Bearing type ──────────────────────────────────────────────────────────
    if      (/deep\s*groove|dgbb/.test(q))               p.type = 'Deep Groove Ball';
    else if (/cylindrical\s*roller/.test(q))             p.type = 'Cylindrical Roller';
    else if (/tapered\s*roller/.test(q))                 p.type = 'Tapered Roller';
    else if (/spherical\s*roller\s*thrust/.test(q))      p.type = 'Spherical Roller Thrust';
    else if (/spherical\s*roller/.test(q))               p.type = 'Spherical Roller';
    else if (/angular\s*contact/.test(q))                p.type = 'Angular Contact Ball';
    else if (/needle\s*roller|needle\s*bearing/.test(q)) p.type = 'Needle Roller';
    else if (/self.?align/.test(q))                      p.type = 'Self-Aligning Ball';
    else if (/thrust\s*ball/.test(q))                    p.type = 'Thrust Ball';
    else if (/\binsert\b|y.bearing/.test(q))             p.type = 'Insert (Y-Bearing)';

    // ── Environment rules ─────────────────────────────────────────────────────
    ns.SearchEngine.EnvironmentRules.forEach(env => {
      if (env.rx.test(q)) {
        if (env.sealing  && !p.sealing)                   p.sealing = env.sealing;
        if (env.typeHints)                                 p.typeHints.push(...env.typeHints);
        if (env.appHint  && !p.apps.includes(env.appHint)) p.apps.push(env.appHint);
        if (env.note)                                      p.envNotes.push(env.note);
      }
    });

    // Explicit sealing overrides environment
    if      (/\bsealed\b|2rs|llu|vv\b|ddu\b/.test(q)) p.sealing = 'Sealed';
    else if (/shield|2z\b|zz\b/.test(q))               p.sealing = 'Shielded';
    else if (/\bopen\b/.test(q))                        p.sealing = 'Open';

    // ── Application rules ─────────────────────────────────────────────────────
    ns.SearchEngine.ApplicationRules.forEach(([rx, app]) => {
      if (rx.test(q) && !p.apps.includes(app)) p.apps.push(app);
    });

    // ── Brand ─────────────────────────────────────────────────────────────────
    if      (/\bntn\b/.test(q)) p.brand = 'NTN';
    else if (/\bskf\b/.test(q)) p.brand = 'SKF';

    // ── Clean PN tokens ───────────────────────────────────────────────────────
    p.tokens = q
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => {
        if (t.length < 2) return false;
        if (NOISE.has(t)) return false;
        const n = parseFloat(t);
        if (!isNaN(n) && consumed.has(n)) return false;
        return true;
      });

    p.rawQ = q;
    return p;
  };
})(window.MYCELA = window.MYCELA || {});
