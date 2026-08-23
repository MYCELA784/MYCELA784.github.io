/* PUBLIC API
 *   MYCELA.Renderer.cards(results, state) — render result grid
 *   MYCELA.Renderer.modal(id)             — open detail modal
 *   MYCELA.Renderer.closeModal()          — close modal
 */
(function (ns) {
  ns.Renderer = ns.Renderer || {};

  function matchBadge(mt) {
    if (mt === 'PN')   return '<span class="match-badge">PN</span>';
    if (mt === 'DIMS') return '<span class="match-badge">DIMS</span>';
    if (mt === 'APP')  return '<span class="match-badge">APP</span>';
    return '';
  }

  function brandBadge(brand) {
    const c = (ns.BRAND_COLORS && ns.BRAND_COLORS[brand]) || '#17150F';
    return `<span class="card-brand-badge" style="background:${c};color:#fff">${brand}</span>`;
  }

  function cardHTML(b) {
    const badge  = matchBadge(b._matchType);
    const crVal  = b.cr != null ? `Cr <b>${b.cr}</b> kN` : '';
    const safeId = b.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const icon   = (ns.TI && ns.TI[b.type]) || '';
    const hasXref = b.alt && b.alt.length > 0;
    return `<div class="part-card" onclick="openModal('${safeId}')">
      <div class="card-top">
        <div class="card-pn">${b.pn}</div>
        <div class="card-type-badge">${icon} ${b.type}</div>
        <input type="checkbox" class="cmp-chk" ${ns._cmp && ns._cmp.has(b.id) ? 'checked' : ''} onclick="event.stopPropagation();toggleCompare('${safeId}', this)" title="Add to compare">
      </div>
      <div class="card-brand-row">
        ${brandBadge(b.brand)}${badge}
      </div>
      <div class="card-dims">
        <div><div class="dim-lbl">Bore</div><div class="dim-val">${b.bore}<span class="dim-unit">mm</span></div></div>
        <div><div class="dim-lbl">OD</div><div class="dim-val">${b.od}<span class="dim-unit">mm</span></div></div>
        <div><div class="dim-lbl">Width</div><div class="dim-val">${b.w}<span class="dim-unit">mm</span></div></div>
      </div>
      <div class="card-cr-row"><span class="card-cr-val">${crVal}</span><span class="card-seal">${b.sealing || ''}</span></div>
      <div class="card-inq-row" id="cardbtn-${b.id}">${ns.Basket ? ns.Basket.btnHTML(b) : ''}</div>
    </div>`;
  }

ns.Renderer.cards = function (results, state) {
    ns._lastResults = results;
    ns._lastState   = state;
    const countEl = document.getElementById('results-count');
    const el      = document.getElementById('results-area');
    if (!el) return;

    let filtered = (results || []).slice();
    if (state && state.tf && state.tf !== 'All')
      filtered = filtered.filter(b => b.type === state.tf);
    if (state && state.bf && state.bf !== 'All')
      filtered = filtered.filter(b => b.brand === state.bf);

    const s = ns._sort || 'score';
    filtered.sort((a, b) => {
      if (s === 'cr')    return (b.cr || 0) - (a.cr || 0);
      if (s === 'bore')  return (a.bore || 0) - (b.bore || 0);
      if (s === 'brand') return (a.brand || '').localeCompare(b.brand || '');
      return (b._score || 0) - (a._score || 0);
    });

    const n = ns._cmp ? ns._cmp.size : 0;
    if (countEl) {
      countEl.style.display = '';
      countEl.innerHTML =
        `Showing <b>${filtered.length}</b> results from <b>${ns.DB.length.toLocaleString()}</b> indexed bearings
         <span class="results-tools">
           <select id="sort-select" onchange="setSort(this.value)">
             <option value="score" ${s==='score'?'selected':''}>Relevance</option>
             <option value="cr"    ${s==='cr'?'selected':''}>Load rating</option>
             <option value="bore"  ${s==='bore'?'selected':''}>Bore size</option>
             <option value="brand" ${s==='brand'?'selected':''}>Brand</option>
           </select>
           <button id="compare-btn" onclick="openCompare()" ${n<2?'disabled':''} style="display:${n?'':'none'}">Compare (${n})</button>
         </span>`;
    }

    if (!filtered.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">◌</div>
        <div class="empty-title">No bearings found</div>
        <div class="empty-sub">Try a different part number, dimensions, or application.</div>
      </div>`;
      return;
    }
    el.innerHTML = '<div class="results-grid">' + filtered.map(cardHTML).join('') + '</div>';
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
         <button class="modal-btn-sup" onclick="closeModalDirect();showPage('suppliers')">Find Suppliers</button>
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
  // ── Compare + helpers ──────────────────────────────────────────────────────
  ns._cmp = new Set();

  window.toggleCompare = function (id, el) {
    if (el.checked) ns._cmp.add(id); else ns._cmp.delete(id);
    const btn = document.getElementById('compare-btn');
    if (btn) {
      btn.textContent = `Compare (${ns._cmp.size})`;
      btn.disabled = ns._cmp.size < 2;
      btn.style.display = ns._cmp.size ? '' : 'none';
    }
  };

  window.openCompare = function () {
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
    const el = document.getElementById('results-area');
    el.innerHTML =
      '<button class="card-btn cmp-back" onclick="MYCELA.Renderer.cards(MYCELA._lastResults, MYCELA._lastState)">← Back to results</button>' +
      '<div style="overflow-x:auto"><table class="cmp-table"><tr><th></th>' +
      bs.map(b => `<th>${b.pn}</th>`).join('') + '</tr>' +
      rows.map(([lbl, fn]) =>
        `<tr><td class="cmp-lbl">${lbl}</td>` + bs.map(b => `<td>${fn(b)}</td>`).join('') + '</tr>'
      ).join('') +
      '</table></div>';
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