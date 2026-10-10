/* PUBLIC API
 *   MYCELA.esc(value) → text safe to put into HTML, in an element or inside
 *                       a quoted attribute
 *
 * Every piece of catalogue data, and anything else that did not come from
 * this site's own code (a search the visitor typed, an error message), goes
 * through this before it is put into innerHTML. Text set with textContent
 * needs no escaping. tests/escape.js pins it.
 */
(function (ns) {
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  ns.esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"'`]/g, c => MAP[c]);
  };
})(window.MYCELA = window.MYCELA || {});
