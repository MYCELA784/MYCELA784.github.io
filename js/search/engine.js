/* PUBLIC API
 *   MYCELA.SearchEngine.fast(q, maxResults?)
 *     → bearing[] with _matchType, _score, _breakdown, _designationOnly,
 *       _queriedSealing (the sealing preference parsed from the query, if any)
 *   MYCELA.SearchEngine.scoreBearing(b, intent) → { score, matchType, breakdown }
 *
 * Assembles parse (parsers.js), Scorers (scoring.js), fallback (fallback.js)
 * into the search API called by app.js.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // Tiebreaker rank for results with identical scores.
  // Lower number = ranked higher when scores tie. Deep Groove Ball is the
  // generic default — most dimensional searches expect a DGBB first.
  const TYPE_RANK = {
    'Deep Groove Ball':         1,
    'Cylindrical Roller':       2,
    'Tapered Roller':           3,
    'Spherical Roller':         4,
    'Angular Contact Ball':     5,
    'Self-Aligning Ball':       6,
    'Spherical Roller Thrust':  7,
    'Needle Roller':            8,
    'Insert (Y-Bearing)':       9,
  };

  ns.SearchEngine.scoreBearing = function (b, intent) {
    const S = ns.SearchEngine.Scorers;
    const breakdown = {
      pn:    S.partNumber(b, intent),
      brand: S.brand(b, intent),
      type:  S.bearingType(b, intent),
      bore:  S.bore(b, intent),
      od:    S.od(b, intent),
      width: S.width(b, intent),
      loads: S.loads(b, intent),
      rpm:   S.rpm(b, intent),
      seal:  S.sealing(b, intent),
      clr:   S.clearance(b, intent),
      apps:  S.applications(b, intent),
    };
    const score = Object.values(breakdown).reduce((a, v) => a + v, 0);

    // A choice scorer returns the schema's excluded_value_penalty when the
    // bearing carries a value the query explicitly excluded — that result is
    // removed, not merely demoted (audit B5). Designation/pn matches never
    // reach this: Scorers.sealing() demotes them with sealingPenalty instead.
    const EXCL = excludedPenalty();
    const hardExcluded = breakdown.brand <= EXCL || breakdown.type <= EXCL ||
                         breakdown.seal <= EXCL || breakdown.clr <= EXCL;

    let matchType = null;
    if (breakdown.pn >= MYCELA.CONFIG.scoring.pnPrefix)                matchType = 'PN';
    else if (intent.bore || intent.od || intent.width)                matchType = 'DIMS';
    else if (intent.apps && intent.apps.length > 0)                   matchType = 'APP';

    return { score, matchType, breakdown, hardExcluded };
  };

  function excludedPenalty() {
    const S = MYCELA.Schemas;
    const s = S && S.get && (S.get('bearing') || (S.primary && S.primary()));
    return (s && s.scoring_hints && s.scoring_hints.excluded_value_penalty) || -1000;
  }

  ns.SearchEngine.fast = function (q, maxResults) {
    maxResults = maxResults || MYCELA.CONFIG.search.maxResults;
    const intent = ns.SearchEngine.parse(q);

    const scored = MYCELA.DB.map(b => {
      const { score, matchType, breakdown, hardExcluded } = ns.SearchEngine.scoreBearing(b, intent);
      return { b, score, matchType, breakdown, hardExcluded };
    });

    const alive = scored.filter(x => x.score > 0 && !x.hardExcluded);

    // ── Inclusion rules ──────────────────────────────────────────────────
    // A result has to earn its slot; the grid is never padded to a target
    // count with weak matches.
    //
    // 1. Designation-anchored: the query parsed a real designation (6205,
    //    62052RS, "fag 6205", "NU205" …) and at least one catalog part is a
    //    genuine pn / designation match for it. The answer is that family
    //    (which already spans the brands that carry it) and nothing else —
    //    a part that only shares a brand, a seal type or an application tag
    //    is not a weaker 6205, it is a different bearing.
    // 2. Otherwise: brand alone never qualifies a result. Strip the brand
    //    bonus and require some other positive signal to remain.
    const d = intent.designation;
    const anchored = !!(d && d.normalized && d.core && d.core.length >= 3) &&
      alive.some(x => ns.SearchEngine.isPartNumberMatch(x.b, intent));

    const included = anchored
      ? alive.filter(x => ns.SearchEngine.isPartNumberMatch(x.b, intent))
      : alive.filter(x => {
          const brandPts = x.breakdown.brand > 0 ? x.breakdown.brand : 0;
          return x.score - brandPts > 0;
        });

    return included
      .sort((a, c) => {
        // Primary: score descending
        if (c.score !== a.score) return c.score - a.score;
        // Tiebreaker 1: bearing type rank (DGBB first, Needle last)
        const aType = TYPE_RANK[a.b.type] || 99;
        const cType = TYPE_RANK[c.b.type] || 99;
        if (aType !== cType) return aType - cType;
        // Tiebreaker 2: width ascending (slimmer/standard first)
        if (a.b.w !== c.b.w) return a.b.w - c.b.w;
        // Tiebreaker 3: shorter pn first — the plain designation (6205)
        // outranks a suffixed variant (6205-C) on a bare dimensional query
        if (a.b.pn.length !== c.b.pn.length) return a.b.pn.length - c.b.pn.length;
        // Tiebreaker 4: brand alphabetical (deterministic last resort)
        return a.b.brand.localeCompare(c.b.brand);
      })
      // Upper bound, not a target: a short exact answer stays short.
      .slice(0, maxResults)
      .map(x => ({
        ...x.b,
        _matchType: x.matchType,
        _score: x.score,
        _breakdown: x.breakdown,
        _designationOnly: ns.SearchEngine.isDesignationOnlyMatch(x.b, intent),
        _queriedSealing: (intent.sealing && intent.sealing.accept && intent.sealing.accept[0]) || null,
      }));
  };
})(window.MYCELA = window.MYCELA || {});