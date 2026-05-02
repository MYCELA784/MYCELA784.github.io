/* PUBLIC API
 *   MYCELA.SearchEngine.fast(q, maxResults?)    → bearing[] with _matchType, _score, _breakdown
 *   MYCELA.SearchEngine.scoreBearing(b, intent) → { score, matchType, breakdown }
 *
 * Assembles parse (parsers.js), Scorers (scoring.js), fallback (fallback.js)
 * into the search API called by app.js.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

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
      apps:  S.applications(b, intent),
    };
    const score = Object.values(breakdown).reduce((a, v) => a + v, 0);

    let matchType = null;
    if (breakdown.pn >= MYCELA.CONFIG.scoring.pnPrefix)                        matchType = 'PN';
    else if (intent.bore != null || intent.od != null || intent.width != null)  matchType = 'DIMS';
    else if (intent.apps && intent.apps.length > 0)                             matchType = 'APP';

    return { score, matchType, breakdown };
  };

  ns.SearchEngine.fast = function (q, maxResults) {
    maxResults = maxResults || MYCELA.CONFIG.search.maxResults;
    const intent = ns.SearchEngine.parse(q);

    const scored = MYCELA.DB.map(b => {
      const { score, matchType, breakdown } = ns.SearchEngine.scoreBearing(b, intent);
      return { b, score, matchType, breakdown };
    });

    return scored
      .filter(x => x.score > 0)
      .sort((a, c) => c.score - a.score)
      .slice(0, maxResults)
      .map(x => ({ ...x.b, _matchType: x.matchType, _score: x.score, _breakdown: x.breakdown }));
  };
})(window.MYCELA = window.MYCELA || {});
