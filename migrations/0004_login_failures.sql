-- Sign-in protection for a short PIN (owner request before go-live).
--
-- A six-digit PIN is a million possibilities: guessable by a script unless
-- guesses are limited. Every wrong PIN is a row here; when too many fall in
-- the window, the server refuses new sign-ins until they age out
-- (functions/api/auth/login.ts). iPads already signed in are not affected.
--
-- Additive only: a new table, nothing existing is altered. Unlike the
-- album's tables it is a log, not a keepsake: rows older than a day are
-- deleted as new ones arrive, and it is never archived.

CREATE TABLE login_failures (
  id  TEXT PRIMARY KEY,   -- random, made by the server
  at  INTEGER NOT NULL    -- epoch ms, server clock
);

CREATE INDEX idx_login_failures_at ON login_failures(at);
