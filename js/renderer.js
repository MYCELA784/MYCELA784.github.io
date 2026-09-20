/* PUBLIC API
 *   MYCELA.Renderer.cards(results, state) — render result grid
 *   MYCELA.Renderer.modal(id)             — open detail modal
 *   MYCELA.Renderer.closeModal()          — close modal (and compare view)
 *   MYCELA.Renderer.toggleCompare(id, on) — add/remove a bearing from compare
 *   MYCELA.Renderer.openCompare()         — open the compare table in #modal-compare
 *
 * The modal's load calculator is built here too (calcSectionHTML /
 * wireCalc), but it is display only — every number comes from
 * MYCELA.DGBBCalc, see js/dgbb_calc.js.
 */
(function (ns) {
  ns.Renderer = ns.Renderer || {};

  function brandBadge(brand) {
    const c = (ns.BRAND_COLORS && ns.BRAND_COLORS[brand]) || '#17150F';
    return `<span class="card-brand-badge" style="background:${c};color:#fff">${brand}</span>`;
  }

  // ── Grid card (article.item) ────────────────────────────────────────────────
  function specChip(label, value, unit) {
    if (value == null || value === '') return '';
    const val = unit ? `<b class="num">${value}</b><span class="u">${unit}</span>` : `<b>${value}</b>`;
    return `<span class="spec">${label} ${val}</span>`;
  }

  // "Same fit" uses the catalog's precomputed alt[] equivalents, not a fresh
  // dimension scan — findXrefs() below (used by the modal) does that instead.
  function altXrefs(b) {
    return (b.alt || []).map(id => ns.DB_MAP[id]).filter(Boolean);
  }

  // A result that only matched via the base-designation fallback (see
  // SearchEngine.isDesignationOnlyMatch) is the closest available part in
  // that family, not necessarily the sealing arrangement the buyer asked
  // for — flag it instead of presenting a different sealing type as exact.
  function sealingMismatchNote(b) {
    if (!b._designationOnly || !b._queriedSealing || !b.sealing) return '';
    if (b.sealing === b._queriedSealing) return '';
    return `<div class="xr">Closest match: ${b.sealing.toLowerCase()}, you searched ${b._queriedSealing.toLowerCase()}</div>`;
  }

  function cardHTML(b) {
    const xs    = altXrefs(b);
    const specs = [
      specChip('Bore', b.bore, 'mm'),
      specChip('OD',   b.od,   'mm'),
      specChip('Width', b.w,   'mm'),
      specChip('Sealing', b.sealing, null),
      (b.cr != null ? specChip('Cr', b.cr, 'kN') : specChip('Cr', 'not verified', null)),
    ].join('');
    return `<article class="item">
      <div class="item-top">
        <div><div class="pn">${b.pn}</div><div class="brandline">${brandBadge(b.brand)} ${b.type || ''}</div></div>
        <span class="catlab">Bearing</span>
        <input type="checkbox" class="cmp-chk" data-cmp="${b.id}" ${ns._cmp && ns._cmp.has(b.id) ? 'checked' : ''} title="Add to compare">
      </div>
      <div class="specs">${specs}</div>
      ${sealingMismatchNote(b)}
      ${xs.length ? `<div class="xr">Same fit from ${xs.map(x => `<button data-x="${x.pn}">${x.brand} <span class="p">${x.pn}</span></button>`).join(', ')}</div>` : ''}
      <div class="item-act">
        <button class="btn btn-sm${ns.Basket && ns.Basket.has(b.id) ? ' added' : ''}" data-add="${b.id}">${ns.Basket && ns.Basket.has(b.id) ? 'Added to list' : 'Add to list'}</button>
        <button class="ghost" data-info="${b.id}">Details</button>
      </div>
    </article>`;
  }

  // state: { filters: { brand: Set, sealing: Set }, title, sub }
  ns.Renderer.cards = function (results, state) {
    ns._lastResults = results;
    ns._lastState   = state;
    const grid    = document.getElementById('grid');
    const resWrap = document.getElementById('results');
    const rTitle  = document.getElementById('rTitle');
    const rSub    = document.getElementById('rSub');
    const fbody   = document.getElementById('fbody');
    if (!grid || !resWrap) return;

    const baseList = results || [];
    const filters  = (state && state.filters) || {};
    const fBrand   = filters.brand;
    const fSeal    = filters.sealing;

    const filtered = baseList.filter(b =>
      (!fBrand || !fBrand.size || fBrand.has(b.brand)) &&
      (!fSeal  || !fSeal.size  || (b.sealing && fSeal.has(b.sealing))));

    resWrap.classList.add('on');

    // ── Filter rail (built from the full, unfiltered result set) ─────────────
    if (fbody) {
      const brands = {}, seals = {};
      baseList.forEach(b => {
        brands[b.brand] = (brands[b.brand] || 0) + 1;
        if (b.sealing) seals[b.sealing] = (seals[b.sealing] || 0) + 1;
      });
      const bKeys = Object.keys(brands).sort();
      const sKeys = Object.keys(seals).sort();
      let html = '';
      if (bKeys.length > 1) {
        html += `<div class="fgroup"><h4>Brand</h4>` + bKeys.map(k =>
          `<label class="frow"><input type="checkbox" data-fb="${k}" ${fBrand && fBrand.has(k) ? 'checked' : ''}>
           ${k}<span class="n">${brands[k]}</span></label>`).join('') + `</div>`;
      }
      if (sKeys.length > 1) {
        html += `<div class="fgroup"><h4>Sealing</h4>` + sKeys.map(k =>
          `<label class="frow"><input type="checkbox" data-fs="${k}" ${fSeal && fSeal.has(k) ? 'checked' : ''}>
           ${k}<span class="n">${seals[k]}</span></label>`).join('') + `</div>`;
      }
      const hasFilters = !!html;
      if ((fBrand && fBrand.size) || (fSeal && fSeal.size)) html += `<button class="fclear" id="fclear">Clear filters</button>`;
      fbody.innerHTML = html;
      resWrap.classList.toggle('norail', !hasFilters);
    }

    // ── Header ─────────────────────────────────────────────────────────────
    if (rTitle) {
      rTitle.textContent = (filtered.length !== baseList.length)
        ? `${filtered.length} of ${baseList.length}`
        : (state && state.title) || `${baseList.length} result${baseList.length === 1 ? '' : 's'}`;
    }
    if (rSub) rSub.textContent = (state && state.sub) || '';

    // ── Grid ───────────────────────────────────────────────────────────────
    grid.classList.toggle('few', filtered.length > 0 && filtered.length < 3);
    if (!filtered.length) {
      grid.innerHTML = `<div class="blank" style="grid-column:1/-1"><h3>${baseList.length ? 'Nothing matches those filters' : "We don't have that one yet"}</h3>
        <p>${baseList.length ? 'Try clearing a filter to widen the results.'
           : "Tell us what you're after and we'll source it, then add it to the catalogue for the next person looking."}</p>
        ${baseList.length ? '<button class="btn btn-line" id="fclear2">Clear filters</button>'
           : '<button class="btn" id="askBtn">Ask us to source it</button>'}</div>`;
      return;
    }
    grid.innerHTML = filtered.map(cardHTML).join('');
  };

  // ── Modal ──────────────────────────────────────────────────────────────────
  function decodeSuffixes(pn) {
    if (!ns.SUFFIX_CODES) return [];
    const tokens = pn.toUpperCase().split(/[-\/\s]+/).slice(1);
    const seen = new Set();
    const out = [];
    tokens.forEach(t => {
      const clean = t.trim();
      if (ns.SUFFIX_CODES[clean] && !seen.has(clean)) {
        seen.add(clean);
        out.push({ code: clean, desc: ns.SUFFIX_CODES[clean] });
      }
    });
    return out;
  }

  function findXrefs(b) {
    return ns.DB.filter(x =>
      x.id !== b.id &&
      x.bore != null && b.bore != null && Math.abs(x.bore - b.bore) < 0.5 &&
      x.od   != null && b.od   != null && Math.abs(x.od   - b.od)   < 0.5 &&
      x.w    != null && b.w    != null && Math.abs(x.w    - b.w)    < 0.5
    ).slice(0, 5);
  }

  function ensureSection(id, anchorId, position) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      const anchor = document.getElementById(anchorId);
      if (anchor) anchor.insertAdjacentElement(position, el);
    }
    return el;
  }

  // ── Load calculator (deep groove ball bearings, radial load only) ──────────
  // Arithmetic lives in MYCELA.DGBBCalc; this formats it and nothing else.
  // The section is rendered only for records DGBBCalc.supports() accepts —
  // a tapered roller, a thrust bearing or a row with no verified cr/c0r/rpm
  // gets no calculator at all rather than a broken one.

  // Null values read "not verified" and user-facing strings carry no em
  // dash, the same as every other string this renderer emits (see 61ef492).
  function fmtHours(h) {
    if (h == null || !isFinite(h)) return 'not computable';
    if (h >= 1e6) return (h / 1e6).toFixed(1) + ' million h';
    if (h >= 1000) return (Math.round(h / 100) * 100).toLocaleString() + ' h';
    return Math.round(h) + ' h';
  }
  function fmtN(v, d) { return (v == null || !isFinite(v)) ? 'not verified' : Number(v).toFixed(d); }
  // L10 spans orders of magnitude (a lightly loaded bearing runs to eight
  // figures of million revolutions), so group it rather than print it raw.
  function fmtMrev(v) {
    if (v == null || !isFinite(v)) return 'not computable';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: v >= 1e4 ? 0 : 1 });
  }
  function fmtRpm(v) { return (v == null || !isFinite(v)) ? 'not verified' : Number(v).toLocaleString() + ' rpm'; }

  function calcCheck(pass, headline, detail) {
    return `<div class="calc-check${pass ? '' : ' calc-flag'}">
        <span class="calc-mark">${pass ? '✓' : '✕'}</span>
        <div><b>${headline}</b><span class="calc-sub">${detail}</span></div>
      </div>`;
  }

  // DGBBCalc's own note strings cite pages of the SKF catalogue the formulas
  // were transcribed from. The rows here are also NTN and FAG, so those page
  // numbers would point a reader at the wrong book: same substance, said in
  // this site's own words instead.
  function speedNote(r) {
    if (r.speed.exceedsLimiting) return 'Past the mechanical limit of the bearing as catalogued.';
    if (r.speed.exceedsReference === null) return 'No reference speed is printed for this bearing, so the limiting speed is the only cap.';
    if (r.speed.exceedsReference) return 'Above the reference speed, so a detailed thermal analysis is recommended.';
    return 'Within the reference speed.';
  }

  function calcResultHTML(r) {
    const bg = r.bearing;

    const minDetail = r.minLoad.pass
      ? `Fr ${fmtN(r.Fr, 2)} kN is at or above Frm ${fmtN(r.minLoad.Frm, 3)} kN, the 0.01·Cr guideline.`
      : `Fr ${fmtN(r.Fr, 2)} kN is under Frm ${fmtN(r.minLoad.Frm, 3)} kN, the 0.01·Cr guideline. ` +
        `Too lightly loaded, the balls can skid and smear.`;

    const speedHead = r.speed.exceedsLimiting ? 'Above the limiting speed'
      : (r.speed.exceedsReference ? 'Under the limiting speed, over the reference speed' : 'Speed within limits');
    const speedDetail = `n ${fmtRpm(r.n)}. Limiting speed ${fmtRpm(bg.speedLim)}, ` +
      `reference speed ${bg.speedRef == null ? 'not printed' : fmtRpm(bg.speedRef)}. ${speedNote(r)}`;

    const working = [
      ['Equivalent dynamic load P', `${fmtN(r.P.P, 2)} kN (radial only, so P = Fr)`],
      ['C / P', fmtN(r.CoverP, 2)],
      ['L10 = (C/P)³', `${fmtMrev(r.life.L10)} million rev`],
      ['L10h = 10⁶ / (60 · n) · L10', fmtHours(r.life.basicHours)],
      ['Reliability a1 · life factor a_SKF', `${fmtN(r.life.a1, 0)} · ${fmtN(r.life.a_SKF, 0)}`],
      ['dm = 0.5 · (d + D)', `${fmtN(bg.dm, 1)} mm`],
      ['Frm = 0.01 · Cr', `${fmtN(r.minLoad.Frm, 3)} kN`],
      ['Ratings used', `Cr ${bg.Cr} kN, C0r ${bg.C0} kN`],
    ];

    return `<div class="calc-headline">
        <b class="calc-big">${fmtHours(r.life.value)}</b>
        <span class="calc-sub">${r.life.label} at Fr ${fmtN(r.Fr, 2)} kN and ${fmtRpm(r.n)}</span>
      </div>
      ${calcCheck(r.minLoad.pass, r.minLoad.pass ? 'Minimum load met' : 'Below the minimum load', minDetail)}
      ${calcCheck(r.speed.pass, speedHead, speedDetail)}
      <div class="calc-work-lbl">Working</div>
      <div class="calc-work">${working.map(([k, v]) =>
        `<div class="calc-work-row"><span>${k}</span><span class="calc-work-val">${v}</span></div>`).join('')}</div>`;
  }

  function calcSectionHTML() {
    return `<details class="calc" id="modal-calc">
      <summary class="calc-sum">Check this bearing for your load
        <span class="calc-sum-hint">rating life, minimum load, speed</span></summary>
      <div class="calc-body">
        <div class="calc-fields">
          <label class="calc-fld"><span>Radial load Fr</span>
            <input type="number" id="calc-fr" step="0.01" min="0" inputmode="decimal" placeholder="e.g. 2.65"><em>kN</em></label>
          <label class="calc-fld"><span>Speed n</span>
            <input type="number" id="calc-n" step="10" min="0" inputmode="numeric" placeholder="e.g. 1450"><em>rpm</em></label>
        </div>
        <button class="btn btn-sm" id="calc-run" type="button">Calculate</button>
        <div class="calc-out" id="calc-out"></div>
        <div class="calc-caveats">
          <p>Radial load only. Combined loading is not offered yet: it needs the calculation
             factor f0, and the database does not carry f0. f0 depends on ball diameter and
             ball count, so it cannot be worked out from bore, OD and width, and the
             calculator does not guess one.</p>
          <p>The minimum load check uses the 0.01 &middot; Cr guideline. The more precise
             method needs a minimum load factor kr, which is not in the database, and the
             viscosity of your lubricant at operating temperature.</p>
          <p>The result is the basic rating life L10h, at 90% reliability (a1 = 1) and with
             no life modification factor (a_SKF = 1). a_SKF is not calculated here, so this
             is not an SKF rating life.</p>
          <p>Indicative calculation, to be verified by the specifying engineer.</p>
        </div>
      </div>
    </details>`;
  }

  function wireCalc(b, box) {
    const frEl  = box.querySelector('#calc-fr');
    const nEl   = box.querySelector('#calc-n');
    const outEl = box.querySelector('#calc-out');
    const runEl = box.querySelector('#calc-run');
    if (!frEl || !nEl || !outEl || !runEl) return;

    function run() {
      const Fr = parseFloat(frEl.value);
      const n  = parseFloat(nEl.value);
      if (!(Fr > 0) || !(n > 0)) {
        outEl.innerHTML = `<div class="calc-msg">Enter a radial load and a speed, both above zero.</div>`;
        return;
      }
      try {
        outEl.innerHTML = calcResultHTML(ns.DGBBCalc.evaluate({ bearing: b, Fr, n }));
      } catch (e) {
        outEl.innerHTML = `<div class="calc-msg">${e.message}</div>`;
      }
    }
    runEl.addEventListener('click', run);
    [frEl, nEl].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') run(); }));
  }

  ns.Renderer.modal = function (id) {
    const b = ns.DB_MAP[id];
    if (!b) return;

    // Always land on the detail view, even if compare was showing last.
    const cmpEl    = document.getElementById('modal-compare');
    const detailEl = document.getElementById('modal-detail');
    if (cmpEl) cmpEl.classList.remove('open');
    if (detailEl) detailEl.style.display = '';

    const pnEl = document.getElementById('modal-pn');
    if (pnEl) pnEl.textContent = b.pn;

    const metaEl = document.getElementById('modal-meta');
    if (metaEl) {
      const c = (ns.BRAND_COLORS && ns.BRAND_COLORS[b.brand]) || '#17150F';
      metaEl.innerHTML =
        `<span class="card-brand-badge" style="background:${c};color:#fff">${b.brand}</span>
         &nbsp;·&nbsp; ${(ns.TI && ns.TI[b.type]) || ''} ${b.type}`;
    }

    // Suffix decoder (above specs)
    const sfx = decodeSuffixes(b.pn);
    const sfxBox = ensureSection('modal-suffix-box', 'modal-specs', 'beforebegin');
    if (sfx.length) {
      sfxBox.className = 'modal-suffix';
      sfxBox.innerHTML = `<div class="modal-suffix-lbl">SUFFIX DECODED</div>` +
        sfx.map(s => `<div><b>${s.code}</b> ${s.desc}</div>`).join('');
      sfxBox.style.display = '';
    } else {
      sfxBox.style.display = 'none';
    }

    // Specs grid. There is deliberately no "Max Axial Load" row: it was
    // c0r * 0.5 (or 0.25) computed here at display time, a deep groove
    // guideline shown as a per-bearing rating on every type. Removed; see
    // docs/data-quarantine.md Q10. tests/dgbb.js fails if an axial spec
    // label comes back.
    const specs = [
      ['Bore (d)',           b.bore != null ? `${b.bore} mm` : null],
      ['Outer Diameter (D)', b.od   != null ? `${b.od} mm`   : null],
      ['Width (B)',          b.w    != null ? `${b.w} mm`    : null],
      ['Sealing',            b.sealing || null],
      ['Dynamic Load Cr',    b.cr   != null ? `${b.cr} kN`   : 'not verified'],
      ['Static Load C0r',    b.c0r  != null ? `${b.c0r} kN`  : 'not verified'],
      ['Reference Speed',    b.speed_ref != null ? `${Number(b.speed_ref).toLocaleString()} rpm` : null],
      ['Limiting Speed',     b.rpm  != null ? `${Number(b.rpm).toLocaleString()} rpm` : null],
      ['Mass',               (b.mass != null && b.mass > 0)
                               ? (b.mass >= 1 ? `${b.mass.toFixed(2)} kg` : `${Math.round(b.mass * 1000)} g`)
                               : null],
    ];
    const specsEl = document.getElementById('modal-specs');
    if (specsEl) specsEl.innerHTML = specs
      .filter(([k, v]) => v != null)
      .map(([k, v]) => `<div class="spec-cell"><div class="spec-lbl">${k}</div><div class="spec-val">${v}</div></div>`)
      .join('');

    // Load calculator (under the specs, above the rest)
    const calcBox = ensureSection('modal-calc-wrap', 'modal-specs', 'afterend');
    if (ns.DGBBCalc && ns.DGBBCalc.supports(b)) {
      calcBox.style.display = '';
      calcBox.innerHTML = calcSectionHTML();
      wireCalc(b, calcBox);
    } else {
      calcBox.style.display = 'none';
      calcBox.innerHTML = '';
    }

    // Apps — hidden pending re-sourcing of the applications data. The audit
    // (docs/apps-type-audit.md) found the field wrong at scale, not just in
    // the 80 flagged rows, so nothing reads b.apps until it is re-imported.
    // Toggled on its wrapper the same way #modal-xref-wrap is.
    const appsWrap = document.getElementById('modal-apps-wrap');
    if (appsWrap) appsWrap.style.display = 'none';

// Cross-reference — reuse existing index.html section
    const xrefs = findXrefs(b);
    const xrefWrap = document.getElementById('modal-xref-wrap');
    const xrefEl   = document.getElementById('modal-xref');
    if (xrefWrap && xrefEl) {
      if (xrefs.length) {
        xrefWrap.style.display = '';
        xrefWrap.querySelector('.m-sec-lbl').textContent =
          `Cross-Reference · Same Size ${b.bore}×${b.od}×${b.w}`;
        xrefEl.innerHTML = xrefs.map(x => {
          const c = (ns.BRAND_COLORS && ns.BRAND_COLORS[x.brand]) || '#17150F';
          const safe = x.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `<button class="xref-chip" onclick="openModal('${safe}')">
            <span class="xref-chip-brand" style="background:${c}">${x.brand}</span>
            ${x.pn} · ${x.cr != null ? x.cr + ' kN' : 'not verified'}</button>`;
        }).join('');
      } else {
        xrefWrap.style.display = 'none';
      }
    }

    // Actions + source (after xref)
    const actBox = ensureSection('modal-actions-box', 'modal-xref-wrap', 'afterend');
    ns._modalId = b.id;
    actBox.innerHTML =
      `<div class="modal-actions">
         ${ns.Basket ? ns.Basket.modalBtnHTML(b) : ''}
       </div>
       <div class="modal-source">Source: ${b.source || 'Official manufacturer catalog'}</div>`;
       // Copy PN button in header, next to Close
    let copyBtn = document.getElementById('modal-copy-hdr');
    if (!copyBtn) {
      copyBtn = document.createElement('button');
      copyBtn.id = 'modal-copy-hdr';
      copyBtn.className = 'modal-copy';
      const closeBtn = document.querySelector('.modal-close');
      if (closeBtn) closeBtn.insertAdjacentElement('beforebegin', copyBtn);
    }
    copyBtn.innerHTML = '⧉ Copy PN';
    copyBtn.onclick = function () { window.copyPN(b.brand + ' ' + b.pn, copyBtn); };
    document.getElementById('modal-overlay').classList.add('open');
  };

  ns.Renderer.closeModal = function () {
    const ov = document.getElementById('modal-overlay');
    if (ov) ov.classList.remove('open');
    const cmpEl    = document.getElementById('modal-compare');
    const detailEl = document.getElementById('modal-detail');
    if (cmpEl) cmpEl.classList.remove('open');
    if (detailEl) detailEl.style.display = '';
  };
  ns.Renderer.aiBox = function (text, tips) {
    const box = document.getElementById('ai-box');
    if (!box) return;
    const txtEl = document.getElementById('ai-box-text');
    if (txtEl) txtEl.textContent = text || '';
    const tipsEl = document.getElementById('ai-tips-row');
    if (tipsEl && tips && tips.length) {
      tipsEl.innerHTML = tips.map(t =>
        `<button class="ai-tip" onclick="quickSearch('${String(t).replace(/'/g, "\\'")}')">${t}</button>`
      ).join('');
    }
    box.style.display = text ? '' : 'none';
  };
  ns.Renderer.filterBar = function (show) {
    const bar = document.getElementById('filter-bar');
    if (bar) bar.style.display = show ? '' : 'none';
  };
  // ── Compare ──────────────────────────────────────────────────────────────
  ns._cmp = new Set();

  function updateCompareBtn() {
    const btn = document.getElementById('compareBtn');
    if (!btn) return;
    const n = ns._cmp.size;
    btn.textContent = `Compare (${n})`;
    btn.disabled = n < 2;
    btn.style.display = n ? '' : 'none';
  }

  ns.Renderer.toggleCompare = function (id, on) {
    if (on) ns._cmp.add(id); else ns._cmp.delete(id);
    updateCompareBtn();
  };

  ns.Renderer.openCompare = function () {
    const bs = Array.from(ns._cmp).map(i => ns.DB_MAP[i]).filter(Boolean).slice(0, 4);
    if (bs.length < 2) return;
    const rows = [
      ['Brand',    b => b.brand],
      ['Type',     b => b.type],
      ['Bore',     b => b.bore + ' mm'],
      ['OD',       b => b.od + ' mm'],
      ['Width',    b => b.w + ' mm'],
      ['Cr',       b => b.cr  != null ? b.cr  + ' kN' : 'not verified'],
      ['C0r',      b => b.c0r != null ? b.c0r + ' kN' : 'not verified'],
      ['Limiting speed', b => b.rpm ? Number(b.rpm).toLocaleString() + ' rpm' : 'not verified'],
      ['Sealing',  b => b.sealing || 'not verified'],
      ['Source',   b => b.source || 'not verified'],
    ];
    const cmpEl    = document.getElementById('modal-compare');
    const detailEl = document.getElementById('modal-detail');
    if (!cmpEl) return;
    cmpEl.innerHTML =
      `<div class="modal-top"><div class="modal-pn">Compare (${bs.length})</div>
       <button class="modal-close" onclick="closeModalDirect()">Close</button></div>
       <div style="overflow-x:auto"><table class="cmp-table"><tr><th></th>` +
      bs.map(b => `<th>${b.pn}</th>`).join('') + '</tr>' +
      rows.map(([lbl, fn]) =>
        `<tr><td class="cmp-lbl">${lbl}</td>` + bs.map(b => `<td>${fn(b)}</td>`).join('') + '</tr>'
      ).join('') +
      '</table></div>';
    if (detailEl) detailEl.style.display = 'none';
    cmpEl.classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
  };

  window.setSort = function (v) {
    ns._sort = v;
    ns.Renderer.cards(ns._lastResults, ns._lastState);
  };

  window.copyPN = function (text, btn) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  };
})(window.MYCELA = window.MYCELA || {});