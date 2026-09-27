/* PUBLIC API (consumed by engine.js)
 *   MYCELA.SearchEngine.fallback(q) → { results: bearing[], note: string|null, stage }
 *     stage: 1–4  the stage that supplied the results
 *            0    the query had a bore or a type, but nothing within tolerance
 *            null the query had no bore and no type: nothing to relax from
 *     app.js sends it with the zero-result telemetry as fallbackStage.
 *
 * Progressive relaxation when fast() returns zero results. Needs a bore
 * (stages 1–3) or a bearing type (stage 4); anything else returns no results.
 * Stage tolerances read from MYCELA.CONFIG.fallback.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // The parser's numeric fields are {prefer?, min?, max?}; choice fields are
  // {accept:[], exclude:[]}. Reduce them to the plain values this stage logic
  // was written against.
  function numVal(f) {
    if (!f) return null;
    if (f.prefer != null) return f.prefer;
    if (f.min != null && f.max != null) return (f.min + f.max) / 2;
    return f.min != null ? f.min : (f.max != null ? f.max : null);
  }
  function firstAccept(f) { return (f && f.accept && f.accept[0]) || null; }

  ns.SearchEngine.fallback = function (q) {
    const p       = ns.SearchEngine.parse(q);
    const CFG     = MYCELA.CONFIG.fallback;
    const DB      = MYCELA.DB;
    const bore    = numVal(p.bore);
    const odMin   = p.od ? p.od.min : null;
    const odMax   = p.od ? p.od.max : null;
    const sealing = firstAccept(p.sealing);
    const type    = firstAccept(p.type);
    const hasBore = bore != null;
    const hasODR  = odMin != null || odMax != null;
    const hasSeal = !!sealing;
    const hasType = !!type;

    // Stage 1 — relax OD range, keep bore ± stage1BoreTol and sealing
    if (hasBore && hasODR) {
      const s1 = DB
        .filter(b => Math.abs(b.bore - bore) <= CFG.stage1BoreTol &&
                     (!hasSeal || b.sealing === sealing))
        .sort((a, b) => Math.abs(a.bore - bore) - Math.abs(b.bore - bore))
        .slice(0, CFG.stage1MaxResults);
      if (s1.length > 0) return {
        results: s1, stage: 1,
        note: `No bearing found with ${bore}mm bore in the OD ${odMin}–${odMax}mm range. Showing closest bore matches; OD range constraint relaxed. Consider these and verify OD fits your housing.`,
      };
    }

    // Stage 2 — relax sealing, keep bore ± stage2BoreTol
    if (hasBore && hasSeal) {
      const s2 = DB
        .filter(b => Math.abs(b.bore - bore) <= CFG.stage2BoreTol)
        .sort((a, b) => Math.abs(a.bore - bore) - Math.abs(b.bore - bore))
        .slice(0, CFG.stage2MaxResults);
      if (s2.length > 0) {
        const avail = [...new Set(s2.map(b => b.sealing))].join(', ');
        return {
          results: s2, stage: 2,
          note: `No ${sealing.toLowerCase()} bearing found with exact ${bore}mm bore. Available sealings for this size: ${avail}. Consider ordering the Open variant and fitting an external seal, or requesting sealed variants direct from the supplier.`,
        };
      }
    }

    // Stage 3 — bore only
    if (hasBore) {
      const s3 = DB
        .filter(b => Math.abs(b.bore - bore) <= CFG.stage3BoreTol)
        .sort((a, b) => Math.abs(a.bore - bore) - Math.abs(b.bore - bore))
        .slice(0, CFG.stage3MaxResults);
      if (s3.length > 0) return {
        results: s3, stage: 3,
        note: `Exact specification not found in the current catalog (${DB.length} bearings). Showing available bearings near ${bore}mm bore. For your full requirements, contact a specialized industrial distributor.`,
      };
    }

    // Stage 4 — type only
    if (hasType) {
      const s4 = DB.filter(b => b.type === type).slice(0, CFG.stage4MaxResults);
      if (s4.length > 0) return {
        results: s4, stage: 4,
        note: `No bearing matched all your specifications. Showing all ${type} bearings in the catalog; check dimensions manually.`,
      };
    }

    // Nothing to relax from: no bore and no type (gibberish, a bare brand,
    // an application word, an unknown designation). Return nothing so the UI
    // shows its empty state. A generic "common bearings" stage used to fill
    // this in with the first deep groove rows in the DB, which served none of
    // these queries; removed 2026-09-27.
    return { results: [], note: null, stage: (hasBore || hasType) ? 0 : null };
  };
})(window.MYCELA = window.MYCELA || {});
