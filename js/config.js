/* PUBLIC API
 *   MYCELA.CONFIG  — all tunable runtime values; edit here to adjust ranking
 *
 * Sections:
 *   search   — network and result-set parameters
 *   scoring  — point values for every match signal in scoring.js
 *   fallback — tolerance thresholds for progressive relaxation stages
 */
(function (ns) {
  ns.CONFIG = {
    search: {
      maxResults:  30,
      aiTimeoutMs: 12000,
      backendUrl:  'https://mycela-backend.onrender.com/search',
    },
    scoring: {
      // Part-number signals
      pnExact:    100,
      pnPrefix:    75,
      pnIncludes:  50,
      // Shared base designation (query = designation + unmatched suffix,
      // e.g. "6205-2RS" vs catalog pn "6205"). Must clearly outrank the
      // worst-case noise a wrong-family pn can rack up from pnToken hits
      // on a generic suffix fragment plus a full sealing match.
      designationMatch: 60,
      pnToken:      8,
      // Brand
      brandMatch:     20,  // query names this brand and the bearing is it
      brandMismatch: -15,  // query names a brand and the bearing is a different one
      // Bearing type
      typeExact:   40,
      typePenalty: -10,
      typeHint:    20,  // environment-inferred type hint
      // Numeric fields (bore / od / width) are scored from the schema's
      // scoring_hints (prefer_exact_bonus / in_range_bonus /
      // out_of_range_penalty / excluded_value_penalty) — see
      // schemas/bearing.schema.json and js/search/scoring.js numericScore().
      // Load ratings
      crMatch:     25,
      crPenalty:  -20,
      c0rMatch:    20,
      c0rPenalty: -15,
      // RPM
      rpmMatch:    20,
      rpmPenalty: -15,
      // Sealing
      sealingExact:    25,
      sealingPartial:   5,  // Sealed query → Shielded result
      sealingPenalty: -10,
      // Clearance grade (inferred from the pn suffix — DB has no clearance field)
      clearanceMatch:  15,
      // Applications
      appMatch:    16,  // per matching application tag
    },
    fallback: {
      stage1BoreTol:    5,  // Stage 1: relax OD range, keep bore ± this
      stage2BoreTol:    3,  // Stage 2: relax sealing, keep bore ± this
      stage3BoreTol:    5,  // Stage 3: bore only ± this
      stage1MaxResults: 8,
      stage2MaxResults: 8,
      stage3MaxResults: 8,
      stage4MaxResults: 8,
      stage5MaxResults: 6,
    },
  };
})(window.MYCELA = window.MYCELA || {});
