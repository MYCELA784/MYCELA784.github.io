/* PUBLIC API
 *   MYCELA.App.doSearch(queryOverride?, display?)
 *     — read #q (or queryOverride), run the real search pipeline, render into #grid
 *
 * Glue for the redesigned preview/index.html. Owns pill/category chrome,
 * hero examples, the results filter rail state, modal/compare wiring, sheet
 * open/close, the basket sheet, autocomplete, and the dimension finder.
 *
 * ?debug=1 — logs to console: parsed intent and per-result score breakdowns
 *            for every search. No visible UI change.
 */
(function (ns) {
  const $ = id => document.getElementById(id);
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

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

  // ── Zero-result telemetry (deduped per browser session) ────────────────────
  const ZERO_KEY = 'mycela_zero_reported';
  function reportZeroResult(q) {
    let seen = [];
    try { seen = JSON.parse(sessionStorage.getItem(ZERO_KEY)) || []; } catch (e) {}
    if (seen.includes(q)) return;
    seen.push(q);
    try { sessionStorage.setItem(ZERO_KEY, JSON.stringify(seen)); } catch (e) {}
    fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ type: 'zero_result', query: q, pageUrl: location.href }) }).catch(() => {});
  }

  async function doSearch(queryOverride, display) {
    const q = (queryOverride != null ? queryOverride : $('q').value).trim();
    if (!q) { $('results').classList.remove('on'); return; }

    fBrands = new Set();
    fSeals  = new Set();

    let hits = MYCELA.SearchEngine.fast(q);
    let note = null;
    if (hits.length === 0) {
      reportZeroResult(q);
      const fb = MYCELA.SearchEngine.fallback(q);
      hits = fb.results;
      note = fb.note;
    }

    results = hits;
    title   = (display && display.title) || `${hits.length} result${hits.length === 1 ? '' : 's'}`;
    sub     = (display && display.sub)   || note || `for "${q}"`;
    renderResults();

    if (DEBUG) {
      const intent = MYCELA.SearchEngine.parse(q);
      console.group(`MYCELA ?debug=1 — "${q}"`);
      console.log('Parsed intent:', intent);
      console.log('Results with scores:', hits.map(b => ({
        pn: b.pn, brand: b.brand, score: b._score, matchType: b._matchType, breakdown: b._breakdown,
      })));
      console.groupEnd();
    }

    MYCELA.AIRefiner.refine(q).then(resp => {
      if (!resp) return;
      if (DEBUG) { console.group('MYCELA ?debug=1 — AI response'); console.log(resp); console.groupEnd(); }
      const matched = (resp.matches || []).map(id => MYCELA.DB_MAP[id]).filter(Boolean);
      if (matched.length > 0) {
        results = matched;
        renderResults();
      }
    }).catch(() => {});
  }

  // ── Autocomplete ─────────────────────────────────────────────────────────
  let acIdx = -1;
  function closeAc() { $('ac').hidden = true; acIdx = -1; }
  function renderAc(raw) {
    const v = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (!v) { closeAc(); return; }
    const hits = ns.DB.filter(b => b.pn.toUpperCase().replace(/\s+/g, '').includes(v)).slice(0, 6);
    $('ac').innerHTML = hits.map(b =>
      `<div class="aci" data-ac="${b.pn}"><span class="p">${b.pn}</span>
       <span class="c">${b.type || ''}</span><span class="d">${b.brand}</span></div>`).join('');
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
    $('q').addEventListener('input', () => { renderAc($('q').value); doSearch(); });
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter' && acIdx < 0) doSearch(); });
    $('clearSearch').addEventListener('click', () => {
      $('q').value = '';
      $('results').classList.remove('on');
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
    });
    $('grid').addEventListener('change', e => {
      const c = e.target.closest('[data-cmp]');
      if (c) MYCELA.Renderer.toggleCompare(c.dataset.cmp, c.checked);
    });
  }

  // ── Basket ───────────────────────────────────────────────────────────────
  // Reads ns.Basket only (features.js — mycela_inquiry localStorage key).
  function updateBCount() {
    const n = ns.Basket.count();
    $('bCount').textContent = n;
    $('sendBtn').disabled = !n;
  }
  function renderBasketSheet() {
    $('sendBtn').closest('.sh-foot').style.display = '';
    updateBCount();
    const items = ns.Basket.items();
    const ids = Object.keys(items);
    if (!ids.length) {
      $('bBody').innerHTML = `<div class="sh-empty"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 7h16l-1.3 11.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8L4 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
        <p style="margin:0">Your list is empty.<br>Search for a part and add it here.</p></div>`;
      return;
    }
    $('bBody').innerHTML = ids.map(id => {
      const b = ns.DB_MAP[id];
      if (!b) return '';
      return `<div class="brow"><div class="n"><b>${b.pn}</b><span>${b.brand} · ${b.type || ''}</span></div>
        <input class="qty" type="number" min="1" value="${items[id].qty}" data-q="${id}">
        <button class="rm" data-rm="${id}" aria-label="Remove">×</button></div>`;
    }).join('') + `<p style="margin-top:20px;font-size:14px;color:var(--body)">Add as many parts as you need. You'll get one consolidated quote back.</p>`;
  }
  // Called after any basket mutation, from whichever entry point triggered it
  // (grid card, modal's own inquiry button) so #bCount / the grid's own
  // "Add to list" buttons / the open basket sheet all stay in sync.
  function syncBasketUI(id) {
    updateBCount();
    document.querySelectorAll(`[data-add="${id}"]`).forEach(btn => {
      const has = ns.Basket.has(id);
      btn.classList.toggle('added', has);
      btn.textContent = has ? 'Added to list' : 'Add to list';
    });
    if ($('basket').classList.contains('on')) renderBasketSheet();
  }
  function initBasket() {
    updateBCount();
    // features.js's toggleInquiry already updates the modal's own inq button;
    // wrap it so the grid + basket sheet stay in sync from every entry point.
    const originalToggleInquiry = window.toggleInquiry;
    window.toggleInquiry = function (id) {
      originalToggleInquiry(id);
      syncBasketUI(id);
    };
    $('bBody').addEventListener('click', e => {
      if (e.target.id === 'inqBack') { renderBasketSheet(); return; }
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
    const items = ns.Basket.items();
    return Object.keys(items).map(id => {
      const b = ns.DB_MAP[id];
      return { brand: b ? b.brand : '', designation: b ? b.pn : id, qty: items[id].qty };
    });
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
        <button class="btn" style="width:100%" type="submit">Send inquiry</button>
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
            $('bBody').innerHTML = `<div class="sh-empty"><p style="margin:0">✓ Inquiry sent. We'll reply within a working day.</p></div>`;
          } else {
            say((res && res.error) || 'Something went wrong. Please try again.', true);
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
