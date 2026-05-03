/* PUBLIC API (consumed by engine.js)
 *   MYCELA.SearchEngine.fallback(q) → { results: bearing[], note: string }
 *
 * Progressive relaxation when fast() returns zero results.
 * Stage tolerances read from MYCELA.CONFIG.fallback.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  ns.SearchEngine.fallback = function (q) {
    const p       = ns.SearchEngine.parse(q);
    const CFG     = MYCELA.CONFIG.fallback;
    const DB      = MYCELA.DB;
    const hasBore = p.bore != null;
    const hasODR  = p.od_min != null || p.od_max != null;
    const hasSeal = !!p.sealing;
    const hasType = !!p.type;

    // Stage 1 — relax OD range, keep bore ± stage1BoreTol and sealing
    if (hasBore && hasODR) {
      const s1 = DB
        .filter(b => Math.abs(b.bore - p.bore) <= CFG.stage1BoreTol &&
                     (!hasSeal || b.sealing === p.sealing))
        .sort((a, b) => Math.abs(a.bore - p.bore) - Math.abs(b.bore - p.bore))
        .slice(0, CFG.stage1MaxResults);
      if (s1.length > 0) return {
        results: s1,
        note: `No bearing found with ${p.bore}mm bore in the OD ${p.od_min}–${p.od_max}mm range. Showing closest bore matches — OD range constraint relaxed. Consider these and verify OD fits your housing.`,
      };
    }

    // Stage 2 — relax sealing, keep bore ± stage2BoreTol
    if (hasBore && hasSeal) {
      const s2 = DB
        .filter(b => Math.abs(b.bore - p.bore) <= CFG.stage2BoreTol)
        .sort((a, b) => Math.abs(a.bore - p.bore) - Math.abs(b.bore - p.bore))
        .slice(0, CFG.stage2MaxResults);
      if (s2.length > 0) {
        const avail = [...new Set(s2.map(b => b.sealing))].join(', ');
        return {
          results: s2,
          note: `No ${p.sealing.toLowerCase()} bearing found with exact ${p.bore}mm bore. Available sealings for this size: ${avail}. Consider ordering the Open variant and fitting an external seal, or requesting sealed variants direct from the supplier.`,
        };
      }
    }

    // Stage 3 — bore only
    if (hasBore) {
      const s3 = DB
        .filter(b => Math.abs(b.bore - p.bore) <= CFG.stage3BoreTol)
        .sort((a, b) => Math.abs(a.bore - p.bore) - Math.abs(b.bore - p.bore))
        .slice(0, CFG.stage3MaxResults);
      if (s3.length > 0) return {
        results: s3,
        note: `Exact specification not found in the current catalog (SKF + NTN, ${DB.length} bearings). Showing available bearings near ${p.bore}mm bore. For your full requirements, contact a specialized industrial distributor.`,
      };
    }

    // Stage 4 — type only
    if (hasType) {
      const s4 = DB.filter(b => b.type === p.type).slice(0, CFG.stage4MaxResults);
      if (s4.length > 0) return {
        results: s4,
        note: `No bearing matched all your specifications. Showing all ${p.type} bearings in the catalog — check dimensions manually.`,
      };
    }

    // Stage 5 — common DGBB fallback
    return {
      results: DB.filter(b => b.type === 'Deep Groove Ball').slice(0, CFG.stage5MaxResults),
      note: `No match found for your query in the current catalog. This may be a specialized bearing not yet indexed. Showing common bearing types for reference. Try contacting NTN or SKF directly with your specifications.`,
    };
  };
})(window.MYCELA = window.MYCELA || {});
