/* MYCELA Features: inquiry basket, autocomplete, dimension finder, query routing
 * PUBLIC API: MYCELA.Basket, MYCELA.QueryPrep | window.toggleInquiry, showInquiry, dimFind
 */
(function (ns) {
  var KEY = 'mycela_inquiry';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(b) {
    try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {}
  }

  var basket = load();

  function count() { return Object.keys(basket).length; }
  function has(id) { return !!basket[id]; }
  function add(id) { basket[id] = basket[id] || { qty: 10 }; save(basket); }
  function remove(id) { delete basket[id]; save(basket); }
  function setQty(id, q) { if (basket[id]) { basket[id].qty = Math.max(1, Math.round(q)); save(basket); } }

  function updateNav() {
    var el = document.getElementById('inq-count');
    if (el) el.textContent = count();
  }

  function safeId(id) { return id.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function btnHTML(b) {
    if (has(b.id)) {
      return '<button class="inq-btn inq-in" onclick="event.stopPropagation();toggleInquiry(\'' + safeId(b.id) + '\')">✓ In inquiry list</button>';
    }
    return '<button class="inq-btn" onclick="event.stopPropagation();toggleInquiry(\'' + safeId(b.id) + '\')">+ Add to inquiry</button>';
  }

  function modalBtnHTML(b) {
    if (has(b.id)) {
      return '<button id="m-inq-btn" class="inq-btn inq-remove" onclick="toggleInquiry(\'' + safeId(b.id) + '\')">✕ Remove from inquiry</button>';
    }
    return '<button id="m-inq-btn" class="inq-btn" onclick="toggleInquiry(\'' + safeId(b.id) + '\')">+ Add to inquiry</button>';
  }

  ns.Basket = { count: count, has: has, add: add, remove: remove, setQty: setQty,
                btnHTML: btnHTML, modalBtnHTML: modalBtnHTML, updateNav: updateNav,
                items: function () { return basket; } };

  window.toggleInquiry = function (id) {
    if (has(id)) remove(id); else add(id);
    updateNav();
    var cb = document.getElementById('cardbtn-' + id);
    if (cb) { var b = ns.DB_MAP[id]; if (b) cb.innerHTML = btnHTML(b); }
    var mb = document.getElementById('m-inq-btn');
    if (mb && ns._modalId === id) {
      var bb = ns.DB_MAP[id];
      if (bb) mb.outerHTML = modalBtnHTML(bb);
    }
    if (document.getElementById('inquiry-page')) window.showInquiry();
  };

  window.showInquiry = function () {
    showPage('search');
    var el = document.getElementById('results-area');
    var countEl = document.getElementById('results-count');
    if (countEl) countEl.style.display = 'none';
    var fb = document.getElementById('filter-bar');
    if (fb) fb.style.display = 'none';
    if (!el) return;

    var ids = Object.keys(basket);
    if (!ids.length) {
      el.innerHTML = '<div id="inquiry-page" class="empty-state">' +
        '<div class="empty-title">Your inquiry list is empty</div>' +
        '<div class="empty-sub">Add bearings from search results or the spec view, set quantities, and send one inquiry.</div>' +
        '<button class="inq-back" onclick="doSearch()">← Back to search</button></div>';
      return;
    }

    var rows = ids.map(function (id) {
      var b = ns.DB_MAP[id];
      if (!b) return '';
      var s = safeId(id);
      var c = (ns.BRAND_COLORS && ns.BRAND_COLORS[b.brand]) || '#17150F';
      return '<div class="inq-row">' +
        '<span class="xref-chip-brand" style="background:' + c + '">' + b.brand + '</span>' +
        '<span class="inq-pn" onclick="openModal(\'' + s + '\')" title="View specs">' + b.pn + '</span>' +
        '<span class="inq-dims">' + b.bore + '×' + b.od + '×' + b.w + ' mm</span>' +
        '<span style="flex:1"></span>' +
        '<label class="inq-qty-lbl">Qty</label>' +
        '<input type="number" class="inq-qty" value="' + basket[id].qty + '" min="1" step="1" onchange="MYCELA.Basket.setQty(\'' + s + '\', this.value)"/>' +
        '<button class="inq-remove-btn" onclick="toggleInquiry(\'' + s + '\')">Remove</button>' +
        '</div>';
    }).join('');

    el.innerHTML = '<div id="inquiry-page" class="inq-card">' +
      '<div class="inq-head"><span class="m-sec-lbl" style="margin:0">INQUIRY LIST · ' + ids.length + ' ITEMS</span>' +
      '<button class="inq-back" onclick="doSearch()">← Keep searching</button></div>' +
      '<div class="inq-tip">Tip: click a part number to reopen its full specs.</div>' +
      rows +
      '<button class="inq-send inq-soon" disabled title="Coming soon">Send Inquiry — Coming Soon</button>' +
      '<div class="inq-note">Inquiry submission launches soon. Meanwhile, use Copy PN to share part numbers with your supplier.</div>' +
      '</div>';
  };

  // ── Autocomplete (search page + hero) ─────────────────────────────────────
  function attachAutocomplete(inputId, boxId, onPick) {
    var input = document.getElementById(inputId);
    if (!input || document.getElementById(boxId)) return;

    var wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var box = document.createElement('div');
    box.id = boxId;
    box.style.display = 'none';
    wrap.appendChild(box);

    input.addEventListener('input', function () {
      var v = input.value.trim().toUpperCase().replace(/\s+/g, '');
      if (v.length < 2) { box.style.display = 'none'; return; }
      var hits = [];
      for (var i = 0; i < ns.DB.length && hits.length < 5; i++) {
        var b = ns.DB[i];
        if ((b.pn || '').toUpperCase().replace(/\s+/g, '').indexOf(v) === 0) hits.push(b);
      }
      if (!hits.length) { box.style.display = 'none'; return; }
      box.innerHTML = '';
      hits.forEach(function (b) {
        var c = (ns.BRAND_COLORS && ns.BRAND_COLORS[b.brand]) || '#17150F';
        var item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = '<span class="ac-pn">' + b.pn + '</span>' +
          '<span class="xref-chip-brand" style="background:' + c + '">' + b.brand + '</span>' +
          '<span class="ac-dims">' + b.bore + '×' + b.od + '×' + b.w + '</span>';
        item.addEventListener('click', function () {
          input.value = b.pn;
          box.style.display = 'none';
          onPick();
        });
        box.appendChild(item);
      });
      box.style.display = 'block';
    });

    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) box.style.display = 'none';
    });
  }

  function initAutocomplete() {
    attachAutocomplete('search-input', 'ac-box', function () { window.doSearch(); });
    attachAutocomplete('hero-input', 'ac-box-hero', function () { window.heroSearch(); });
  }

  // ── Dimension finder ───────────────────────────────────────────────────────
  window.dimFind = function () {
    var b = parseFloat(document.getElementById('dim-bore').value); if (isNaN(b)) b = null;
    var d = parseFloat(document.getElementById('dim-od').value);   if (isNaN(d)) d = null;
    var w = parseFloat(document.getElementById('dim-w').value);    if (isNaN(w)) w = null;
    var t = parseFloat(document.getElementById('dim-tol').value) || 0;
    if (b === null && d === null && w === null) {
      alert('Enter at least one dimension.');
      return;
    }
    var hits = ns.DB.filter(function (x) {
      if (b !== null && Math.abs((x.bore || 0) - b) > t) return false;
      if (d !== null && Math.abs((x.od || 0) - d) > t) return false;
      if (w !== null && Math.abs((x.w || 0) - w) > t) return false;
      return true;
    });
    hits.forEach(function (x) { x._score = x.cr || 0; x._matchType = 'DIMS'; });
    ns.State = ns.State || {};
    ns.State.results = hits;
    var fb = document.getElementById('filter-bar');
    if (fb) fb.style.display = '';
    var countEl = document.getElementById('results-count');
    if (countEl) countEl.style.display = '';
    ns.Renderer.cards(hits, { tf: 'All', bf: 'All' });
  };

  // ── Query normalization + dimension-intent routing ─────────────────────────
  function normalizeQuery(q) {
    return q
      .replace(/\b(inner\s*dia(meter)?|i\.?d\.?)\b/gi, 'bore')
      .replace(/\b(outer\s*dia(meter)?|o\.?d\.?)\b/gi, 'od');
  }

  function extractDims(q) {
    function grab(label) {
      var m = q.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:mm)?\\s*' + label + '\\b', 'i')) ||
              q.match(new RegExp('\\b' + label + '\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)', 'i'));
      return m ? parseFloat(m[1]) : null;
    }
    return { bore: grab('bore'), od: grab('od'), w: grab('width') };
  }

  function tryDimRoute(q) {
    var d = extractDims(q);
    if (d.bore === null || d.od === null) return false;
    var bi = document.getElementById('dim-bore');
    var di = document.getElementById('dim-od');
    var wi = document.getElementById('dim-w');
    if (bi) bi.value = d.bore;
    if (di) di.value = d.od;
    if (wi) wi.value = d.w !== null ? d.w : '';
    showPage('search');
    window.dimFind();
    return true;
  }

  ns.QueryPrep = { normalize: normalizeQuery, dimRoute: tryDimRoute };

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() { updateNav(); initAutocomplete(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.MYCELA = window.MYCELA || {});