/* PUBLIC API
 *   MYCELA.SupplierForm.submit()
 */
(function (ns) {
  function submit() {
    const name  = document.getElementById('f-name').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    if (!name || !email || !phone) {
      alert('Please fill in Business Name, Email, and Phone Number to continue.');
      return;
    }
    document.getElementById('reg-form-card').style.display  = 'none';
    document.getElementById('success-email').textContent    = email;
    document.getElementById('form-success').style.display   = 'block';
  }

  ns.SupplierForm = { submit };
})(window.MYCELA = window.MYCELA || {});
