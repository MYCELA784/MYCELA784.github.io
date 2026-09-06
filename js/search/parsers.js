/* PUBLIC API (consumed by engine.js via MYCELA.SearchEngine.parse)
 *   MYCELA.SearchEngine.parse(raw)
 *     → { tokens, bore, od, od_min, od_max, width, rpm, cr_min, c0r_min,
 *          type, brand, sealing, clearance, typeHints[], apps[], envNotes[], rawQ }
 *
 * Vocabulary (brand / sealing / type / clearance terms, field aliases, unit
 * words) is read from MYCELA.Schemas — nothing about a specific bearing
 * family is hardcoded here. Adding a brand / type / clearance grade / alias
 * is a data edit in schemas/bearing.schema.json.
 *
 * Bug fixes vs. original:
 *   - Compact "15x32x9" / "15×32×9" format: parsed before token pipeline
 *   - Number-first OD: "72mm OD", "72 outer diameter"
 *   - Number-first width: "17mm wide", "9mm width"
 *   - FAG (and any future brand) recognised — brand list comes from the schema
 * Reads EnvironmentRules and ApplicationRules from MYCELA.SearchEngine (rules.js).
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // ── Schema access ─────────────────────────────────────────────────────────
  function schema() {
    var S = ns.Schemas;
    if (!S) return null;
    return S.get && (S.get('bearing') || (S.primary && S.primary())) || null;
  }
  function fieldOf(name) {
    var s = schema();
    return (s && s.fields && s.fields[name]) || null;
  }

  // Flat, longest-term-first alias list for a choice field:
  //   [{ value: 'FAG', term: 'schaeffler' }, { value: 'FAG', term: 'fag' }, ...]
  function choiceTerms(fieldName) {
    var f = fieldOf(fieldName), out = [];
    if (!f || !f.values) return out;
    Object.keys(f.values).forEach(function (val) {
      (f.values[val] || []).forEach(function (t) {
        out.push({ value: val, term: String(t).toLowerCase() });
      });
    });
    out.sort(function (a, b) { return b.term.length - a.term.length; });
    return out;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // A term matches on token boundaries; internal spaces match any whitespace
  // run so multi-word aliases ("deep groove") work regardless of spacing.
  function termMatches(term, q) {
    var body = escapeRe(term).replace(/\\?\s+/g, '\\s+');
    return new RegExp('(?:^|[^a-z0-9])' + body + '(?![a-z0-9])', 'i').test(q);
  }

  // First schema value whose alias appears in the query (longest alias wins).
  function detectChoice(fieldName, q) {
    var terms = choiceTerms(fieldName);
    for (var i = 0; i < terms.length; i++) {
      if (termMatches(terms[i].term, q)) return terms[i].value;
    }
    return null;
  }

  // ── Unit conversion (unit words from the schema) ──────────────────────────
  function unitFactor(u) {
    if (!u) return 1;
    u = u.toLowerCase().replace(/[^a-z"']/g, '');
    var s = schema();
    if (s && s.units) {
      var conv = s.units.conversion_to_mm || {};
      var keys = Object.keys(s.units).filter(function (k) { return k !== 'conversion_to_mm'; });
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var words = (s.units[k] || []).map(function (w) { return String(w).toLowerCase().replace(/[^a-z"']/g, ''); });
        if (k === u || words.indexOf(u) !== -1) return conv[k] != null ? conv[k] : 1;
      }
    }
    // Fallbacks for unit tokens not modelled in the schema.
    if (u === 'm' || u === 'meter' || u === 'meters') return 1000;
    return 1;
  }
  function toMM(v, u) { return v * unitFactor(u); }

  function toKN(v, u) {
    if (!u) return v;
    u = u.toLowerCase();
    if (u === 'kg' || u === 'kgf' || u === 'kilogram') return v / 101.97;
    if (u === 'n'  || u === 'newton')                   return v / 1000;
    if (u === 'lb' || u === 'lbs'  || u === 'pound')    return v * 0.00444822;
    if (u === 'kn') return v;
    return v;
  }

  // Generic-English filler only — no bearing vocabulary. Field aliases, unit
  // words and modifier words are pulled from the schema below.
  var STOPWORDS = [
    'a','an','the','for','with','want','need','find','get','show','me','i',
    'please','should','be','can','that','will','work','is','are','have','has',
    'something','suitable','conditions','use','used','of','to','in','on','at',
    'and','or','but','my','it','this','these','type','grade','size','rated','quality',
  ];

  function noiseSet() {
    var s = schema(), set = {};
    STOPWORDS.forEach(function (w) { set[w] = 1; });
    if (s) {
      Object.keys(s.fields || {}).forEach(function (fn) {
        var f = s.fields[fn];
        (f.aliases || []).forEach(function (a) {
          String(a).toLowerCase().split(/\s+/).forEach(function (w) { if (w.length > 1) set[w] = 1; });
        });
      });
      Object.keys(s.units || {}).forEach(function (k) {
        if (k === 'conversion_to_mm') return;
        set[k] = 1;
        (s.units[k] || []).forEach(function (w) { set[String(w).toLowerCase()] = 1; });
      });
      Object.keys(s.modifiers || {}).forEach(function (mk) {
        (s.modifiers[mk].words || []).forEach(function (w) {
          String(w).toLowerCase().split(/\s+/).forEach(function (t) { if (t.length > 1) set[t] = 1; });
        });
      });
      (((s.detect || {}).strong) || []).concat(((s.detect || {}).weak) || [])
        .forEach(function (w) {
          String(w).toLowerCase().split(/\s+/).forEach(function (t) { if (t.length > 1) set[t] = 1; });
        });
    }
    // load / speed vocabulary (not modelled as schema fields)
    ['load','force','axial','radial','thrust','speed','rpm','kg','kn','kgf','lbs','lb',
     'newton','revolutions','revolution','rev','min','minute'].forEach(function (w) { set[w] = 1; });
    return set;
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

    // ── Bearing type (vocabulary from the schema) ─────────────────────────────
    p.type = detectChoice('type', q) || undefined;

    // ── Environment rules ─────────────────────────────────────────────────────
    ns.SearchEngine.EnvironmentRules.forEach(env => {
      if (env.rx.test(q)) {
        if (env.sealing  && !p.sealing)                   p.sealing = env.sealing;
        if (env.typeHints)                                 p.typeHints.push(...env.typeHints);
        if (env.appHint  && !p.apps.includes(env.appHint)) p.apps.push(env.appHint);
        if (env.note)                                      p.envNotes.push(env.note);
      }
    });

    // Explicit sealing (schema vocabulary) overrides environment inference
    const explicitSeal = detectChoice('sealing', q);
    if (explicitSeal) p.sealing = explicitSeal;

    // ── Application rules ─────────────────────────────────────────────────────
    ns.SearchEngine.ApplicationRules.forEach(([rx, app]) => {
      if (rx.test(q) && !p.apps.includes(app)) p.apps.push(app);
    });

    // ── Brand (vocabulary from the schema — FAG, and any brand added later) ───
    p.brand = detectChoice('brand', q) || undefined;

    // ── Clearance grade (vocabulary from the schema) ─────────────────────────
    p.clearance = detectChoice('clearance', q) || undefined;

    // ── Clean PN tokens ───────────────────────────────────────────────────────
    const NOISE = noiseSet();
    p.tokens = q
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => {
        if (t.length < 2) return false;
        if (NOISE[t]) return false;
        const n = parseFloat(t);
        if (!isNaN(n) && consumed.has(n)) return false;
        return true;
      });

    p.rawQ = q;
    return p;
  };
})(window.MYCELA = window.MYCELA || {});
