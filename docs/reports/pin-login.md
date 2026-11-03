# Change — Sign in with a PIN

**Branch:** to be created by the owner from this working tree (e.g. `pin-login`); the work was done after `phase7` was merged.
**Date:** 2026-11-02
**Verdict:** READY TO MERGE — **migration 0004 must be applied to both databases before the code reaches them**, or sign-in is refused (on purpose).

---

## What changed

The owner found the 16-character passphrase too long. The iPads now sign in with a **PIN of at least six digits**; a long passphrase still works. The sign-in field asks for the PIN and brings up the iPad's number pad.

A PIN alone would be unsafe. `/ipad1` is public, a million guesses is a short script, and those guesses would also use up the free plan's 100,000 requests a day. So **wrong guesses are now limited**:
- Every wrong PIN is a row in a new table, `login_failures` (migration 0004, additive).
- After **10 wrong PINs within 15 minutes**, every new sign-in is refused with "Too many wrong tries. Try again in N minutes." (`429`, `Retry-After`) until the oldest ages out. At that rate a six-digit PIN takes years to find.
- The check runs before any hashing, so a flood of guesses costs little.
- The lock is **global**, not per address: a guesser with many addresses gets no more guesses.
- **iPads already signed in are not affected:** their 180-day sessions never pass through sign-in.
- **Without migration 0004, sign-in is refused** with a clear message (`503 migration_missing`) rather than left without a limit.
- The limits are plain settings in `wrangler.toml` (`LOGIN_MAX_FAILURES = 10`, `LOGIN_LOCK_SECONDS = 900`).
- The log keeps only a day of rows and is never archived.

**Trade-off (DECISIONS D23):** a guesser could keep *new* sign-ins locked. Signed-in iPads carry on, and the owner can lift a lock in the D1 console (RUNBOOK §14).

| Area | Files |
|---|---|
| Schema | `migrations/0004_login_failures.sql` (new) |
| Server | `functions/api/auth/login.ts` (the limit), `lib-server/db.ts` (`recentLoginFailures`, `recordLoginFailure`), `lib-server/env.ts`, `lib-server/http.ts` (error headers), `wrangler.toml` |
| Fix | `src/islands/album/WritingCanvas.tsx` (always fetch a page's latest strokes on open) |
| Client | `src/islands/SignIn.tsx` (number pad; the server's own words for a lock), `src/config/site.ts` ("Enter the PIN"), `src/lib/types.ts` |
| Script | `scripts/hash-passphrase.mjs`: takes a PIN of 6+ digits or a passphrase of 16+ characters |
| Tests | `tests/login-lock.spec.ts` (new), `tests/session.spec.ts`, `tests/setup/server.ts` (the shared test server keeps the limit out of reach), `tests/e2e/pin.spec.ts` (new) |
| Docs | `ARCHITECTURE.md`, `DECISIONS.md` (D23), `RUNBOOK.md` (§9 Change the PIN, §14 Sign-in is locked), `SETUP-CLOUDFLARE.md`, `PHASE-8-CHECKLIST.md`, `STRUCTURE.md`, `DESIGN.md` |

## Evidence

`tests/login-lock.spec.ts` runs its own server with a small limit (3 wrong in 5 s):
- The right PIN signs in.
- Three wrong PINs, then even the right PIN gets `429 too_many_attempts` ("Try again in 1 minute", `Retry-After` 1–5 s). Further guesses stay locked and add nothing.
- An iPad signed in beforehand is unaffected.
- After the window, the right PIN works again.
- With the table dropped, sign-in answers `503 migration_missing` and sets no cookie.

`tests/session.spec.ts`: the hash script accepts `191226`, and its hash verifies that PIN and refuses `191227`. It refuses a 5-digit PIN, `short`, `abc123` and a command-line argument.

`tests/e2e/pin.spec.ts`:
- the field reads "Enter the PIN", `inputmode="numeric"`, `type="password"`
- a wrong PIN shows "That PIN didn't match…"
- a lock shows the server's "Try again in 10 minutes."

Results:

| Test | Result |
|---|---|
| Typecheck | clean |
| `npm test` | 191 passed |
| `npm run test:auth` | 98 passed |
| `npm run test:e2e` | 92 passed |

## Also found and fixed: a page reopened just after its save could open blank

A full e2e run under load failed once on "saving a page closes it…". The test was right; there was a real race.
1. Once the server confirms a page version, the iPad drops its own copy of the strokes.
2. The album list is re-read a moment later.
3. A page opened in between looked blank: the stale list said "never written on", so it did not ask the server.
4. If the guest then wrote and saved, the new version held only the new strokes. Nothing was lost, but the album would show that version without the earlier writing.

**Fix** (`WritingCanvas.tsx`): opening a page of an existing spread always asks the server for its latest strokes. If that request fails, a page the album believes blank still opens blank; one with saved writing still waits, as before.

**Test** (`canvas.spec.ts`, "a page reopened right after its save is confirmed…"): it holds back the album's re-read and reopens the page in that gap. With the fix it opens with its stroke. With the old line put back it fails (0 strokes). The fix was then restored.

## Owner actions, in order

1. **Apply migration 0004 to the test database first**, then merge to `dev-acceptance`:
   ```bash
   npx wrangler d1 migrations apply wedding-guestbook-test --remote --env preview
   ```
2. Make a new PIN hash: `node scripts/hash-passphrase.mjs` (6+ digits, **not** the wedding date). Put it in Cloudflare as `WRITER_PASSPHRASE_HASH` for **Production**, and for **Preview** if you want the test site on a PIN too. A Preview change needs a redeploy: retry the latest `dev-acceptance` deployment.
3. **Before `main`:** `npx wrangler d1 migrations apply wedding-guestbook --remote`. It applies 0002, 0003 and 0004.
4. Then the go-live steps as before (SETUP-CLOUDFLARE §9).
