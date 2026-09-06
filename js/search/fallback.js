/* PUBLIC API (consumed by engine.js)
 *   MYCELA.SearchEngine.fallback(q) → { results: bearing[], note: string }
 *
 * Progressive relaxation when fast() returns zero results.
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
        results: s1,
        note: `No bearing found with ${bore}mm bore in the OD ${odMin}–${odMax}mm range. Showing closest bore matches — OD range constraint relaxed. Consider these and verify OD fits your housing.`,
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
          results: s2,
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
        results: s3,
        note: `Exact specification not found in the current catalog (${DB.length} bearings). Showing available bearings near ${bore}mm bore. For your full requirements, contact a specialized industrial distributor.`,
      };
    }

    // Stage 4 — type only
    if (hasType) {
      const s4 = DB.filter(b => b.type === type).slice(0, CFG.stage4MaxResults);
      if (s4.length > 0) return {
        results: s4,
        note: `No bearing matched all your specifications. Showing all ${type} bearings in the catalog — check dimensions manually.`,
      };
    }

    // Stage 5 — common DGBB fallback
    return {
      results: DB.filter(b => b.type === 'Deep Groove Ball').slice(0, CFG.stage5MaxResults),
      note: `No match found for your query in the current catalog. This may be a specialized bearing not yet indexed. Showing common bearing types for reference. Try contacting the manufacturer directly with your specifications.`,
    };
  };
})(window.MYCELA = window.MYCELA || {});
