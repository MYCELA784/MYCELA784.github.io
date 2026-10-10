-- Private master database (D1 "mycela-master"). Applied in order with
-- `wrangler d1 migrations apply` from admin/. Never edit a migration that
-- has been applied anywhere: add a new numbered file instead.

-- One row per bearing: every field we hold, published or not.
-- apps and alt are JSON arrays stored as text.
CREATE TABLE parts (
  id              TEXT PRIMARY KEY,
  brand           TEXT NOT NULL,
  pn              TEXT NOT NULL,
  type            TEXT NOT NULL,
  bore            REAL,
  od              REAL,
  w               REAL,
  cr              REAL,
  c0r             REAL,
  rpm             REAL,
  speed_ref       REAL,
  mass            REAL,
  pu              REAL,
  f0              REAL,
  sealing         TEXT,
  apps            TEXT,
  alt             TEXT,
  source          TEXT,
  brand_source    TEXT,
  source_file     TEXT,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id),
  updated_at      TEXT NOT NULL
);
CREATE INDEX parts_brand_pn ON parts (brand, pn);

-- One row per uploaded file, whatever happened to it.
CREATE TABLE import_batches (
  id           INTEGER PRIMARY KEY,
  source_name  TEXT NOT NULL,
  file_name    TEXT,
  file_sha256  TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'rejected')),
  error_report TEXT,
  committed_by TEXT,
  committed_at TEXT
);

-- Rows of a staged batch, waiting for commit. Same fields as parts.
CREATE TABLE staged_parts (
  batch_id  INTEGER NOT NULL REFERENCES import_batches(id),
  row_no    INTEGER NOT NULL,
  id        TEXT NOT NULL,
  brand     TEXT NOT NULL,
  pn        TEXT NOT NULL,
  type      TEXT NOT NULL,
  bore      REAL,
  od        REAL,
  w         REAL,
  cr        REAL,
  c0r       REAL,
  rpm       REAL,
  speed_ref REAL,
  mass      REAL,
  pu        REAL,
  f0        REAL,
  sealing   TEXT,
  apps      TEXT,
  alt       TEXT,
  source    TEXT,
  PRIMARY KEY (batch_id, id)
);

-- Who did what, when. Append-only: the triggers below refuse any UPDATE
-- or DELETE, from the admin Worker or anything else.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  batch_id    INTEGER,
  before_json TEXT,
  after_json  TEXT
);
CREATE INDEX audit_log_entity ON audit_log (entity, entity_id);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- One row per published catalogue version (KV key published/v<version>).
CREATE TABLE publishes (
  version   INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  sha256    TEXT NOT NULL
);
