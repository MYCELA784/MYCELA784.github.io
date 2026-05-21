/* PUBLIC API
 *   MYCELA.App.showPage(name)
 *   MYCELA.App.heroSearch()
 *   MYCELA.App.quickHero(q)
 *   MYCELA.App.quickSearch(q)
 *   MYCELA.App.doSearch()
 *   MYCELA.App.setTF(value, el)
 *   MYCELA.App.setBF(value, el)
 *   MYCELA.App.getState()  → { allR, tf, bf, searched }
 *
 * Owns all mutable UI state. Wires event listeners and initialises modules.
 * Exposes thin global aliases (window.*) for HTML onclick attributes.
 *
 * ?debug=1 — logs to console: parsed intent, per-result score breakdowns,
 *            AI response payload. No visible UI change.
 */
(function (ns) {
  const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

  // ── Mutable state ──────────────────────────────────────────────────────────
  let allR     = [];
  let tf       = 'All';
  let bf       = 'All';
  let searched = false;

  function getState() { return { allR, tf, bf, searched }; }

  // ── Page routing ───────────────────────────────────────────────────────────
  function showPage(p) { MYCELA.Router.showPage(p); }

  // ── Filter state ───────────────────────────────────────────────────────────
  function setTF(v, el) {
    tf = v;
    document.querySelectorAll('#filter-bar .filter-btn').forEach(b => {
      if (!['All', 'NTN', 'SKF'].includes(b.textContent.trim())) b.classList.remove('active');
    });
    el.classList.add('active');
    MYCELA.Renderer.cards(allR, getState());
  }

  function setBF(v, el) {
    bf = v;
    document.querySelectorAll('#filter-bar .filter-btn').forEach(b => {
      if (['All', 'NTN', 'SKF'].includes(b.textContent.trim())) b.classList.remove('active');
    });
    el.classList.add('active');
    MYCELA.Renderer.cards(allR, getState());
  }

  // ── Search helpers ─────────────────────────────────────────────────────────
  function heroSearch() {
    const q = document.getElementById('hero-input').value.trim();
    if (q) { MYCELA.Router.showPage('search'); document.getElementById('search-input').value = q; window.doSearch(); }
  }

  function quickHero(q)   { document.getElementById('hero-input').value   = q; heroSearch(); }
  function quickSearch(q) { document.getElementById('search-input').value = q; window.doSearch(); }

  // ── doSearch ───────────────────────────────────────────────────────────────
  async function doSearch() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;

    searched = true; tf = 'All'; bf = 'All';
    let fallbackNote = null;

    document.querySelectorAll('#filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#filter-bar .filter-btn').forEach(b => {
      if (b.textContent.trim() === 'All') b.classList.add('active');
    });

    const btn = document.getElementById('search-btn');

    // Step 1: instant local results
    allR = MYCELA.SearchEngine.fast(q);

    if (allR.length === 0) {
      const fb = MYCELA.SearchEngine.fallback(q);
      allR     = fb.results;
      fallbackNote = fb.note;
    }

    const intent    = MYCELA.SearchEngine.parse(q);
    const noteLines = [];
    if (fallbackNote) noteLines.push(fallbackNote);
    noteLines.push(...intent.envNotes);
    MYCELA.Renderer.aiBox(noteLines.length ? noteLines.join(' ') : null, []);
    MYCELA.Renderer.filterBar(allR.length > 0);
    MYCELA.Renderer.cards(allR, getState());

    if (DEBUG) {
      console.group(`MYCELA ?debug=1 — "${q}"`);
      console.log('Parsed intent:', intent);
      console.log('Results with scores:', allR.map(b => ({
        pn: b.pn, brand: b.brand, score: b._score, matchType: b._matchType, breakdown: b._breakdown,
      })));
      console.groupEnd();
    }

    // Step 2: async AI refinement — never blocks the UI
    btn.textContent = '⟳ AI';
    btn.classList.add('ai-running');

    MYCELA.AIRefiner.refine(q).then(resp => {
      btn.textContent = 'Search';
      btn.classList.remove('ai-running');
      if (!resp) return;

      if (resp.explanation) MYCELA.Renderer.aiBox(resp.explanation, resp.tips || []);

      if (DEBUG) {
        console.group('MYCELA ?debug=1 — AI response');
        console.log(resp);
        console.groupEnd();
      }

      const matched = (resp.matches || []).map(id => MYCELA.DB_MAP[id]).filter(Boolean);
      if (matched.length > 0) {
        allR = matched;
        MYCELA.Renderer.filterBar(true);
        MYCELA.Renderer.cards(allR, getState());
      }
    }).catch(() => {
      btn.textContent = 'Search';
      btn.classList.remove('ai-running');
    });
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  document.getElementById('hero-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') heroSearch(); });
  document.getElementById('search-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') MYCELA.Renderer.closeModal();
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  // ── Public API ─────────────────────────────────────────────────────────────
  ns.App = { showPage, heroSearch, quickHero, quickSearch, doSearch, setTF, setBF, getState };

  // Global shims for HTML onclick attributes
  window.showPage         = MYCELA.Router.showPage;
  window.heroSearch       = heroSearch;
  window.quickHero        = quickHero;
  window.quickSearch      = quickSearch;
  window.doSearch         = doSearch;
  window.setTF            = setTF;
  window.setBF            = setBF;
  window.openModal        = MYCELA.Renderer.modal;
  window.closeModal       = e => { if (e.target.id === 'modal-overlay') MYCELA.Renderer.closeModal(); };
  window.closeModalDirect = MYCELA.Renderer.closeModal;
  window.submitForm       = MYCELA.SupplierForm.submit;
})(window.MYCELA = window.MYCELA || {});
