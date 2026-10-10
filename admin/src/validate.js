/*
 * Reading and checking an uploaded file.
 *
 *   parseFile(text, kind)       kind 'csv' | 'json' → { records, fileErrors }
 *   validateRecords(records, schema) → { rows, errors }
 *
 * A record is one row as uploaded (column name → value). validateRecords
 * returns clean rows (bearings_db.js field names, numbers as numbers,
 * apps/alt as arrays, empty as null) and every problem found, row by row.
 * The caller rejects the whole file if there is any error.
 */

// Every column an import may carry, in bearings_db.js names.
export const COLUMNS = ['id', 'brand', 'pn', 'type', 'bore', 'od', 'w', 'cr', 'c0r', 'rpm', 'speed_ref',
                        'mass', 'pu', 'f0', 'sealing', 'apps', 'alt', 'source'];
const NUMBERS = ['bore', 'od', 'w', 'cr', 'c0r', 'rpm', 'speed_ref', 'mass', 'pu', 'f0'];
const LISTS = ['apps', 'alt'];
const REQUIRED = ['id', 'brand', 'pn', 'type'];

// ids end up in URLs and HTML attributes on the website: letters, digits
// and _ . - / only (the six NTN-6x/yy ids use /).
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,63}$/;
// The website puts these texts into its pages as they are, so no markup
// characters and no control characters. An apostrophe is fine.
const UNSAFE_TEXT = /[<>"`\u0000-\u001f\u007f]/;
const MAX_TEXT = { pn: 64, source: 200, apps: 100, alt: 64 };

// ── file formats ─────────────────────────────────────────────────────────
export function parseFile(text, kind) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return kind === 'csv' ? parseCsv(text) : parseJson(text);
}

function parseJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    return { records: [], fileErrors: ['the file is not valid JSON'] };
  }
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.rows) ? data.rows : null);
  if (!list) return { records: [], fileErrors: ['JSON must be a list of rows, or { "rows": [...] }'] };
  const fileErrors = [];
  list.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) fileErrors.push(`row ${i + 1} is not an object`);
  });
  if (fileErrors.length) return { records: [], fileErrors };
  const unknown = [...new Set(list.flatMap(r => Object.keys(r)).filter(k => !COLUMNS.includes(k)))];
  if (unknown.length) fileErrors.push(`unknown column(s): ${unknown.join(', ')}. Allowed: ${COLUMNS.join(', ')}`);
  return { records: list.map(r => ({ format: 'json', values: r })), fileErrors };
}

// RFC 4180 CSV: comma separated, first line is the header, fields may be
// quoted with "", and "" inside quotes is a literal quote.
function parseCsv(text) {
  const lines = [];
  let row = [], field = '', quoted = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); lines.push(row); row = []; field = '';
      i += (c === '\r' && text[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (quoted) return { records: [], fileErrors: ['a quoted field is never closed'] };
  if (field !== '' || row.length) { row.push(field); lines.push(row); }
  const nonBlank = lines.filter(l => !(l.length === 1 && l[0].trim() === ''));
  if (!nonBlank.length) return { records: [], fileErrors: ['the file is empty'] };

  const header = nonBlank[0].map(h => h.trim().toLowerCase());
  const fileErrors = [];
  const unknown = header.filter(h => !COLUMNS.includes(h));
  if (unknown.length) fileErrors.push(`unknown column(s): ${unknown.join(', ')}. Allowed: ${COLUMNS.join(', ')}`);
  const dupCols = header.filter((h, k) => header.indexOf(h) !== k);
  if (dupCols.length) fileErrors.push(`column(s) given twice: ${[...new Set(dupCols)].join(', ')}`);
  const records = [];
  nonBlank.slice(1).forEach((cells, k) => {
    if (cells.length !== header.length) {
      fileErrors.push(`row ${k + 1} has ${cells.length} values but the header has ${header.length} columns`);
      return;
    }
    const values = {};
    header.forEach((h, j) => { values[h] = cells[j]; });
    records.push({ format: 'csv', values });
  });
  return { records, fileErrors };
}

// ── row checks ───────────────────────────────────────────────────────────
export function validateRecords(records, schema) {
  const brands = Object.keys(schema.fields.brand.values);
  const types = Object.keys(schema.fields.type.values);
  const sealings = Object.keys(schema.fields.sealing.values);
  const rows = [];
  const errors = [];
  const firstRowOf = new Map();

  records.forEach((rec, k) => {
    const rowNo = k + 1;
    const v = rec.values;
    const out = {};
    const bad = (field, problem) => errors.push({ row: rowNo, id: typeof v.id === 'string' ? v.id : null, field, problem });

    COLUMNS.forEach(c => {
      let x = v[c];
      if (rec.format === 'csv' && typeof x === 'string') {
        x = x.trim();
        if (x === '') x = null;
      }
      if (x === undefined) x = null;

      if (NUMBERS.includes(c)) {
        if (x === null) { out[c] = null; return; }
        const n = typeof x === 'number' ? x : (rec.format === 'csv' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(x) ? Number(x) : NaN);
        if (!Number.isFinite(n)) return bad(c, `must be a number, got ${JSON.stringify(x)}`);
        if (n <= 0) return bad(c, `must be greater than 0, got ${n}`);
        out[c] = n;
        return;
      }
      if (LISTS.includes(c)) {
        if (x === null) { out[c] = []; return; }
        let list = x;
        if (rec.format === 'csv') list = String(x).split(';').map(s => s.trim()).filter(Boolean);
        if (!Array.isArray(list) || list.some(s => typeof s !== 'string')) return bad(c, 'must be a list of texts');
        const wrong = list.find(s => UNSAFE_TEXT.test(s) || s.length > MAX_TEXT[c] || !s.trim());
        if (wrong !== undefined) return bad(c, `item ${JSON.stringify(wrong)} is empty, too long (max ${MAX_TEXT[c]}) or has < > " \` or control characters`);
        if (c === 'alt') {
          const badId = list.find(s => !ID_PATTERN.test(s));
          if (badId !== undefined) return bad(c, `${JSON.stringify(badId)} is not a valid id`);
        }
        out[c] = list;
        return;
      }
      // text
      if (x !== null && typeof x !== 'string') return bad(c, `must be text, got ${JSON.stringify(x)}`);
      if (x !== null) x = x.trim() || null;
      out[c] = x;
    });

    REQUIRED.forEach(c => { if (out[c] == null && !errors.some(e => e.row === rowNo && e.field === c)) bad(c, 'is required'); });
    if (out.id != null) {
      if (!ID_PATTERN.test(out.id)) bad('id', 'may only use letters, digits and _ . - / (max 64 characters), starting with a letter or digit');
      else if (firstRowOf.has(out.id)) bad('id', `duplicate id: also on row ${firstRowOf.get(out.id)}`);
      else firstRowOf.set(out.id, rowNo);
    }
    if (out.brand != null && !brands.includes(out.brand)) bad('brand', `unknown brand ${JSON.stringify(out.brand)}. Known: ${brands.join(', ')}`);
    if (out.type != null && !types.includes(out.type)) bad('type', `unknown type ${JSON.stringify(out.type)}. Known: ${types.join(', ')}`);
    if (out.sealing != null && !sealings.includes(out.sealing)) bad('sealing', `unknown sealing ${JSON.stringify(out.sealing)}. Known: ${sealings.join(', ')}`);
    ['pn', 'source'].forEach(c => {
      if (out[c] == null) return;
      if (out[c].length > MAX_TEXT[c]) bad(c, `is longer than ${MAX_TEXT[c]} characters`);
      if (UNSAFE_TEXT.test(out[c])) bad(c, 'has < > " ` or control characters');
    });
    if (out.bore != null && out.od != null && !(out.bore < out.od)) bad('bore', `bore (${out.bore}) must be smaller than od (${out.od})`);

    out.row_no = rowNo;
    rows.push(out);
  });
  return { rows, errors };
}
