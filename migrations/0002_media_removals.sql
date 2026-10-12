-- Taking a photo or video out of the album (owner request after Phase 5).
--
-- Additive only: a new table, nothing existing is altered or dropped. A
-- removal is a new row, never a change to the media row, and the media row
-- and its files in R2 stay — so a removal is undone by deleting its row here
-- (docs/ARCHITECTURE.md, "Removing a photo or video").
--
-- Keyed by the media id it removes: removing twice is one row, and two iPads
-- removing the same item at once cannot conflict.

CREATE TABLE media_removals (
  media_id    TEXT PRIMARY KEY REFERENCES media(id),
  device_id   TEXT NOT NULL,      -- which iPad removed it: 'ipad1' | 'ipad2'
  removed_at  INTEGER NOT NULL    -- epoch ms, server clock
);
