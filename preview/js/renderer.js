/* PUBLIC API
 *   MYCELA.Renderer.cards(results, state) — render result grid
 *   MYCELA.Renderer.modal(id)             — open detail modal
 *   MYCELA.Renderer.closeModal()          — close modal (and compare view)
 *   MYCELA.Renderer.toggleCompare(id, on) — add/remove a bearing from compare
 *   MYCELA.Renderer.openCompare()         — open the compare table in #modal-compare
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

  function cardHTML(b) {
    const xs    = altXrefs(b);
    const specs = [
      specChip('Bore', b.bore, 'mm'),
      specChip('OD',   b.od,   'mm'),
      specChip('Width', b.w,   'mm'),
      specChip('Sealing', b.sealing, null),
      specChip('Cr', b.cr, 'kN'),
    ].join('');
    return `<article class="item">
      <div class="item-top">
        <div><div class="pn">${b.pn}</div><div class="brandline">${brandBadge(b.brand)} ${b.type || ''}</div></div>
        <span class="catlab">Bearing</span>
        <input type="checkbox" class="cmp-chk" data-cmp="${b.id}" ${ns._cmp && ns._cmp.has(b.id) ? 'checked' : ''} title="Add to compare">
      </div>
      <div class="specs">${specs}</div>
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
        sfx.map(s => `<div><b>${s.code}</b> — ${s.desc}</div>`).join('');
      sfxBox.style.display = '';
    } else {
      sfxBox.style.display = 'none';
    }

    // Specs grid
    const axial = (function () {
      if (!b.c0r) return null;
      const p = (b.pn || '');
      const factor = /^6[12][89]/.test(p) || /^600/.test(p) ? 0.25 : 0.5;
      return (b.c0r * factor).toFixed(2) + ' kN';
    })();

    const specs = [
      ['Bore (d)',           b.bore != null ? `${b.bore} mm` : null],
      ['Outer Diameter (D)', b.od   != null ? `${b.od} mm`   : null],
      ['Width (B)',          b.w    != null ? `${b.w} mm`    : null],
      ['Sealing',            b.sealing || null],
      ['Dynamic Load Cr',    b.cr   != null ? `${b.cr} kN`   : null],
      ['Static Load C0r',    b.c0r  != null ? `${b.c0r} kN`  : null],
      ['Max Axial Load',     axial],
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

    // Apps
    const appsEl = document.getElementById('modal-apps');
    if (appsEl) appsEl.innerHTML =
      (b.apps || []).map(a => `<span class="app-tag">${a}</span>`).join('');

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
            ${x.pn} · ${x.cr != null ? x.cr : '—'} kN</button>`;
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
       <div class="modal-actions"><button class="modal-btn-wa" disabled title="Coming soon">WhatsApp Inquiry — Coming Soon</button></div>
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
      ['Cr',       b => (b.cr  != null ? b.cr  : '—') + ' kN'],
      ['C0r',      b => (b.c0r != null ? b.c0r : '—') + ' kN'],
      ['Limiting speed', b => b.rpm ? Number(b.rpm).toLocaleString() + ' rpm' : '—'],
      ['Sealing',  b => b.sealing || '—'],
      ['Source',   b => b.source || '—'],
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