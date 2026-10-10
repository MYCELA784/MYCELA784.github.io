/* MYCELA Features: the inquiry list ("basket")
 * PUBLIC API: MYCELA.Basket | window.toggleInquiry
 *
 * The list is kept in localStorage as { id: { qty } }. The parts themselves
 * come from the search API: MYCELA.Api.known(id) for anything this page has
 * already been sent, and Basket.sync() to fetch the rest (GET /parts).
 */
(function (ns) {
  var KEY = 'mycela_inquiry';

  function load() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { raw = {}; }
    return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  }
  function save(b) {
    try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {}
  }

  var basket = load();
  // 'loading' until the first sync() answers, then 'ready', or 'error' if
  // the API could not be reached.
  var state = Object.keys(basket).length ? 'loading' : 'ready';

  function known(id) { return ns.Api && ns.Api.known(id); }

  // Fetch the parts in the list that this page has not seen yet, then drop
  // entries the API says do not exist, so a stored list cannot carry phantom
  // lines across a catalogue change (an id renamed or removed between
  // visits). Only an answer from the API prunes: if it cannot be reached the
  // list is left alone rather than wiped.
  function sync() {
    var ids = Object.keys(basket);
    if (!ids.length) { state = 'ready'; return Promise.resolve(state); }
    return ns.Api.parts(ids).then(function () {
      var dropped = false;
      Object.keys(basket).forEach(function (id) {
        if (!known(id) && ns.Api.missing(id)) { delete basket[id]; dropped = true; }
      });
      if (dropped) save(basket);
      state = 'ready';
      return state;
    }, function () {
      state = 'error';
      return state;
    });
  }

  // List entries whose part this page has, in insertion order, each with
  // { id, qty, bearing }. Single source of truth for what the list
  // "contains": the sheet, the header badge and the inquiry payload all
  // read this, so none can disagree with another.
  function resolvedItems() {
    return Object.keys(basket)
      .filter(function (id) { return known(id); })
      .map(function (id) { return { id: id, qty: basket[id].qty, bearing: known(id) }; });
  }

  function count() { return resolvedItems().length; }
  function has(id) { return Object.prototype.hasOwnProperty.call(basket, id); }
  function add(id) { if (!has(id)) basket[id] = { qty: 10 }; save(basket); }
  function remove(id) { delete basket[id]; save(basket); }
  function setQty(id, q) { if (has(id)) { basket[id].qty = Math.max(1, Math.round(q)); save(basket); } }

  // The modal's own add/remove button. No inline handler: js/app.js listens
  // for clicks on [data-inq].
  function modalBtnHTML(b) {
    var id = ns.esc(b.id);
    if (has(b.id)) {
      return '<button id="m-inq-btn" class="inq-btn inq-remove" data-inq="' + id + '">✕ Remove from inquiry</button>';
    }
    return '<button id="m-inq-btn" class="inq-btn" data-inq="' + id + '">+ Add to inquiry</button>';
  }

  ns.Basket = { count: count, has: has, add: add, remove: remove, setQty: setQty,
                modalBtnHTML: modalBtnHTML, sync: sync,
                state: function () { return state; },
                // Stored entries whose part is not on the page (yet).
                unresolved: function () { return Object.keys(basket).length - count(); },
                items: function () { return basket; },
                resolvedItems: resolvedItems };

  window.toggleInquiry = function (id) {
    if (has(id)) remove(id); else add(id);
    var mb = document.getElementById('m-inq-btn');
    if (mb && ns._modalId === id) {
      var b = known(id);
      if (b) mb.outerHTML = modalBtnHTML(b);
    }
  };
})(window.MYCELA = window.MYCELA || {});
