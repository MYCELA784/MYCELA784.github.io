/* PUBLIC API (consumed by engine.js)
 *   MYCELA.SearchEngine.Scorers — pure scorer functions, each returns a numeric delta
 *     All weight constants read from MYCELA.CONFIG.scoring — no hardcoded numbers here.
 *
 *   .partNumber(b, intent)
 *   .brand(b, intent)
 *   .bearingType(b, intent)
 *   .bore(b, intent)
 *   .od(b, intent)
 *   .width(b, intent)
 *   .loads(b, intent)
 *   .rpm(b, intent)
 *   .sealing(b, intent)
 *   .applications(b, intent)
 *
 *   MYCELA.SearchEngine.isDesignationOnlyMatch(b, intent) → bool
 *     True when partNumber()'s score came from the base-designation
 *     fallback rather than an exact/prefix/includes string match — i.e.
 *     this result is "closest by designation", not a literal pn match.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // The query's parsed designation ({family,core,suffix,normalized}) is
  // compared against each catalog pn's own designation, both produced by the
  // shared MYCELA.SearchEngine.designationOf() (parsers.js). This finds the
  // designation anywhere in the query — "skf 6205", "6205 skf" and
  // "ntn 6205 2rs" all resolve to base "6205" — and trims "62052rs" to 6205
  // without trimming "618002rs" to 6180.
  function designationMatches(b, intent) {
    const q = intent.designation;
    if (!q || !q.normalized || q.core.length < 3) return false;
    const pnD = MYCELA.SearchEngine.designationOf(b.pn);
    return !!pnD && pnD.normalized === q.normalized;
  }

  // Single source of truth for which partNumber() branch applies, shared
  // with ns.SearchEngine.isDesignationOnlyMatch() below so the renderer can
  // tell a real string match apart from a base-designation-only fallback
  // (e.g. "6205-2RS" vs catalog pn "6205") without re-deriving the logic.
  function classifyPartNumberMatch(b, intent) {
    const pnRaw   = b.pn.toLowerCase();
    const pnClean = pnRaw.replace(/[\s-]/g, '');
    const qClean  = intent.rawQ.replace(/[^a-z0-9]/g, '');
    if ((pnClean === qClean && qClean.length >= 2) || pnRaw === intent.rawQ) return 'exact';
    if (pnClean.startsWith(qClean) && qClean.length >= 3)                     return 'prefix';
    if (pnClean.includes(qClean) && qClean.length >= 3)                      return 'includes';
    // Query is a base designation plus a suffix/modifier that this pn
    // doesn't literally contain (e.g. "6205-2RS" vs catalog pn "6205" or
    // "6205-C-2Z"): an exact shared base designation must still outrank an
    // unrelated pn that only coincidentally shares a short suffix substring
    // (see the token loop in partNumber()) plus a sealing match.
    if (designationMatches(b, intent)) return 'designation';
    return null;
  }

  // Used by engine.js's fast() to flag results that only matched via the
  // base-designation fallback — the renderer uses this to show a "closest
  // match, different sealing than requested" note instead of presenting
  // a different sealing type as if it were an exact match.
  ns.SearchEngine.isDesignationOnlyMatch = function (b, intent) {
    return classifyPartNumberMatch(b, intent) === 'designation';
  };

  // Numeric weights come from the schema's scoring_hints (see STEP 4/5 of the
  // refactor); the choice-field weights stay in MYCELA.CONFIG.scoring.
  function hints() {
    var S = MYCELA.Schemas;
    var s = S && S.get && (S.get('bearing') || (S.primary && S.primary()));
    return (s && s.scoring_hints) || {
      prefer_exact_bonus: 30, in_range_bonus: 15,
      out_of_range_penalty: -40, excluded_value_penalty: -1000,
    };
  }

  // Score a numeric field ({prefer?, min?, max?}) against a catalog value.
  //   exact preferred value  >  in range  >  out of range
  function numericScore(val, f) {
    if (val == null || !f) return 0;
    var H = hints();
    if (f.prefer != null && Math.abs(val - f.prefer) < 0.5) return H.prefer_exact_bonus;
    if (f.min != null && f.max != null && val >= f.min - 0.5 && val <= f.max + 0.5) return H.in_range_bonus;
    if (f.prefer != null) {
      var d = Math.abs(val - f.prefer);
      if (d <= Math.max(1.5, f.prefer * 0.05)) return H.in_range_bonus;
      return H.out_of_range_penalty;
    }
    if ((f.min != null && val < f.min) || (f.max != null && val > f.max)) return H.out_of_range_penalty;
    return 0;
  }

  function choiceHas(list, v) { return !!list && list.indexOf(v) !== -1; }

  ns.SearchEngine.Scorers = {
    partNumber(b, intent) {
      const CFG     = MYCELA.CONFIG.scoring;
      const pnClean = b.pn.toLowerCase().replace(/[\s-]/g, '');
      let s = 0;
      switch (classifyPartNumberMatch(b, intent)) {
        case 'exact':       s += CFG.pnExact;         break;
        case 'prefix':      s += CFG.pnPrefix;        break;
        case 'includes':    s += CFG.pnIncludes;      break;
        case 'designation': s += CFG.designationMatch; break;
      }
      intent.tokens.forEach(t => {
        if (t.length >= 2 && pnClean.includes(t)) s += CFG.pnToken;
      });
      return s;
    },

    brand(b, intent) {
      const f = intent.brand;
      if (!f) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      if (choiceHas(f.exclude, b.brand)) return hints().excluded_value_penalty;
      if (!f.accept || !f.accept.length) return 0;
      return choiceHas(f.accept, b.brand) ? CFG.brandMatch : CFG.brandMismatch;
    },

    bearingType(b, intent) {
      const CFG = MYCELA.CONFIG.scoring;
      const f = intent.type;
      if (!f) {
        return (intent.typeHints.length > 0 && intent.typeHints.indexOf(b.type) !== -1) ? CFG.typeHint : 0;
      }
      if (choiceHas(f.exclude, b.type)) return hints().excluded_value_penalty;
      if (f.accept && f.accept.length)  return choiceHas(f.accept, b.type) ? CFG.typeExact : CFG.typePenalty;
      return 0;
    },

    bore(b, intent)  { return numericScore(b.bore, intent.bore); },
    od(b, intent)    { return numericScore(b.od, intent.od); },
    width(b, intent) { return numericScore(b.w, intent.width); },

    loads(b, intent) {
      const CFG = MYCELA.CONFIG.scoring;
      let s = 0;
      if (intent.cr_min != null) {
        s += (b.cr != null && b.cr >= intent.cr_min) ? CFG.crMatch : (b.cr != null ? CFG.crPenalty : 0);
      }
      if (intent.c0r_min != null) {
        s += (b.c0r != null && b.c0r >= intent.c0r_min) ? CFG.c0rMatch : (b.c0r != null ? CFG.c0rPenalty : 0);
      }
      return s;
    },

    rpm(b, intent) {
      if (intent.rpm == null) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      if (b.rpm != null && b.rpm >= intent.rpm)         return CFG.rpmMatch;
      if (b.rpm != null && b.rpm < intent.rpm * 0.8)    return CFG.rpmPenalty;
      return 0;
    },

    sealing(b, intent) {
      const f = intent.sealing;
      if (!f) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      if (choiceHas(f.exclude, b.sealing)) {
        // A pn / designation match is the user's own identifier — keep it
        // (demoted) so the renderer can flag "closest match, different
        // sealing" — UNLESS the exclusion came from an explicit negation
        // ("6205 not sealed"), which removes it like any other. A derived
        // exclusion (from "metal or seal" or a suffix) only demotes.
        var soft = classifyPartNumberMatch(b, intent) && !choiceHas(f.negated, b.sealing);
        return soft ? CFG.sealingPenalty : hints().excluded_value_penalty;
      }
      if (choiceHas(f.accept, b.sealing)) return CFG.sealingExact;
      if (choiceHas(f.accept, 'Sealed') && b.sealing === 'Shielded') return CFG.sealingPartial;
      if (f.accept && f.accept.length) return CFG.sealingPenalty;
      return 0;
    },

    clearance(b, intent) {
      const f = intent.clearance;
      if (!f) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      const toks = String(b.pn).toUpperCase().split(/[-\/\s]+/);
      const has = v => toks.indexOf(String(v).toUpperCase()) !== -1;
      if (f.exclude && f.exclude.some(has)) return hints().excluded_value_penalty;
      if (f.accept && f.accept.some(has))   return CFG.clearanceMatch;
      return 0;
    },

    applications(b, intent) {
      if (!intent.apps || intent.apps.length === 0) return 0;
      const appMatch = MYCELA.CONFIG.scoring.appMatch;
      let s = 0;
      intent.apps.forEach(app => {
        if (b.apps && b.apps.some(a => a.toLowerCase().includes(app))) s += appMatch;
      });
      return s;
    },
  };
})(window.MYCELA = window.MYCELA || {});
