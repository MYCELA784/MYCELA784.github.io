/* PUBLIC API
 *   MYCELA.App.doSearch()  — read #q, run the real search pipeline, render into #grid
 *
 * Glue for the redesigned preview/index.html. Owns pill/category chrome,
 * hero examples, the results filter rail state, modal/compare wiring, and
 * sheet open/close. Basket sheet contents / autocomplete / dimension finder
 * (STEP 3) land on top of this in a later commit.
 */
(function (ns) {
  const $ = id => document.getElementById(id);

  // ── Category chrome (bearings are the only live category) ──────────────────
  const CATS = [
    { id: 'bearing', name: 'Bearings', live: true,
      desc: 'Deep groove, angular contact, spherical and tapered roller bearings from SKF, NTN and FAG.',
      ic: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/>' },
    { id: 'linear', name: 'Linear motion', live: false,
      desc: 'Profile rails, guide blocks and linear bushings, including Hiwin and THK interchange.',
      ic: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9V6M12 9V6M17 9V6"/>' },
    { id: 'coupling', name: 'Couplings', live: false,
      desc: 'Jaw, spider and flexible shaft couplings matched by bore and torque rating.',
      ic: '<rect x="3" y="7" width="7" height="10" rx="1.5"/><rect x="14" y="7" width="7" height="10" rx="1.5"/><path d="M10 12h4"/>' },
    { id: 'fastener', name: 'Fasteners', live: false,
      desc: 'Bolts, nuts and washers to DIN and ISO standards, matched by thread, grade and coating.',
      ic: '<path d="M9 3h6l1 4H8l1-4Z"/><path d="M10 7h4v14l-2 1-2-1V7Z"/>' },
    { id: 'seal', name: 'Seals & gaskets', live: false,
      desc: 'Oil seals, O-rings and gaskets sized to the shaft and housing you already have.',
      ic: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="4" ry="2.2"/>' },
    { id: 'tool', name: 'Tools & consumables', live: false,
      desc: 'Pullers, induction heaters, greases and the shop-floor consumables that go with them.',
      ic: '<path d="M14.5 4.5a4.5 4.5 0 0 0-6 5.9L4 15v4h4l4.6-4.6a4.5 4.5 0 0 0 5.9-6l-2.7 2.7-2.2-2.2 2.7-2.7Z"/>' },
  ];
  const EXAMPLES = ['6205', '6305', '6200', '4T-30203'];
  const PLACEHOLDER = 'Search any part number… e.g. 6205, 6305, 4T-30203';

  function renderCats() {
    const el = $('cats');
    if (!el) return;
    el.innerHTML = CATS.map(c => `<button class="cat ${c.live ? '' : 'off'}" data-gocat="${c.live ? c.id : ''}">
      <div class="cat-ic"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${c.ic}</svg></div>
      <h3>${c.name}</h3><p>${c.desc}</p>
      <div class="meta"><span class="tag ${c.live ? 'live' : 'soon'}">${c.live ? 'Live' : 'Soon'}</span>${c.live ? ns.DB.length.toLocaleString() + ' parts' : 'coming soon'}</div></button>`).join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-gocat]');
      if (!b || !b.dataset.gocat) return;
      setCat(b.dataset.gocat);
      scrollTo({ top: 0, behavior: 'smooth' });
      $('q').focus();
    });
  }

  function renderExamples() {
    const el = $('egs');
    if (!el) return;
    el.innerHTML = EXAMPLES.map(e => `<button class="eg">${e}</button>`).join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('.eg');
      if (!b) return;
      $('q').value = b.textContent;
      doSearch();
    });
  }

  function initTrust() {
    const nums = document.querySelectorAll('.trust b');
    if (nums[0]) nums[0].textContent = ns.DB.length.toLocaleString();
    if (nums[1]) nums[1].textContent = new Set(ns.DB.map(b => b.brand)).size;
  }

  // ── Pills (cosmetic — every pill searches the same bearings catalog;
  //    the non-bearing pills are disabled in markup) ──────────────────────────
  let cat = 'all';
  function setCat(c) {
    cat = c;
    document.querySelectorAll('.pill').forEach(p => p.setAttribute('aria-pressed', p.dataset.cat === c));
    if ($('q').value.trim()) doSearch();
  }
  function initPills() {
    $('q').placeholder = PLACEHOLDER;
    $('pills').addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p || p.disabled) return;
      setCat(p.dataset.cat);
    });
    const urlCat = new URLSearchParams(location.search).get('cat');
    setCat(urlCat === 'bearing' ? 'bearing' : 'all');
  }

  // ── Search ───────────────────────────────────────────────────────────────
  let fBrands = new Set();
  let fSeals  = new Set();
  let results = [];
  let title   = '';
  let sub     = '';

  function renderResults() {
    MYCELA.Renderer.cards(results, { filters: { brand: fBrands, sealing: fSeals }, title, sub });
  }

  async function doSearch() {
    const q = $('q').value.trim();
    if (!q) { $('results').classList.remove('on'); return; }

    fBrands = new Set();
    fSeals  = new Set();

    let hits = MYCELA.SearchEngine.fast(q);
    let note = null;
    if (hits.length === 0) {
      const fb = MYCELA.SearchEngine.fallback(q);
      hits = fb.results;
      note = fb.note;
    }

    results = hits;
    title   = `${hits.length} result${hits.length === 1 ? '' : 's'}`;
    sub     = note || `for "${q}"`;
    renderResults();

    MYCELA.AIRefiner.refine(q).then(resp => {
      if (!resp) return;
      const matched = (resp.matches || []).map(id => MYCELA.DB_MAP[id]).filter(Boolean);
      if (matched.length > 0) {
        results = matched;
        renderResults();
      }
    }).catch(() => {});
  }

  function initSearchBox() {
    $('q').addEventListener('input', () => doSearch());
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    $('clearSearch').addEventListener('click', () => {
      $('q').value = '';
      $('results').classList.remove('on');
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initFilterRail() {
    $('fbody').addEventListener('change', e => {
      const b = e.target.closest('[data-fb]');
      const s = e.target.closest('[data-fs]');
      if (b) { b.checked ? fBrands.add(b.dataset.fb) : fBrands.delete(b.dataset.fb); }
      if (s) { s.checked ? fSeals.add(s.dataset.fs) : fSeals.delete(s.dataset.fs); }
      renderResults();
    });
    $('fbody').addEventListener('click', e => {
      if (e.target.id === 'fclear') { fBrands.clear(); fSeals.clear(); renderResults(); }
    });
    $('fmob').addEventListener('click', () => {
      const r = $('frail');
      const open = !r.classList.toggle('shut');
      $('fmob').setAttribute('aria-expanded', open);
      $('fmob').querySelector('span').textContent = open ? '−' : '+';
    });
  }

  function initGrid() {
    $('grid').addEventListener('click', e => {
      const x = e.target.closest('[data-x]');
      if (x) { $('q').value = x.dataset.x; doSearch(); return; }
      if (e.target.id === 'fclear2') { fBrands.clear(); fSeals.clear(); renderResults(); return; }
      const info = e.target.closest('[data-info]');
      if (info) { closeSheets(); MYCELA.Renderer.modal(info.dataset.info); return; }
      // data-add: wired in STEP 3 (basket)
    });
    $('grid').addEventListener('change', e => {
      const c = e.target.closest('[data-cmp]');
      if (c) MYCELA.Renderer.toggleCompare(c.dataset.cmp, c.checked);
    });
  }

  // ── Sheets (basket / find-by-size) — open/close chrome only; the sheet
  //    contents themselves are wired in STEP 3 ────────────────────────────────
  function openSheet(el) {
    MYCELA.Renderer.closeModal();
    $('scrim').classList.add('on'); el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
  }
  function closeSheets() {
    $('scrim').classList.remove('on');
    document.querySelectorAll('.sheet').forEach(s => { s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); });
  }
  function initSheets() {
    $('openBasket').addEventListener('click', () => openSheet($('basket')));
    $('openSize').addEventListener('click', () => openSheet($('size')));
    $('helperSize').addEventListener('click', () => openSheet($('size')));
    $('scrim').addEventListener('click', closeSheets);
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  }

  // ── Modal + compare ─────────────────────────────────────────────────────
  function initModal() {
    $('compareBtn').addEventListener('click', () => MYCELA.Renderer.openCompare());
    window.openModal        = MYCELA.Renderer.modal;
    window.closeModal       = e => { if (e.target.id === 'modal-overlay') MYCELA.Renderer.closeModal(); };
    window.closeModalDirect = MYCELA.Renderer.closeModal;
  }

  // Escape closes whichever overlay is currently open: the modal takes
  // priority over a basket/size sheet, since opening the modal already
  // closes any open sheet (see openSheet above).
  function initEscape() {
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if ($('modal-overlay').classList.contains('open')) { MYCELA.Renderer.closeModal(); return; }
      closeSheets();
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  renderCats();
  renderExamples();
  initTrust();
  initPills();
  initSearchBox();
  initFilterRail();
  initGrid();
  initSheets();
  initModal();
  initEscape();

  // ── Public API ───────────────────────────────────────────────────────────
  ns.App = { doSearch };
  window.doSearch = doSearch;
})(window.MYCELA = window.MYCELA || {});
