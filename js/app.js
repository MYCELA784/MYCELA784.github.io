/* PUBLIC API
 *   MYCELA.App.doSearch(queryOverride?, display?, opts?)
 *     — read #q (or queryOverride), ask the search API, render into #grid.
 *       Returns a promise that settles when that search has been shown or
 *       has been overtaken by a newer one. opts.typed: wait for a typing
 *       pause first, and fill the autocomplete from the answer.
 *
 * The catalogue is not in the browser. Searches go to MYCELA.Api (js/api.js)
 * and every part on the page is one the API has sent.
 *
 * Glue for the redesigned index.html. Owns pill/category chrome,
 * hero examples, the results filter rail state, modal/compare wiring, sheet
 * open/close, the basket sheet, autocomplete, and the dimension finder.
 *
 * ?debug=1 — logs to console the API's answer for every search. No visible
 *            UI change. (Scores and the parsed query stay on the API side.)
 */
(function (ns) {
  const $ = id => document.getElementById(id);
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
  const esc = v => ns.esc(v);

  // Same Apps Script endpoint as the root site's contact.js.
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxy_9LHxs0IbQRi7AD4g0bgD40vjV4FnLcCRoG_f8mDU6nEoMomjqZ219CEKeq-cOLb/exec';
  const DISPOSABLE = ['mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com',
    'guerrillamail.com', 'yopmail.com', 'throwawaymail.com', 'getnada.com', 'dispostable.com',
    'trashmail.com', 'sharklasers.com', 'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'tmail.ws'];
  const PERSONAL = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com',
    'rediffmail.com', 'icloud.com', 'protonmail.com', 'proton.me', 'aol.com', 'zoho.com'];

  function mxOk(domain) {
    const url  = 'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    return fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .then(j => { clearTimeout(t); return j.Status !== 3; })
      .catch(() => true); // fail open, never block a real buyer
  }

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
  // On a phone the box has no room for the examples (they are the buttons
  // under it), and a placeholder that does not fit is simply cut off.
  const PLACEHOLDER_SHORT = 'Search any part number…';

  // The catalogue size shown before the API answers: the literal in the
  // page's own markup (.trust), which GET /stats then replaces.
  function countPlaceholder() {
    const b = document.querySelector('.trust b');
    return (b && b.textContent) || '';
  }

  function renderCats() {
    const el = $('cats');
    if (!el) return;
    el.innerHTML = CATS.map(c => `<button class="cat ${c.live ? '' : 'off'}" data-gocat="${c.live ? c.id : ''}">
      <div class="cat-ic"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${c.ic}</svg></div>
      <h3>${c.name}</h3><p>${c.desc}</p>
      <div class="meta"><span class="tag ${c.live ? 'live' : 'soon'}">${c.live ? 'Live' : 'Soon'}</span>${c.live ? `<span class="js-count">${esc(countPlaceholder())}</span> parts` : 'coming soon'}</div></button>`).join('');
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
    el.innerHTML = EXAMPLES.map(e => `<button class="eg">${esc(e)}</button>`).join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('.eg');
      if (!b) return;
      $('q').value = b.textContent;
      doSearch();
    });
  }

  // "parts listed" comes from the API. If it cannot be reached the literals
  // in the markup stay. "brands live" is that literal: the API's /stats
  // gives the count only.
  function initTrust() {
    ns.Api.stats().then(st => {
      if (!(st.count > 0)) return;
      const text = st.count.toLocaleString();
      const first = document.querySelector('.trust b');
      if (first) first.textContent = text;
      document.querySelectorAll('.js-count').forEach(el => { el.textContent = text; });
    }, () => {});
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
    const narrow = window.matchMedia ? window.matchMedia('(max-width:600px)') : null;
    const setPlaceholder = () => { $('q').placeholder = narrow && narrow.matches ? PLACEHOLDER_SHORT : PLACEHOLDER; };
    setPlaceholder();
    if (narrow && narrow.addEventListener) narrow.addEventListener('change', setPlaceholder);
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

  // ── Zero-result telemetry (deduped per browser session) ────────────────────
  const ZERO_KEY = 'mycela_zero_reported';
  // fallbackStage tells the gap log what kind of miss this was: 1–4 means the
  // fallback relaxed a real size or type into results ("no such size"), 0 a
  // size or type with nothing near it, null nothing parsable to relax from.
  // See the PUBLIC API note in js/search/fallback.js.
  function reportZeroResult(q, fallbackStage) {
    let seen = [];
    try { seen = JSON.parse(sessionStorage.getItem(ZERO_KEY)) || []; } catch (e) {}
    if (seen.includes(q)) return;
    seen.push(q);
    try { sessionStorage.setItem(ZERO_KEY, JSON.stringify(seen)); } catch (e) {}
    fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ type: 'zero_result', query: q, fallbackStage, pageUrl: location.href }) }).catch(() => {});
  }

  // ── Zero-result telemetry debounce ─────────────────────────────────────────
  // The telemetry endpoint only hears about a zero-result query when the
  // user presses Enter, or once typing has paused for
  // CONFIG.search.zeroReportIdleMs, whichever comes first. A newer query
  // restarts the wait, so a pause mid-word ("bore 12 od 9" on the way to
  // "od 90") is never logged. The answer comes from the API a moment after
  // the keystroke, so a report that falls due before the answer is in waits
  // for it. The query and stage are those of the latest search.
  let zeroTimer = null;
  let current = { q: '', answered: false, zeroHits: false, fallbackStage: null, due: false };

  function cancelTelemetry() {
    clearTimeout(zeroTimer);
    zeroTimer = null;
  }

  function sendIfDue() {
    if (current.due && current.answered && current.q && current.zeroHits) reportZeroResult(current.q, current.fallbackStage);
  }

  function flushTelemetry() {
    cancelTelemetry();
    current.due = true;
    sendIfDue();
  }

  // A new query: forget the old one's report and start the wait again.
  function startTelemetry(q) {
    cancelTelemetry();
    current = { q, answered: false, zeroHits: false, fallbackStage: null, due: false };
    zeroTimer = setTimeout(flushTelemetry, MYCELA.CONFIG.search.zeroReportIdleMs);
  }

  function answerTelemetry(q, zeroHits, fallbackStage) {
    if (current.q !== q) return;
    current.answered = true;
    current.zeroHits = zeroHits;
    current.fallbackStage = fallbackStage;
    if (!zeroHits) cancelTelemetry();
    sendIfDue();
  }

  // ── Search requests ────────────────────────────────────────────────────────
  // One search is "the latest" at any time (seq). Starting another cancels
  // the request in flight and makes its answer, if it still arrives, be
  // ignored: an older answer is never shown over a newer one.
  let seq = 0;
  let inFlight = null;       // AbortController of the request in flight
  let typeTimer = null;      // the typing pause
  let slowTimer = null;      // "Searching..." after CONFIG.api.slowMs
  let lastSearch = null;     // { q, display } of the latest search, for "Try again"

  function stopPending() {
    clearTimeout(typeTimer);
    clearTimeout(slowTimer);
    if (inFlight) { inFlight.abort(); inFlight = null; }
  }

  function clearSearch() {
    seq++;
    stopPending();
    cancelTelemetry();
    current.q = '';
    $('results').classList.remove('on');
  }

  // "Same fit" names parts by id (alt). Fetch the ones this page has not
  // been sent, then draw the cards again so the links appear.
  function loadSameFit(mySeq) {
    const ids = [];
    results.forEach(b => (Array.isArray(b.alt) ? b.alt : []).forEach(id => {
      if (!ns.Api.known(id) && !ns.Api.missing(id)) ids.push(id);
    }));
    if (!ids.length) return Promise.resolve();
    return ns.Api.parts(ids).then(() => { if (mySeq === seq) renderResults(); }, () => {});
  }

  function showAnswer(q, display, answer, mySeq, typed) {
    fBrands = new Set();
    fSeals  = new Set();
    const hits = answer.results;
    // stage "exact": the normal search answered. Anything else is the
    // fallback's stage, and counts as a zero-result query for the gap log.
    const zeroHits = answer.stage !== 'exact';

    results = hits;
    title   = (display && display.title) || `${hits.length} result${hits.length === 1 ? '' : 's'}`;
    sub     = (display && display.sub)   || answer.note || `for "${q}"`;
    renderResults();
    if (typed) renderAc(q, hits);

    if (DEBUG) {
      console.group(`MYCELA ?debug=1: "${q}"`);
      console.log('API answer:', answer);
      console.groupEnd();
    }

    answerTelemetry(q, zeroHits, zeroHits ? answer.stage : null);
    return loadSameFit(mySeq);
  }

  function request(q, display, mySeq, typed) {
    const ctrl = new AbortController();
    inFlight = ctrl;
    slowTimer = setTimeout(() => {
      if (mySeq === seq) MYCELA.Renderer.notice('Searching...', '', false);
    }, MYCELA.CONFIG.api.slowMs);
    return ns.Api.search(q, { signal: ctrl.signal }).then(answer => {
      if (mySeq !== seq) return;
      clearTimeout(slowTimer);
      inFlight = null;
      return showAnswer(q, display, answer, mySeq, typed);
    }, err => {
      if (mySeq !== seq) return;          // cancelled by a newer search, or stale
      clearTimeout(slowTimer);
      inFlight = null;
      cancelTelemetry();
      current.q = '';
      closeAc();
      const m = ns.Api.message(err);
      MYCELA.Renderer.notice(m.title, m.text, err.kind !== 'rate');
    });
  }

  function doSearch(queryOverride, display, opts) {
    const q = (queryOverride != null ? queryOverride : $('q').value).trim();
    const typed = !!(opts && opts.typed);
    if (!q) { clearSearch(); return Promise.resolve(); }

    const mySeq = ++seq;
    stopPending();
    lastSearch = { q, display };
    if (current.q !== q || !zeroTimer) startTelemetry(q);

    // An answer this page already has is shown at once.
    const have = ns.Api.cached(q);
    if (have) return Promise.resolve(showAnswer(q, display, have, mySeq, typed));
    if (!typed) return request(q, display, mySeq, false);
    return new Promise(resolve => {
      typeTimer = setTimeout(() => resolve(mySeq === seq ? request(q, display, mySeq, true) : undefined),
                             MYCELA.CONFIG.api.debounceMs);
    });
  }

  // ── Autocomplete ─────────────────────────────────────────────────────────
  let acIdx = -1;
  function closeAc() { $('ac').hidden = true; acIdx = -1; }
  // Suggestions are the search's own answer: the first 6 results whose part
  // number contains what was typed. (The catalogue is not in the browser to
  // scan.) Only while the box still holds that text.
  function renderAc(raw, list) {
    const v = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (!v || $('q').value.trim() !== raw.trim()) { closeAc(); return; }
    const hits = list.filter(b => String(b.pn || '').toUpperCase().replace(/\s+/g, '').includes(v)).slice(0, 6);
    $('ac').innerHTML = hits.map(b =>
      `<div class="aci" data-ac="${esc(b.pn)}"><span class="p">${esc(b.pn)}</span>
       <span class="c">${esc(b.type || '')}</span><span class="d">${esc(b.brand)}</span></div>`).join('');
    acIdx = -1;
    $('ac').hidden = !hits.length;
  }
  function initAutocomplete() {
    $('ac').addEventListener('click', e => {
      const i = e.target.closest('[data-ac]');
      if (!i) return;
      $('q').value = i.dataset.ac;
      doSearch();
      closeAc();
    });
    $('q').addEventListener('keydown', e => {
      const its = [...document.querySelectorAll('.aci')];
      if ($('ac').hidden || !its.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        acIdx = e.key === 'ArrowDown' ? (acIdx + 1) % its.length : (acIdx - 1 + its.length) % its.length;
        its.forEach((x, i) => x.classList.toggle('on', i === acIdx));
      } else if (e.key === 'Enter' && acIdx >= 0) {
        e.preventDefault();
        $('q').value = its[acIdx].dataset.ac;
        doSearch();
        closeAc();
      } else if (e.key === 'Escape') {
        closeAc();
      }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) closeAc(); });
  }

  function initSearchBox() {
    $('q').addEventListener('input', () => { closeAc(); doSearch(null, null, { typed: true }); });
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter' && acIdx < 0) { closeAc(); doSearch(); flushTelemetry(); } });
    $('clearSearch').addEventListener('click', () => {
      $('q').value = '';
      clearSearch();
      closeAc();
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
      const add = e.target.closest('[data-add]');
      if (add) { window.toggleInquiry(add.dataset.add); return; }
      if (e.target.id === 'askBtn') { openInquiryForm(`Looking for: "${$('q').value.trim()}"`); return; }
      if (e.target.id === 'retryBtn' && lastSearch) { doSearch(lastSearch.q, lastSearch.display); return; }
    });
    $('grid').addEventListener('change', e => {
      const c = e.target.closest('[data-cmp]');
      if (c) MYCELA.Renderer.toggleCompare(c.dataset.cmp, c.checked);
    });
  }

  // ── Basket ───────────────────────────────────────────────────────────────
  // Reads ns.Basket only (features.js, mycela_inquiry localStorage key).
  // ns.Basket.count() / .resolvedItems() only include entries whose part
  // this page has, so the badge and the rendered list can't disagree. A
  // stored list is fetched from the API once at load (Basket.sync()).
  function updateBCount() {
    const n = ns.Basket.count();
    $('bCount').textContent = n;
    $('sendBtn').disabled = !n;
  }
  function renderBasketSheet() {
    $('sendBtn').closest('.sh-foot').style.display = '';
    updateBCount();
    const items = ns.Basket.resolvedItems();
    const waiting = ns.Basket.unresolved();
    if (!items.length && waiting) {
      // A stored list whose parts have not arrived: still loading, or the
      // API could not be reached. Never shown as "empty".
      $('bBody').innerHTML = `<div class="sh-empty"><p style="margin:0">${ns.Basket.state() === 'error'
        ? `Your list has ${waiting} part${waiting === 1 ? '' : 's'}, but we could not load ${waiting === 1 ? 'it' : 'them'} right now.<br>Please try again in a moment.`
        : 'Loading your list...'}</p>${ns.Basket.state() === 'error' ? '<button class="btn btn-line" id="basketRetry" style="margin-top:14px">Try again</button>' : ''}</div>`;
      return;
    }
    if (!items.length) {
      $('bBody').innerHTML = `<div class="sh-empty"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 7h16l-1.3 11.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8L4 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
        <p style="margin:0">Your list is empty.<br>Search for a part and add it here.</p></div>`;
      return;
    }
    $('bBody').innerHTML = items.map(it => {
      const b = it.bearing;
      return `<div class="brow"><div class="n"><b>${esc(b.pn)}</b><span>${esc(b.brand)} · ${esc(b.type || '')}</span></div>
        <input class="qty" type="number" min="1" value="${esc(it.qty)}" data-q="${esc(it.id)}">
        <button class="rm" data-rm="${esc(it.id)}" aria-label="Remove">×</button></div>`;
    }).join('') + `<p style="margin-top:20px;font-size:14px;color:var(--body)">Add as many parts as you need. You'll get one consolidated quote back.</p>`;
  }
  // Called after any basket mutation, from whichever entry point triggered it
  // (grid card, modal's own inquiry button) so #bCount / the grid's own
  // "Add to list" buttons / the open basket sheet all stay in sync.
  function syncBasketUI(id) {
    updateBCount();
    document.querySelectorAll('[data-add]').forEach(btn => {
      if (btn.dataset.add !== id) return;
      const has = ns.Basket.has(id);
      btn.classList.toggle('added', has);
      btn.textContent = has ? 'Added to list' : 'Add to list';
    });
    if ($('basket').classList.contains('on')) renderBasketSheet();
  }
  function syncBasket() {
    return ns.Basket.sync().then(() => {
      updateBCount();
      if ($('basket').classList.contains('on') && !$('inquiryForm')) renderBasketSheet();
    });
  }
  function initBasket() {
    updateBCount();
    syncBasket();
    // features.js's toggleInquiry already updates the modal's own inq button;
    // wrap it so the grid + basket sheet stay in sync from every entry point.
    const originalToggleInquiry = window.toggleInquiry;
    window.toggleInquiry = function (id) {
      originalToggleInquiry(id);
      syncBasketUI(id);
    };
    $('bBody').addEventListener('click', e => {
      if (e.target.id === 'inqBack') { renderBasketSheet(); return; }
      if (e.target.id === 'basketRetry') { e.target.disabled = true; syncBasket(); return; }
      const r = e.target.closest('[data-rm]');
      if (!r) return;
      ns.Basket.remove(r.dataset.rm);
      syncBasketUI(r.dataset.rm);
    });
    $('bBody').addEventListener('change', e => {
      const qi = e.target.closest('[data-q]');
      if (qi) ns.Basket.setQty(qi.dataset.q, +qi.value || 1);
    });
  }

  // ── Lead capture ─────────────────────────────────────────────────────────
  // #sendBtn swaps the basket sheet's item list for a small inquiry form;
  // "Ask us to source it" (zero-results state) opens the same form directly.
  function basketItemsPayload() {
    // Only resolvable entries: never send a line with a blank
    // brand and an internal id in place of a part number. Same source as
    // the renderers and the nav badge.
    return ns.Basket.resolvedItems().map(it => ({
      brand: it.bearing.brand, designation: it.bearing.pn, qty: it.qty,
    }));
  }

  function showInquiryForm(prefillMessage) {
    $('sendBtn').closest('.sh-foot').style.display = 'none';
    $('bBody').innerHTML = `
      <form class="form" id="inquiryForm" autocomplete="on">
        <div class="frm-row"><label for="inq-name">Your name</label><input id="inq-name" name="name" type="text" required></div>
        <div class="frm-row"><label for="inq-company">Company</label><input id="inq-company" name="company" type="text"></div>
        <div class="frm-row"><label for="inq-email">Email</label><input id="inq-email" name="email" type="email" required>
          <p class="frm-hint">Company email addresses get a faster reply, but any working inbox is fine.</p></div>
        <div class="frm-row"><label for="inq-phone">Phone or WhatsApp</label><input id="inq-phone" name="phone" type="tel"></div>
        <div class="frm-row"><label for="inq-city">City</label><input id="inq-city" name="city" type="text"></div>
        <div class="frm-row"><label for="inq-msg">Message</label><textarea id="inq-msg" name="message" placeholder="Quantities, delivery location, or whatever else is useful."></textarea></div>
        <input class="hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn" style="width:100%" type="submit">Send enquiry</button>
        <button class="btn btn-line" style="width:100%;margin-top:8px" type="button" id="inqBack">← Back to list</button>
        <p id="inq-status" role="status"></p>
      </form>`;
    if (prefillMessage) $('inq-msg').value = prefillMessage;
    attachInquirySubmit($('inquiryForm'));
    $('inq-name').focus();
  }

  function openInquiryForm(prefillMessage) {
    openSheet($('basket'));
    showInquiryForm(prefillMessage);
  }

  function attachInquirySubmit(form) {
    const statusEl = $('inq-status');
    function say(msg, bad) { statusEl.textContent = msg; statusEl.style.color = bad ? '#C0392B' : 'var(--body)'; }

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      if (form.website.value.trim() !== '') { say("Thanks, we'll be in touch."); return; }

      const email = form.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('Please enter a valid email address.', true); return; }
      const domain = email.split('@')[1];
      if (DISPOSABLE.indexOf(domain) !== -1) { say("Disposable email addresses aren't accepted. Please use a real inbox.", true); return; }

      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      say('Checking email…');

      const check = PERSONAL.indexOf(domain) !== -1 ? Promise.resolve(true) : mxOk(domain);
      check.then(ok => {
        if (!ok) { say("That email domain doesn't appear to exist. Please check for typos.", true); btn.disabled = false; return; }
        say('Sending…');
        return fetch(ENDPOINT, {
          method: 'POST',
          // no Content-Type header, so the browser sends a simple request and skips CORS preflight
          body: JSON.stringify({
            type: 'inquiry',
            name: form.name.value.trim(),
            company: form.company.value.trim(),
            email: email,
            phone: form.phone.value.trim(),
            city: form.city.value.trim(),
            message: form.message.value.trim(),
            website: form.website.value.trim(),
            items: basketItemsPayload(),
            source: 'inquiry_basket',
            pageUrl: location.href,
          }),
        }).then(r => r.json()).then(res => {
          btn.disabled = false;
          if (res && res.ok) {
            Object.keys(ns.Basket.items()).forEach(id => ns.Basket.remove(id));
            document.querySelectorAll('[data-add].added').forEach(el => { el.classList.remove('added'); el.textContent = 'Add to list'; });
            updateBCount();
            $('bBody').innerHTML = `<div class="sh-empty"><p style="margin:0">✓ Enquiry sent. We'll reply within a working day.</p></div>`;
          } else {
            say((res && res.error) || 'Something went wrong. Please try again.', true);   // say() sets textContent
          }
        }).catch(() => {
          say('Network error. Please try again, or email shaonak@mycela.in directly.', true);
          btn.disabled = false;
        });
      });
    });
  }

  function initLeadCapture() {
    $('sendBtn').addEventListener('click', () => showInquiryForm());
  }

  // ── Sheets (basket / find-by-size) ──────────────────────────────────────
  let sheetOpener = null;
  function openSheet(el, opener) {
    MYCELA.Renderer.closeModal();
    sheetOpener = opener || document.activeElement;
    $('scrim').classList.add('on'); el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
  }
  function closeSheets() {
    $('scrim').classList.remove('on');
    document.querySelectorAll('.sheet').forEach(s => {
      // aria-hidden="true" on an element that still contains focus is an
      // accessibility violation (and logs a console warning) — move focus
      // out first, ideally back to whatever opened the sheet.
      if (s.contains(document.activeElement)) document.activeElement.blur();
      s.classList.remove('on'); s.setAttribute('aria-hidden', 'true');
    });
    if (sheetOpener && typeof sheetOpener.focus === 'function') sheetOpener.focus();
    sheetOpener = null;
  }
  function initSheets() {
    $('openBasket').addEventListener('click', () => { renderBasketSheet(); openSheet($('basket'), $('openBasket')); });
    $('openSize').addEventListener('click', () => openSheet($('size'), $('openSize')));
    $('helperSize').addEventListener('click', () => openSheet($('size'), $('helperSize')));
    $('scrim').addEventListener('click', closeSheets);
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  }

  // ── Dimension finder ─────────────────────────────────────────────────────
  function initDimFinder() {
    document.querySelectorAll('.fld input').forEach(i => {
      i.addEventListener('focus', () => {
        document.querySelectorAll('.dline').forEach(l => l.classList.add('dim'));
        $(i.dataset.line).classList.remove('dim');
      });
      i.addEventListener('blur', () => document.querySelectorAll('.dline').forEach(l => l.classList.remove('dim')));
      i.addEventListener('keydown', e => { if (e.key === 'Enter') $('findBtn').click(); });
    });
    $('findBtn').addEventListener('click', () => {
      const d = +$('in-d').value, D = +$('in-D').value, B = +$('in-B').value;
      if (!d && !D && !B) { $('in-d').focus(); return; }
      const parts = [];
      if (d) parts.push(`bore ${d}`);
      if (D) parts.push(`od ${D}`);
      if (B) parts.push(`width ${B}`);
      const label = [];
      if (d) label.push('d ' + d);
      if (D) label.push('D ' + D);
      if (B) label.push('B ' + B);
      closeSheets();
      $('q').value = '';
      doSearch(parts.join(' '), { sub: label.join(' · ') + ' mm' });
      $('results').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ── Modal + compare ─────────────────────────────────────────────────────
  function initModal() {
    $('compareBtn').addEventListener('click', () => MYCELA.Renderer.openCompare());
    // Buttons the renderer builds carry a part id in a data- attribute.
    $('modal-overlay').addEventListener('click', e => {
      const open = e.target.closest('[data-open]');
      if (open) { MYCELA.Renderer.modal(open.dataset.open); return; }
      const inq = e.target.closest('[data-inq]');
      if (inq) window.toggleInquiry(inq.dataset.inq);
    });
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
  initAutocomplete();
  initFilterRail();
  initGrid();
  initBasket();
  initLeadCapture();
  initSheets();
  initModal();
  initEscape();
  initDimFinder();

  // ── Public API ───────────────────────────────────────────────────────────
  ns.App = { doSearch };
  window.doSearch = doSearch;
})(window.MYCELA = window.MYCELA || {});
