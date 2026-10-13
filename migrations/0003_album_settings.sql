-- The album's look, chosen in Settings (owner request after Phase 5).
--
-- Additive only: a new table, nothing existing is altered. Saving a look is a
-- new row, never an update — the latest row is the look in use, and every
-- earlier one stays, so any past look can be brought back.

CREATE TABLE album_settings (
  id          TEXT PRIMARY KEY,   -- made on the iPad: 'ipad1-01JA2BX7F3K9XYZ'
  device_id   TEXT NOT NULL,      -- which iPad saved it
  data        TEXT NOT NULL,      -- JSON: the look (src/lib/settings.ts)
  created_at  INTEGER NOT NULL    -- epoch ms, server clock: the latest wins
);

CREATE INDEX idx_album_settings_created ON album_settings(created_at DESC, id DESC);
