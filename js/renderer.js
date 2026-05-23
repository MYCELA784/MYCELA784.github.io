/* PUBLIC API
 *   MYCELA.Renderer.cards(results, state)  — renders result grid
 *   MYCELA.Renderer.modal(bearingId)       — opens detail modal
 *   MYCELA.Renderer.closeModal()           — closes modal
 *   MYCELA.Renderer.filterBar(show)        — shows/hides filter bar
 *   MYCELA.Renderer.aiBox(text, tips)      — updates AI explanation box
 *   MYCELA.Renderer.matchBadge(matchType)  — returns badge HTML string
 */
(function (ns) {

  function matchBadge(matchType) {
    if (!matchType) return '';
    return `<span class="match-badge">${matchType}</span>`;
  }

  function cardHTML(b) {
    const c      = MYCELA.BC[b.brand] || '#aaa';
    const ic     = MYCELA.TI[b.type]  || '◉';
    const hasXref = b.alt && b.alt.length > 0;
    const crText = b.cr != null
      ? `Cr <span>${b.cr} kN</span>`
      : '<span style="color:#2a3a28">—</span>';
    const safeId = b.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="part-card" onclick="openModal('${safeId}')">
      <div class="card-top">
        <div><div class="card-pn">${b.pn}</div><div class="card-brand-lbl" style="color:${c}">${b.brand}</div></div>
        <div class="card-type-badge">${ic} ${b.type}</div>
      </div>
      <div class="card-dims">
        <div><div class="dim-lbl">Bore</div><div class="dim-val">${b.bore}mm</div></div>
        <div><div class="dim-lbl">OD</div><div class="dim-val">${b.od}mm</div></div>
        <div><div class="dim-lbl">Width</div><div class="dim-val">${b.w}mm</div></div>
      </div>
      <div class="card-cr-row">${crText}<span class="card-seal">${b.sealing}</span></div>
      <div class="card-btn-row">
        ${hasXref ? `<button class="card-btn" onclick="event.stopPropagation();openModal('${safeId}')">Cross-ref</button>` : '<span></span>'}
        <button class="card-btn" onclick="event.stopPropagation();openModal('${safeId}')">PN</button>
      </div>
    </div>`;
  }

  function cards(results, state) {
    const fil     = results.filter(b =>
      (state.tf === 'All' || b.type === state.tf) &&
      (state.bf === 'All' || b.brand === state.bf));
    const countEl = document.getElementById('results-count');
    const el      = document.getElementById('results-area');

    if (!state.searched) { el.innerHTML = ''; countEl.style.display = 'none'; return; }

    if (!fil.length) {
      countEl.style.display = 'none';
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">◎</div>
        <div class="empty-title">No results for this filter</div>
        <div class="empty-sub">The active type or brand filter has no matches. Click <strong>All</strong> in the filter bar to see all available results for your search.</div>
      </div>`;
      return;
    }

    countEl.style.display = 'block';
    countEl.innerHTML = `Showing <span>${fil.length}</span> result${fil.length !== 1 ? 's' : ''} from <span>${MYCELA.DB.length.toLocaleString()}</span> indexed bearings`;
    el.innerHTML = '<div class="results-grid">' + fil.map(cardHTML).join('') + '</div>';
  }

  function modal(id) {
    const b = MYCELA.DB_MAP[id]; if (!b) return;
    const c = MYCELA.BC[b.brand] || '#aaa';
    document.getElementById('modal-pn').textContent   = b.pn;
    document.getElementById('modal-meta').innerHTML   =
      `<span style="color:${c}">${b.brand}</span> &nbsp;·&nbsp; ${b.type}`;
    const specs = [
      ['Bore (d)',            `${b.bore} mm`],
      ['Outer Diameter (D)', `${b.od} mm`],
      ['Width (B)',          `${b.w} mm`],
      ['Sealing',             b.sealing],
      ['Dynamic Load Cr',    b.cr   != null ? `${b.cr} kN`                    : '—'],
      ['Static Load C0r',    b.c0r  != null ? `${b.c0r} kN`                   : '—'],
      ['Reference Speed',    b.rpm  != null ? `${b.rpm.toLocaleString()} rpm`  : '—'],
      ['Mass',               b.mass != null ? `${b.mass} g`                   : '—'],
    ];
    document.getElementById('modal-specs').innerHTML = specs
      .map(([k, v]) => `<div class="spec-cell"><div class="spec-lbl">${k}</div><div class="spec-val">${v}</div></div>`)
      .join('');
    document.getElementById('modal-apps').innerHTML =
      (b.apps || []).map(a => `<span class="app-tag">${a}</span>`).join('');
    const alts = (b.alt || []).map(aid => MYCELA.DB_MAP[aid]).filter(Boolean);
    const xw   = document.getElementById('modal-xref-wrap');
    if (alts.length) {
      xw.style.display = 'block';
      document.getElementById('modal-xref').innerHTML = alts.map(a => {
        const safeId = a.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button class="xref-btn" onclick="openModal('${safeId}')">
          <div class="xref-pn">${a.pn}</div><div class="xref-brand">${a.brand}</div>
        </button>`;
      }).join('');
    } else {
      xw.style.display = 'none';
    }
    document.getElementById('modal-overlay').classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  function filterBar(show) {
    document.getElementById('filter-bar').style.display = show ? 'flex' : 'none';
  }

  function aiBox(text, tips) {
    if (!text) { document.getElementById('ai-box').style.display = 'none'; return; }
    document.getElementById('ai-box-text').textContent = text;
    document.getElementById('ai-tips-row').innerHTML   =
      (tips || []).map(t => `<span class="ai-tip">${t}</span>`).join('');
    document.getElementById('ai-box').style.display = 'block';
  }

  ns.Renderer = { cards, modal, closeModal, filterBar, aiBox, matchBadge };
})(window.MYCELA = window.MYCELA || {});
