-- catalogue_order keeps the parts in the order the catalogue lists them
-- (bearings_db.js order, new parts after). Search ranks equally good matches
-- in catalogue order, so the published copy must keep it. Set once when a
-- part is first added; changes to a part keep its place.
ALTER TABLE parts ADD COLUMN catalogue_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX parts_catalogue_order ON parts (catalogue_order, id);

-- Every staged row next to the master row with the same id. The single
-- definition of "new" and "changed" for the import preview and the commit.
-- A change is any difference in a data field; provenance columns
-- (brand_source, source_file, import_batch_id, updated_at) do not count.
CREATE VIEW staged_vs_master AS
SELECT
  s.batch_id,
  s.row_no,
  s.id,
  p.id IS NULL AS is_new,
  (p.id IS NOT NULL AND (
       s.brand     IS NOT p.brand
    OR s.pn        IS NOT p.pn
    OR s.type      IS NOT p.type
    OR s.bore      IS NOT p.bore
    OR s.od        IS NOT p.od
    OR s.w         IS NOT p.w
    OR s.cr        IS NOT p.cr
    OR s.c0r       IS NOT p.c0r
    OR s.rpm       IS NOT p.rpm
    OR s.speed_ref IS NOT p.speed_ref
    OR s.mass      IS NOT p.mass
    OR s.pu        IS NOT p.pu
    OR s.f0        IS NOT p.f0
    OR s.sealing   IS NOT p.sealing
    OR s.apps      IS NOT p.apps
    OR s.alt       IS NOT p.alt
    OR s.source    IS NOT p.source
  )) AS is_changed,
  json_object(
    'id', s.id, 'brand', s.brand, 'pn', s.pn, 'type', s.type,
    'bore', s.bore, 'od', s.od, 'w', s.w, 'cr', s.cr, 'c0r', s.c0r,
    'rpm', s.rpm, 'speed_ref', s.speed_ref, 'mass', s.mass, 'pu', s.pu, 'f0', s.f0,
    'sealing', s.sealing, 'apps', json(s.apps), 'alt', json(s.alt), 'source', s.source
  ) AS staged_json,
  CASE WHEN p.id IS NULL THEN NULL ELSE json_object(
    'id', p.id, 'brand', p.brand, 'pn', p.pn, 'type', p.type,
    'bore', p.bore, 'od', p.od, 'w', p.w, 'cr', p.cr, 'c0r', p.c0r,
    'rpm', p.rpm, 'speed_ref', p.speed_ref, 'mass', p.mass, 'pu', p.pu, 'f0', p.f0,
    'sealing', p.sealing, 'apps', json(p.apps), 'alt', json(p.alt), 'source', p.source,
    'brand_source', p.brand_source, 'source_file', p.source_file,
    'import_batch_id', p.import_batch_id, 'updated_at', p.updated_at
  ) END AS master_json
FROM staged_parts s
LEFT JOIN parts p ON p.id = s.id;
