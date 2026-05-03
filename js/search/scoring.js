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
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  ns.SearchEngine.Scorers = {
    partNumber(b, intent) {
      const CFG     = MYCELA.CONFIG.scoring;
      const pnRaw   = b.pn.toLowerCase();
      const pnClean = pnRaw.replace(/[\s-]/g, '');
      const qClean  = intent.rawQ.replace(/[^a-z0-9]/g, '');
      let s = 0;
      if ((pnClean === qClean && qClean.length >= 2) || pnRaw === intent.rawQ) {
        s += CFG.pnExact;
      } else if (pnClean.startsWith(qClean) && qClean.length >= 3) {
        s += CFG.pnPrefix;
      } else if (pnClean.includes(qClean) && qClean.length >= 3) {
        s += CFG.pnIncludes;
      }
      intent.tokens.forEach(t => {
        if (t.length >= 2 && pnClean.includes(t)) s += CFG.pnToken;
      });
      return s;
    },

    brand(b, intent) {
      return (intent.brand && b.brand === intent.brand) ? MYCELA.CONFIG.scoring.brandMatch : 0;
    },

    bearingType(b, intent) {
      const CFG = MYCELA.CONFIG.scoring;
      if (!intent.type) {
        return (intent.typeHints.length > 0 && intent.typeHints.includes(b.type)) ? CFG.typeHint : 0;
      }
      return b.type === intent.type ? CFG.typeExact : CFG.typePenalty;
    },

    bore(b, intent) {
      if (intent.bore == null) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      const d = Math.abs(b.bore - intent.bore);
      if (d < 0.5) return CFG.boreExact;
      if (d < 1.5) return CFG.boreClose;
      if (d < 3)   return CFG.boreNear;
      if (d < 8)   return CFG.boreFar;
      return CFG.boreWrong;
    },

    od(b, intent) {
      const CFG = MYCELA.CONFIG.scoring;
      let s = 0;
      if (intent.od != null) {
        const d = Math.abs(b.od - intent.od);
        if      (d < 0.5) s += CFG.odExact;
        else if (d < 2)   s += CFG.odClose;
        else              s += CFG.odPenalty;
      }
      if (intent.od_min != null && b.od < intent.od_min - 1) s += CFG.odRangePenalty;
      if (intent.od_max != null && b.od > intent.od_max + 1) s += CFG.odRangePenalty;
      if (intent.od_min != null && intent.od_max != null &&
          b.od >= intent.od_min && b.od <= intent.od_max)    s += CFG.odRangeMatch;
      return s;
    },

    width(b, intent) {
      if (intent.width == null) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      const d = Math.abs(b.w - intent.width);
      if (d < 0.5) return CFG.widthExact;
      if (d < 2)   return CFG.widthClose;
      return 0;
    },

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
      if (!intent.sealing) return 0;
      const CFG = MYCELA.CONFIG.scoring;
      if (b.sealing === intent.sealing)                              return CFG.sealingExact;
      if (intent.sealing === 'Sealed' && b.sealing === 'Shielded')  return CFG.sealingPartial;
      return CFG.sealingPenalty;
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
