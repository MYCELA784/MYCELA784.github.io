/* PUBLIC API
 *   MYCELA.Router.showPage(name)  — 'home' | 'search' | 'suppliers'
 */
(function (ns) {
  function showPage(p) {
    document.querySelectorAll('.page').forEach(e => e.classList.remove('active'));
    document.getElementById('page-' + p).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(e => e.classList.remove('active'));
    const nl = document.getElementById('nl-' + p); if (nl) nl.classList.add('active');
    window.scrollTo(0, 0);
  }

  ns.Router = { showPage };
})(window.MYCELA = window.MYCELA || {});
