-- Initial schema, exactly as docs/ARCHITECTURE.md (Data model).
-- Append-only once applied to the live database: changes go in a new numbered file.
--
-- Every write is an INSERT of a new row keyed by a device-prefixed ULID
-- generated on the iPad, so two devices writing at once touch disjoint rows.
-- Nothing here is ever updated in place.

CREATE TABLE entries (
  id          TEXT PRIMARY KEY,   -- 'ipad1-01JA2BX7F3K9XYZ'
  device_id   TEXT NOT NULL,      -- 'ipad1' | 'ipad2'
  position    INTEGER,            -- advisory, for manual reordering later
  title       TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL    -- epoch ms
);

CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES entries(id),
  kind        TEXT NOT NULL,      -- 'photo' | 'video'
  r2_key      TEXT NOT NULL,
  poster_key  TEXT,               -- first frame, videos only
  thumb_key   TEXT NOT NULL,
  width       INTEGER,
  height      INTEGER,
  duration_ms INTEGER,            -- videos only
  bytes       INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE canvases (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT NOT NULL REFERENCES entries(id),
  r2_key       TEXT NOT NULL,     -- flattened PNG at 2x DPR
  stroke_data  TEXT NOT NULL,     -- JSON vector strokes
  version      INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_entries_created ON entries(created_at);
CREATE INDEX idx_media_entry     ON media(entry_id, sort_order);
CREATE INDEX idx_canvases_entry  ON canvases(entry_id, version DESC);
