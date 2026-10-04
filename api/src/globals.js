/*
 * The site's modules are browser scripts: each one attaches to
 * window.MYCELA, and some read the bare global MYCELA. Give them both
 * before any of them is imported. Must be the first import in search.js.
 */
globalThis.window = globalThis.window || globalThis;
globalThis.MYCELA = globalThis.window.MYCELA = globalThis.window.MYCELA || {};
