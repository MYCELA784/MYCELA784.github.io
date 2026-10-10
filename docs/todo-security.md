# Security to-do

- [x] **Done 2026-10-10, in the website-switch step (branch `site-switch`).**
  renderer.js inserts data into HTML without escaping (XSS risk). Upload
  validation blocks < > " ` as a stopgap; the website must escape all text it
  displays. Fix in the website-switch step.

  What was done: every value the page shows that comes from a part, from the
  visitor or from an error now goes through one function, `MYCELA.esc`
  (`js/escape.js`), or is set as plain text. Part ids are carried in `data-`
  attributes and acted on by listeners; no inline handler is built from data
  any more. `node tests/escape.js` feeds the page parts whose fields contain
  `<img src=x onerror=alert(1)>` and fails if any of it reaches the page as
  markup.

  The upload validation that blocks < > " ` (`admin/src/validate.js`) stays
  as a second line of defence. It is no longer the only one.

Nothing else is open on this list.
