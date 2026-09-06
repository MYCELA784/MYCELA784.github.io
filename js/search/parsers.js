/* PUBLIC API (consumed by engine.js via MYCELA.SearchEngine.parse)
 *   MYCELA.SearchEngine.parse(raw)
 *     → { tokens, rawQ,
 *          bore, od, width,            // {prefer?, min?, max?}  (a bare number → prefer==min==max)
 *          type, brand, sealing, clearance,   // {accept:[], exclude:[]}
 *          designation,                // {family, core, suffix, normalized}
 *          rpm, cr_min, c0r_min,       // scalars (load/speed — not schema-modelled)
 *          typeHints[], apps[], envNotes[] }
 *
 * Vocabulary (brand / sealing / type / clearance terms, field aliases, unit
 * words) and the query modifiers (range / approximate / maximum / minimum /
 * disjunction / negation) are read from MYCELA.Schemas. Nothing about a
 * specific bearing family is hardcoded here — adding a brand, type,
 * clearance grade, alias or family code is a data edit in
 * schemas/bearing.schema.json.
 *
 * Reads EnvironmentRules and ApplicationRules from MYCELA.SearchEngine (rules.js).
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // ── Schema access ─────────────────────────────────────────────────────────
  function schema() {
    var S = ns.Schemas;
    if (!S) return null;
    return (S.get && (S.get('bearing') || (S.primary && S.primary()))) || null;
  }
  function fieldOf(name) {
    var s = schema();
    return (s && s.fields && s.fields[name]) || null;
  }
  function modWords(kind) {
    var s = schema();
    return (((s && s.modifiers && s.modifiers[kind]) || {}).words || [])
      .map(function (w) { return String(w).toLowerCase(); });
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function byLenDesc(a, b) { return b.length - a.length; }

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

  function termMatches(term, q) {
    var body = escapeRe(term).replace(/\\?\s+/g, '\\s+');
    return new RegExp('(?:^|[^a-z0-9])' + body + '(?![a-z0-9])', 'i').test(q);
  }

  function brandAliasSet() {
    var set = {};
    choiceTerms('brand').forEach(function (x) { set[x.term] = 1; });
    return set;
  }

  // ── Choice-field parsing: {accept:[], exclude:[]} ────────────────────────
  //   - disjunction ("metal or seal") naturally yields multiple accepts
  //   - a negation word within ~3 words before an alias moves it to exclude
  //   - for a multi:true field, an explicit accept list excludes the rest
  function choiceRich(fieldName, text) {
    var f = fieldOf(fieldName);
    if (!f || !f.values) return null;
    var neg = modWords('negation');
    var terms = choiceTerms(fieldName);
    var work = ' ' + String(text).toLowerCase() + ' ';
    var accept = [], exclude = [];
    terms.forEach(function (t) {
      var body = escapeRe(t.term).replace(/\\?\s+/g, '\\s+');
      var re = new RegExp('(^|[^a-z0-9])(' + body + ')(?![a-z0-9])', 'ig');
      var mm, guard = 0;
      while ((mm = re.exec(work)) && guard++ < 40) {
        var at = mm.index + mm[1].length;
        var preWords = work.slice(0, mm.index).split(/[^a-z]+/).filter(Boolean).slice(-3);
        var negated = preWords.some(function (w) { return neg.indexOf(w) !== -1; });
        (negated ? exclude : accept).push(t.value);
        var end = at + mm[2].length;
        work = work.slice(0, at) + new Array(mm[2].length + 1).join(' ') + work.slice(end);
        re.lastIndex = end;
      }
    });
    accept = accept.filter(function (v, i) { return accept.indexOf(v) === i && exclude.indexOf(v) === -1; });
    exclude = exclude.filter(function (v, i) { return exclude.indexOf(v) === i; });
    if (!accept.length && !exclude.length) return null;
    return { accept: accept, exclude: exclude };
  }

  // ── Designation extraction ───────────────────────────────────────────────
  // Parse ONE identifier (a query, or a catalog pn) into its designation:
  //   { family, core, suffix, normalized }  |  null
  ns.SearchEngine.designationOf = function (str) {
    if (str == null) return null;
    var d = (schema() && schema().designation) || {};
    var corePat = new RegExp(d.core_pattern || '^([a-z]{0,5})([0-9]{3,5})([a-z0-9/-]*)$', 'i');
    var trimStarts = d.trim_5_digit_core_when_suffix_starts || ['rs', 'z', 'rz'];
    var families = {};
    (d.family_codes || []).forEach(function (f) { families[String(f).toLowerCase()] = 1; });
    var brands = brandAliasSet();

    var toks = String(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (brands[t]) continue;
      var stripped = t;
      Object.keys(brands).forEach(function (bp) {
        if (stripped.length > bp.length && stripped.slice(0, bp.length) === bp &&
            /[0-9]/.test(stripped.charAt(bp.length))) {
          stripped = stripped.slice(bp.length);
        }
      });
      var mm = corePat.exec(stripped);
      if (!mm) continue;
      var family = (mm[1] || '').toLowerCase();
      var core = mm[2];
      var suffix = (mm[3] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!family) {
        var prev = i > 0 ? toks[i - 1] : '';
        if (prev && /^[a-z]{1,5}$/.test(prev) && families[prev] && !brands[prev]) family = prev;
      }
      for (var j = i + 1; j < toks.length; j++) {
        if (/^[a-z0-9]{1,5}$/.test(toks[j]) && !/^[0-9]{3,}$/.test(toks[j])) suffix += toks[j];
        else break;
      }
      if (core.length === 5) {
        for (var k = 0; k < trimStarts.length; k++) {
          if (suffix.indexOf(trimStarts[k]) === 0) { core = core.slice(0, 4); break; }
        }
      }
      return { family: family, core: core, suffix: suffix, normalized: family + core };
    }
    return null;
  };

  // ── Units (words from the schema) ────────────────────────────────────────
  function unitAlternation() {
    var s = schema(), words = ['mm', 'cm', 'm', 'meter', 'meters'];
    if (s && s.units) {
      Object.keys(s.units).forEach(function (k) {
        if (k === 'conversion_to_mm') return;
        words.push(k);
        (s.units[k] || []).forEach(function (w) { words.push(String(w).toLowerCase()); });
      });
    }
    words = words.filter(function (w, i) { return w && words.indexOf(w) === i; }).sort(byLenDesc);
    return '(?:' + words.map(escapeRe).join('|') + ')';
  }
  function unitFactor(u) {
    if (!u) return 1;
    u = u.toLowerCase().replace(/[^a-z"']/g, '');
    var s = schema();
    if (s && s.units) {
      var conv = s.units.conversion_to_mm || {};
      var keys = Object.keys(s.units).filter(function (k) { return k !== 'conversion_to_mm'; });
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var w = (s.units[k] || []).map(function (x) { return String(x).toLowerCase().replace(/[^a-z"']/g, ''); });
        if (k === u || w.indexOf(u) !== -1) return conv[k] != null ? conv[k] : 1;
      }
    }
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
    return v;
  }

  // ── Numeric-field parsing: {prefer?, min?, max?} ─────────────────────────
  function modAlternation(kind) {
    var w = modWords(kind).filter(function (x) { return x !== '~'; });
    if (kind === 'approximate') w.push('~');
    return w.length ? '(?:' + w.map(function (x) { return escapeRe(x).replace(/\s+/g, '\\s+'); }).join('|') + ')' : '(?!)';
  }
  // rangeIntro / rangeSep derived from schema.modifiers.range.patterns ({a}/{b})
  function rangeParts() {
    var pats = (((schema() || {}).modifiers || {}).range || {}).patterns || [];
    var intro = ['between', 'from', 'range', 'in\\s*range', 'range\\s*of'];
    var sep = ['to', 'and', '-', '\\.\\.', 'till', 'upto', 'up\\s*to', 'thru', 'through'];
    pats.forEach(function (p) {
      var mm = /^(.*?)\{a\}(.*?)\{b\}(.*)$/.exec(String(p).toLowerCase());
      if (!mm) return;
      var pre = mm[1].trim(), mid = mm[2].trim();
      if (pre) intro.push(escapeRe(pre).replace(/\s+/g, '\\s*'));
      if (mid) sep.push(escapeRe(mid).replace(/\s+/g, '\\s*'));
    });
    return {
      intro: '(?:' + intro.filter(function (v, i) { return intro.indexOf(v) === i; }).join('|') + ')',
      sep: '(?:' + sep.filter(function (v, i) { return sep.indexOf(v) === i; }).join('|') + ')',
    };
  }

  function parseNumericFields(q) {
    var out = {};
    var NUM = '([0-9]*\\.?[0-9]+)';
    var UNIT = '(' + unitAlternation() + ')?';
    var rp = rangeParts();
    var approx = modAlternation('approximate');
    var mx = modAlternation('maximum');
    var mn = modAlternation('minimum');
    var tol = ((((schema() || {}).modifiers || {}).approximate || {}).tolerance_pct) || 5;
    var work = ' ' + q + ' ';

    var fields = ['bore', 'od', 'width'].filter(fieldOf);
    var aliasAlt = {};
    fields.forEach(function (fn) {
      var al = (fieldOf(fn).aliases || [])
        .map(function (a) { return String(a).toLowerCase(); })
        .filter(function (a) { return a.length >= 2; })
        .sort(byLenDesc);
      aliasAlt[fn] = '\\b(?:' + al.map(function (a) { return escapeRe(a).replace(/\s+/g, '\\s+'); }).join('|') + ')\\b';
    });

    function set(fn, patch) {
      var o = out[fn] || (out[fn] = {});
      if (patch.prefer != null && !isNaN(patch.prefer)) o.prefer = patch.prefer;
      if (patch.min != null && !isNaN(patch.min)) o.min = patch.min;
      if (patch.max != null && !isNaN(patch.max)) o.max = patch.max;
    }
    function blank(mm) {
      work = work.slice(0, mm.index) + new Array(mm[0].length + 1).join('\x01') + work.slice(mm.index + mm[0].length);
    }
    function runAll(re, handler) {
      var mm, guard = 0;
      re.lastIndex = 0;
      while ((mm = re.exec(work)) && guard++ < 40) {
        handler(mm);
        blank(mm);
        re.lastIndex = mm.index + mm[0].length;
      }
    }

    // Phase A — ranges: "od (can be) 30 to 25", "od between 40 and 50",
    // and range-before-label "40 to 50 mm od".
    function applyRange(fn, mm) {
      var a = toMM(parseFloat(mm[1]), mm[2]), b = toMM(parseFloat(mm[3]), mm[4]);
      set(fn, { min: Math.min(a, b), max: Math.max(a, b) });
    }
    fields.forEach(function (fn) {
      runAll(new RegExp(
        aliasAlt[fn] + '\\s*(?:can\\s+be|could\\s+be|of|:)?\\s*(?:' + rp.intro + '\\s+)?' +
        NUM + '\\s*' + UNIT + '\\s*' + rp.sep + '\\s*' + NUM + '\\s*' + UNIT, 'ig'),
        function (mm) { applyRange(fn, mm); });
    });
    fields.forEach(function (fn) {
      runAll(new RegExp(
        '(?:' + rp.intro + '\\s+)?' + NUM + '\\s*' + UNIT + '\\s*' + rp.sep + '\\s*' +
        NUM + '\\s*' + UNIT + '\\s*' + aliasAlt[fn], 'ig'),
        function (mm) { applyRange(fn, mm); });
    });

    // ── Label-anchored pairing for what the range phase left unclaimed ──────
    // Each dimension label ("bore", "od", "width", …) takes the number
    // immediately to its LEFT if there is one ("25 bore", "72mm od"),
    // otherwise the number immediately to its RIGHT ("bore 25", "od = 52").
    // Labels are processed in query order and a number is claimed once, so
    // "25 bore 52 od 15 wide" reads 25 / 52 / 15 and "id 25 od 52" reads
    // 25 / 52 (not od=25).
    var unitRe = new RegExp('^\\s*' + unitAlternation() + '?\\s*$', 'i');
    var unitAfterRe = new RegExp('^\\s*(' + unitAlternation() + ')', 'i');
    var gapRightRe = new RegExp('^[\\s:=~@-]*(?:of|is|are|be|should\\s+be)?[\\s]*(?:' +
      approx + '|' + mx + '|' + mn + ')?[\\s]*$', 'i');
    var modBeforeRe = new RegExp('(' + approx + '|' + mx + '|' + mn + ')[\\s]*$', 'i');
    var isApprox = new RegExp('^(?:' + approx + ')$', 'i');
    var isMax = new RegExp('^(?:' + mx + ')$', 'i');
    var isMin = new RegExp('^(?:' + mn + ')$', 'i');

    var nums = [];
    var nRe = /[0-9]*\.?[0-9]+/g, nm;
    while ((nm = nRe.exec(work))) nums.push({ i: nm.index, len: nm[0].length, v: parseFloat(nm[0]), used: false });

    var labels = [];
    fields.forEach(function (fn) {
      var re = new RegExp(aliasAlt[fn], 'ig'), lm;
      while ((lm = re.exec(work))) labels.push({ i: lm.index, len: lm[0].length, fn: fn });
    });
    labels.sort(function (a, b) { return a.i - b.i; });

    labels.forEach(function (lab) {
      var chosen = null, side = null;
      // nearest unused number to the LEFT
      for (var a = nums.length - 1; a >= 0; a--) {
        var n = nums[a];
        if (n.used || n.i + n.len > lab.i) continue;
        if (unitRe.test(work.slice(n.i + n.len, lab.i))) { chosen = n; side = 'L'; break; }
        break;
      }
      // else nearest unused number to the RIGHT
      if (!chosen) {
        for (var b = 0; b < nums.length; b++) {
          var m2 = nums[b];
          if (m2.used || m2.i < lab.i + lab.len) continue;
          if (gapRightRe.test(work.slice(lab.i + lab.len, m2.i))) { chosen = m2; side = 'R'; }
          break;
        }
      }
      if (!chosen) return;
      chosen.used = true;
      var unit = '';
      var ua = unitAfterRe.exec(work.slice(chosen.i + chosen.len));
      if (ua) unit = ua[1];
      var pre = work.slice(Math.max(0, chosen.i - 16), chosen.i);
      var mb = modBeforeRe.exec(pre);
      var mod = mb ? mb[1] : '';
      var v = toMM(chosen.v, unit);
      if (mod && isApprox.test(mod)) set(lab.fn, { prefer: v, min: v * (1 - tol / 100), max: v * (1 + tol / 100) });
      else if (mod && isMax.test(mod)) set(lab.fn, { max: v });
      else if (mod && isMin.test(mod)) set(lab.fn, { min: v });
      else set(lab.fn, { prefer: v });
      var s = Math.min(lab.i, chosen.i), e = Math.max(lab.i + lab.len, chosen.i + chosen.len);
      work = work.slice(0, s) + new Array(e - s + 1).join('\x01') + work.slice(e);
    });

    // Finalise: a bare preferred value with no range becomes prefer==min==max;
    // drop a field that ended up with nothing.
    Object.keys(out).forEach(function (fn) {
      var o = out[fn];
      if (o.min == null && o.max == null && o.prefer != null) { o.min = o.prefer; o.max = o.prefer; }
      if (o.prefer == null && o.min == null && o.max == null) delete out[fn];
    });
    return { fields: out, leftover: work };
  }

  // Load / speed vocabulary is not a schema field; keep the compact scalar
  // extraction and only report the numbers it claims.
  function parseLoads(q, claimed) {
    var p = {}, m;
    var rpmP = /([0-9,]+)\s*(?:rpm|r\.?p\.?m\.?|rev(?:s|olution)?s?\s*(?:per|\/)\s*min(?:ute)?)/gi;
    while ((m = rpmP.exec(q))) { p.rpm = parseInt(m[1].replace(/,/g, ''), 10); claimed.add(+m[1].replace(/,/g, '')); }
    var rL = /([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)\s*radial(?:\s+(?:load|force))?/gi;
    while ((m = rL.exec(q))) { p.cr_min = toKN(parseFloat(m[1]), m[2]); claimed.add(+m[1]); }
    var rL2 = /radial(?:\s+(?:load|force))?\s+(?:of\s+)?([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)/gi;
    while ((m = rL2.exec(q))) { p.cr_min = toKN(parseFloat(m[1]), m[2]); claimed.add(+m[1]); }
    var aL = /([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)\s*(?:axial(?:\s+(?:load|force))?|thrust)/gi;
    while ((m = aL.exec(q))) { p.c0r_min = toKN(parseFloat(m[1]), m[2]); claimed.add(+m[1]); }
    var aL2 = /(?:axial(?:\s+(?:load|force))?|thrust)\s+(?:of\s+)?([0-9]*\.?[0-9]+)\s*(kg|kgf|kn|n\b|lbs?)/gi;
    while ((m = aL2.exec(q))) { p.c0r_min = toKN(parseFloat(m[1]), m[2]); claimed.add(+m[1]); }
    return p;
  }

  // ── Token cleaning ──────────────────────────────────────────────────────
  var STOPWORDS = [
    'a','an','the','for','with','want','need','find','get','show','me','i',
    'please','should','be','can','could','that','will','work','is','are','was',
    'have','has','something','suitable','conditions','use','used','of','to','in',
    'on','at','and','or','but','my','it','this','these','type','grade','size',
    'rated','quality','either','any',
  ];
  function noiseSet() {
    var s = schema(), set = {};
    STOPWORDS.forEach(function (w) { set[w] = 1; });
    if (s) {
      Object.keys(s.fields || {}).forEach(function (fn) {
        (s.fields[fn].aliases || []).forEach(function (a) {
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
    ['load','force','axial','radial','thrust','speed','rpm','kg','kn','kgf','lbs','lb',
     'newton','revolutions','revolution','rev','min','minute'].forEach(function (w) { set[w] = 1; });
    return set;
  }

  // ── parse() ─────────────────────────────────────────────────────────────
  ns.SearchEngine.parse = function (raw) {
    var q = String(raw).toLowerCase().trim();
    var p = { tokens: [], apps: [], typeHints: [], envNotes: [], rawQ: q };
    var claimed = new Set();

    // Compact "15x32x9" / "15×32×9"
    var compact = /^([0-9]+(?:\.[0-9]+)?)[x×]([0-9]+(?:\.[0-9]+)?)[x×]([0-9]+(?:\.[0-9]+)?)$/i
      .exec(q.replace(/\s/g, ''));
    if (compact) {
      var mk = function (v) { v = parseFloat(v); return { prefer: v, min: v, max: v }; };
      p.bore = mk(compact[1]); p.od = mk(compact[2]); p.width = mk(compact[3]);
      return p;
    }

    // Numeric fields
    var num = parseNumericFields(q);
    if (num.fields.bore)  p.bore  = num.fields.bore;
    if (num.fields.od)    p.od    = num.fields.od;
    if (num.fields.width) p.width = num.fields.width;

    // Load / speed scalars
    var loads = parseLoads(q, claimed);
    if (loads.rpm != null)     p.rpm     = loads.rpm;
    if (loads.cr_min != null)  p.cr_min  = loads.cr_min;
    if (loads.c0r_min != null) p.c0r_min = loads.c0r_min;

    // Designation (found anywhere in the query)
    p.designation = ns.SearchEngine.designationOf(q) || undefined;

    // Environment rules
    var envSealing = null;
    ns.SearchEngine.EnvironmentRules.forEach(function (env) {
      if (env.rx.test(q)) {
        if (env.sealing && !envSealing) envSealing = env.sealing;
        if (env.typeHints) p.typeHints.push.apply(p.typeHints, env.typeHints);
        if (env.appHint && p.apps.indexOf(env.appHint) === -1) p.apps.push(env.appHint);
        if (env.note) p.envNotes.push(env.note);
      }
    });

    // Application rules
    ns.SearchEngine.ApplicationRules.forEach(function (pair) {
      if (pair[0].test(q) && p.apps.indexOf(pair[1]) === -1) p.apps.push(pair[1]);
    });

    // Choice fields
    p.type = choiceRich('type', q) || undefined;
    p.brand = choiceRich('brand', q) || undefined;
    p.clearance = choiceRich('clearance', q) || undefined;

    // Sealing: explicit query terms + designation suffix, then multi-exclude,
    // then environment inference as a fallback.
    var sealing = choiceRich('sealing', q);
    if (p.designation && p.designation.suffix) {
      var sfx = choiceRich('sealing', ' ' + p.designation.suffix + ' ');
      if (sfx && sfx.accept.length) {
        sealing = sealing || { accept: [], exclude: [] };
        sfx.accept.forEach(function (v) {
          if (sealing.accept.indexOf(v) === -1 && sealing.exclude.indexOf(v) === -1) sealing.accept.push(v);
        });
      }
    }
    var sealF = fieldOf('sealing');
    if (sealing && sealF && sealF.multi && sealing.accept.length) {
      Object.keys(sealF.values).forEach(function (v) {
        if (sealing.accept.indexOf(v) === -1 && sealing.exclude.indexOf(v) === -1) sealing.exclude.push(v);
      });
    }
    if (!sealing && envSealing) sealing = { accept: [envSealing], exclude: [] };
    p.sealing = sealing || undefined;

    // PN tokens
    var NOISE = noiseSet();
    p.tokens = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (t) {
      if (t.length < 2) return false;
      if (NOISE[t]) return false;
      var n = parseFloat(t);
      if (!isNaN(n) && claimed.has(n)) return false;
      return true;
    });

    return p;
  };
})(window.MYCELA = window.MYCELA || {});
