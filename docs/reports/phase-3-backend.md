# Phase 3 — Backend

**Branch:** `phase3` (as checked out by the owner; `PHASES.md` names it `phase-3-backend`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE. The code is complete, and the owner's Cloudflare setup is done and verified (see "Cloudflare setup, verified").

---

## What was built

The guest book now has a backend: Cloudflare Pages Functions over D1 (metadata) and R2 (files), with sign-in. The album on `/` and on the iPad pages now shows **real entries** from the API; the Phase 2 placeholder data is deleted. On `/ipad1` and `/ipad2`, a signed-out iPad sees one thing above the album: **"Enter the passphrase"**. After signing in, it gets the Phase 2 writer surface (rail, selection), and stays signed in for 180 days.

**How a write is protected:**
- **Two locks, both must agree.** `functions/api/_middleware.ts` denies by default: only reading the album, reading files, and signing in work without a session. Every write handler then checks the session *again* before touching D1 or R2. I proved both locks are real by removing them one at a time (see Tests).
- **The session** is a cookie signed with HMAC-SHA256 via Web Crypto: `__Host-gb_session`, `HttpOnly; Secure; SameSite=Lax`. Page JavaScript cannot read it. Rotating `SESSION_SIGNING_KEY` revokes every session at once.
- **The passphrase** is stored only as a PBKDF2 hash in an encrypted Cloudflare variable and compared in constant time. `scripts/hash-passphrase.mjs` makes that hash. It asks with the typing hidden, refuses the passphrase as a command-line argument (shell history), and refuses anything under 16 characters.
- **The device label comes from the session, never from the request.** A `device_id` in the body or query string is ignored. An iPad 1 session cannot even submit an id that starts with `ipad2-`.
- **Writes from other websites are refused** (`Origin` check), on top of `SameSite=Lax`.

**How data is kept safe:**
- **Every write is an INSERT** of an id made on the iPad (`{device}-{ULID}`). Nothing is updated or deleted.
- **Retries are harmless:** the same id twice is a `200` the second time, never a duplicate row.
- **Uploads are two steps** (new DECISIONS D15). Each file streams straight into R2 and is checked by its *own leading bytes*; the client's claimed type is ignored. A small JSON "commit" then writes the D1 row, but only after confirming every file is in storage. That is the "not saved until both R2 and D1 confirm" rule, and it gives Phase 4's offline queue a natural retry point. **A committed item's files can never be replaced.**
- **Canvas versions are numbered by the database, atomically**, in a single INSERT. Two iPads saving one page in the same instant get versions n and n+1, and every earlier version stays.

**Files:**

| Area | Files |
|---|---|
| Schema | `migrations/0001_init.sql`: exactly ARCHITECTURE.md's schema (checked with `diff`) |
| Gate | `functions/api/_middleware.ts` |
| Auth | `functions/api/auth/login.ts`, `logout.ts`, `session.ts` |
| Album | `functions/api/entries.ts` (GET public with a 30 s edge cache; POST create) |
| Media | `functions/api/media/[id]/[part].ts` (stream one file), `functions/api/media.ts` (commit) |
| Pages | `functions/api/canvas/[id].ts` (stream PNG), `functions/api/canvas.ts` (commit + version) |
| Gauge | `functions/api/stats.ts` |
| Files | `functions/api/files/[[key]].ts`: public, serves only API-shaped keys, byte ranges (Safari needs them for video), `immutable` |
| Server library | `lib-server/`: `session`, `passphrase`, `bytes` (base64url, `timingSafeEqual`), `guard`, `http`, `ids`, `files`, `upload`, `db`, `env` |
| Types | `functions/tsconfig.json` + generated `functions/worker-runtime.d.ts` (runtime types only, so type generation never reads a secrets file) |
| Client | `src/lib/api.ts` (typed client), `src/lib/devices.ts`, `src/islands/SignIn.tsx`, `GuestBook.tsx` (loads entries, checks session) |
| Config | `wrangler.toml`: production + `[env.preview]` with separate test storage; plain settings in `[vars]` |
| Tests | `vitest.config.ts`, `tests/setup/` (starts Wrangler with throwaway secrets and a fresh DB), `tests/helpers.ts`, four spec files |
| Script | `scripts/hash-passphrase.mjs` |
| Removed | `src/lib/placeholder-album.ts`, `placeholder-ink.ts`, `src/pages/placeholder/` (as planned) |
| Dev tooling added | `vitest@5.0.3`, `@types/node@22.20.5` (devDependencies). Runtime dependencies are still exactly 4 |

---

## Acceptance criteria

All tests run against the real Functions under `wrangler pages dev`, over HTTP, with local D1 + R2. Nothing is mocked.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Migration applies cleanly to a fresh D1 database | PASS (local and remote) | `wrangler d1 migrations apply wedding-guestbook --local --persist-to <empty dir>` → `7 commands executed successfully`, `0001_init.sql ✅`, tables `entries media canvases` + 3 indexes. Every test run does this again on a new empty database. Remote: the owner applied it to both real databases; checked read-only with `wrangler d1 migrations list … --remote` → `✅ No migrations to apply!` for each, and `sqlite_master` lists `canvases, entries, media` + the 3 indexes in both |
| 2 | `POST /api/entries` with no cookie → 401 | PASS | `auth.spec.ts › POST /api/entries › rejects no cookie with 401` |
| 3 | … with a forged cookie → 401 | PASS | "forged: valid payload, signed with another key", plus "tampered: real signature, payload edited" and "unsigned" |
| 4 | … with an expired cookie → 401 | PASS | "expired: signed with the real key" |
| 5 | … with a valid cookie → 201 | PASS | `valid session › POST /api/entries → 201`; 200 simultaneous 201s in `concurrency.spec.ts` |
| 6 | Every mutating endpoint rejects unauthenticated requests, verified individually | PASS | 8 protected endpoints × 7 bad cookies = **56 tests, all 401**: `POST /api/entries`, `PUT /api/media/{id}/original`, `POST /api/media`, `PUT /api/canvas/{id}`, `POST /api/canvas`, `GET /api/stats`, `GET /api/auth/session`, `POST /api/auth/logout`. Afterwards, none of the attempted entries or files exist (D1 and R2 checked). An unknown `/api` route, and `DELETE`, are 401 too |
| 7 | `GET /api/entries` works unauthenticated | PASS | `public routes › GET /api/entries works with no cookie` → 200 |
| 8 | A client-supplied `device_id` cannot grant permission | PASS | Valid iPad 1 session + `device_id: ipad2` in body **and** query → stored as `ipad1`. An iPad 1 session posting an `ipad2-…` id → 400 `id_wrong_device`, not stored. No cookie + `device_id` in body or query → 401 |
| 9 | 200 simultaneous writes as ipad1 and ipad2 → 200 distinct rows, zero collisions, zero lost | PASS (local D1) | 200 entries fired at once, alternating devices: 200 × 201, exactly +200 rows, each with its own device label. 200 simultaneous media commits across shared entries: 200 rows, ids match, files present. Both iPads saving one page in the same instant: both 201, versions {1, 2}, both PNGs kept. 50 simultaneous saves of one page: versions exactly 1–50. A retry burst creates nothing new. Run on local D1 (SQLite under workerd); I'd like to re-run it once against the real test database |
| 10 | No secret appears in any client bundle | PASS | Output below. Note: the real secrets exist only in Cloudflare's runtime and are never available to the build, so they *cannot* be in `dist/`; the grep confirms no server code or secret handling leaked into the client either |
| 11 | Billing alert configured in Cloudflare | PASS (owner confirmed) | The owner created a "Usage based billing" alert on **R2 Storage** at 5,000,000,000 bytes (5 GB, half the free allowance), alongside Cloudflare's default budget alert. Note: that field is in **bytes**; "5" would have meant 5 bytes |

```
$ grep -r -l -E "SESSION_SIGNING_KEY|WRITER_PASSPHRASE_HASH|pbkdf2-sha256|deriveBits|signSession|verifySession|verifyPassphrase|lib-server|importKey" dist/
exit 1 (1 = no matches)
$ grep -r -l -F "<the run's test passphrase>" dist/
exit 1 (1 = no matches)
$ grep -rn -E "from ['\"][./]*lib-server" src/
exit 1 (none: src/ never imports lib-server/)
```

---

## Tests

```
$ npm test
 Test Files  4 passed (4)
      Tests  101 passed (101)
   tests/auth.spec.ts         75 passed   authorization matrix, sign-in, injection, key rotation, no-trace
   tests/concurrency.spec.ts   6 passed   200 entries, 200 media, simultaneous canvas versions, counts
   tests/uploads.spec.ts      13 passed   byte signatures, size + duration ceilings, commit rules, ranges
   tests/session.spec.ts       7 passed   token tamper/expiry, timingSafeEqual, passphrase + script
   Duration ~9 s
```

- **The tests can fail.** Two sabotage runs, each restored and re-verified:
  1. Removing the middleware's session check: every protected endpoint *still* answered 401, because the handler locks held. Only "unknown route is denied" failed.
  2. Also removing `POST /api/entries`'s own check: **11 tests failed**, including all 7 bad-cookie cases and the no-trace check, which found the sneaked-in rows.
- **Key rotation is tested for real.** A server starts with key A and a cookie is issued; the server restarts with key B. The old cookie gets 401 on read and write, and a new sign-in works.
- `npm run typecheck`: clean across the site, the tests, and the Functions (Workers types, no DOM).
- `npm run build`: 0 warnings.

---

## Verified by hand

In Chrome, against the built site with test secrets and three entries seeded through the API:
- **Public `/`:** 3 spreads from real data (thumbnails via `/api/files`, page PNGs). No rail, no sign-in.
- **`/ipad1` signed out:** only "Enter the passphrase", under the device's name ("iPad 1"; "iPad 2" on `/ipad2`, from `site.devices`, also in the tab title), so the two iPads are never mixed up; mounts not selectable. Lighthouse accessibility 100 with the label added.
- **Wrong passphrase** (typed and submitted by keyboard): "That passphrase didn't match. Check it and try again." with `aria-invalid`. Shown with a `--warn` edge bar; the text stays `--on-leaf` (see "Problems", item 7).
- **Right passphrase:** the rail appears and mounts become selectable. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and `document.cookie` cannot see it. **Reload: still signed in.** `/ipad2` asks again, because the session is iPad 1's.
- **Lighthouse on the sign-in page:** performance 100, **accessibility 100**. Best practices 96, because the browser logs the expected `401` when a signed-out page asks whether it's signed in. That is correct HTTP, so I left it.
- **By curl:** a cross-site `POST` with a valid cookie → 403. A 16-second video → 413. A text file sent as a JPEG → 415, not kept. A QuickTime `.mov` → 415. A byte range → 206; a range past the end → 416. `/api/files/../wrangler.toml` → refused.

---

## Needs a real device

| What to test | On | What good looks like | What to watch for |
|---|---|---|---|
| Sign-in | Both iPads, on the preview URL | Passphrase accepted; the rail appears | Keyboard covering the field; password-manager prompts that confuse |
| Staying signed in | Both iPads | Close Safari completely, reopen `/ipad1`: no prompt | Asked again (cookie not persisted) |
| Wrong passphrase | iPad | Clear message, field keeps focus | Silent failure |
| Album loads on the preview | Phone + iPad | Entries appear within a second or two | "The album didn't load" |

---

## Deferred

- **Capture UI, the offline queue, "Saving… / Saved / Not saved", and the storage gauge** (Phase 4). The upload, commit and stats endpoints they need exist and are tested.
- **Verifying video duration from the file itself** (Phase 4: read the MP4 `mvhd` box). Today the server enforces the 15 s cap on the duration the iPad reports.
- **The album shows thumbnails;** full media on tap (Phase 4).
- **A "Sign out" button.** The endpoint exists and is tested; there's no UI yet. Not in any phase; easy to add if wanted.
- **Login rate limiting.** It would need a store beyond D1/R2 (KV or Durable Objects) or a WAF rule on a custom domain. The defence chosen is passphrase length (DECISIONS D6).
- **Cleaning up orphaned files** from uploads that were never committed. They're unreferenced and harmless; Phase 6's export can skip them or a later sweep can remove them.
- Still open from earlier phases: 404 page / `robots.txt`, security headers + CSP (Phase 7), share-preview metadata.

---

## Problems and surprises

1. **The free plan's CPU limit shaped the passphrase hash.** Workers get ~10 ms of CPU per request; PBKDF2 at 100,000 iterations measured **23 ms** on an M2 Pro. It runs at **20,000 (~5 ms)**. The hash never leaves Cloudflare's encrypted store, so the real defence is a long passphrase, and the script enforces 16+ characters. The count is stored inside the hash and can be raised later. Recorded in DECISIONS D6.
2. **ARCHITECTURE's canvas key would have lost data.** `canvases/{entry}/v{version}.png`: the version is only known at commit, after the PNG is stored, so two iPads saving one page at once would both write `v3.png` and one would vanish. Keys now use the canvas id (DECISIONS D16); the version stays in the row. Docs updated.
3. **Uploads became two steps instead of one multipart POST** (DECISIONS D15). Buffering a 15 MB video through a Function costs CPU the free plan doesn't have, while streaming costs almost none. It also makes "saved" a single, checkable moment.
4. **The middleware lives in `functions/api/`, not `functions/`** as STRUCTURE first said. At the root, every image and page request would invoke a Function, and those count against 100,000 a day. Now only `/api/*` does.
5. **I caught a caching bug in my own first version.** The public album was sent as `max-age=30`, which also lets *browsers* keep it, and a browser's cache is keyed by URL, not cookie. A writer who had just signed in, or later just saved, could have been shown a stale album for 30 seconds. Now only Cloudflare's edge may cache it (`max-age=0, s-maxage=30`), and signed-in iPads always fetch with `no-store`. Re-verified: public sees the cached copy, the signed-in iPad sees its new entry at once.
6. **The edge cache only works on a custom domain;** on `*.pages.dev` it's skipped. Without it, every album view reads every row. D1's free allowance of 5 million row reads a day still covers roughly 3,000 full-album views a day at ~1,500 rows each. That's comfortable for a wedding, but worth a custom domain if the link spreads far.
7. **`--warn` fails AA as small text** (4.3:1 on the leaf). DESIGN.md says "Not saved" shows in `--warn` text, so **Phase 4 must not use it for small text alone.** The sign-in error already pairs a `--warn` bar with readable text; Phase 4 should do the same.
8. **Sign-out is per browser.** Sessions are stateless, so signing out clears the cookie but can't revoke a copied token before it expires. Rotation is the revocation, as ARCHITECTURE already says; now spelled out in D6.
9. **Endpoints were added to ARCHITECTURE's table:**
   - `GET /api/auth/session`: the cookie is HttpOnly, so the page has to ask.
   - `GET /api/files/…`: the album has to load stored files from somewhere.
   - the two `PUT` upload routes.
10. **The placeholder album is gone.** Until real entries exist, `/` says "Nothing here yet." If you want something to look at on the preview, I can add a small seeding script for the **test** database.
11. **`functions/worker-runtime.d.ts` is 623 KB of generated types.** It's committed so type-checking works offline; regenerate it with the command in STRUCTURE.md after a Wrangler upgrade.
12. **Still unverified against a real account:** that Pages takes bindings from `wrangler.toml` and shows them read-only in the dashboard. SETUP-CLOUDFLARE.md §5 now assumes so; the first deploy will tell.

**Docs updated:**
- ARCHITECTURE: API table, deny-by-default, two-step uploads, caching, R2 key layout.
- STRUCTURE: the functions, lib-server and tests trees.
- SETUP-CLOUDFLARE §3–7: rewritten as the exact Phase 3 checklist (two databases, two buckets, hidden-prompt hash, migration commands).
- TESTING: how the suite runs, with throwaway secrets.
- DECISIONS: D6 (hash parameters, sign-out), D15, D16.
- PHASES: Phase 4 uses the upload API.
- `.env.example`: only the two secrets, local-only values.

---

## Cloudflare setup, verified

The owner did SETUP-CLOUDFLARE §2–7. Checked with read-only Wrangler commands; no secret value was read or shown (Wrangler cannot display them):

| Check | Result |
|---|---|
| Pages project | `wedding-guest-book` → `wedding-guest-book.pages.dev`, connected to Git |
| D1 `wedding-guestbook` (production) | Migration applied; tables `entries`, `media`, `canvases` + 3 indexes |
| D1 `wedding-guestbook-test` (preview) | Same |
| R2 buckets | `wedding-media`, `wedding-media-test` |
| Secrets, production | `SESSION_SIGNING_KEY`, `WRITER_PASSPHRASE_HASH` |
| Secrets, preview | `SESSION_SIGNING_KEY`, `WRITER_PASSPHRASE_HASH` |
| `wrangler.toml` | Real database IDs for both environments |

**First deploy:** the production branch `main` failed to build because `main` still holds only the docs (no `package.json`); that is expected until `dev-acceptance` is promoted. `dev-acceptance` deploys as a preview, against the test database and bucket.

---

## Owner actions after merging

- [ ] Commit `phase3`, open a PR into `dev-acceptance`, merge.
- [ ] Check the `dev-acceptance` preview deployment succeeds (Workers & Pages → wedding-guest-book → Deployments). If it fails, send the last lines of the build log.
- [ ] On each iPad, open `<preview URL>/ipad1` (and `/ipad2` on the other) and sign in with the passphrase (device table above).
- [ ] Optional: I can re-run the concurrency suite against the preview deployment's test database.
- [ ] Still open from Phase 2: portrait photos (crop to 4:3, or keep their shape?) and `--album-max`.

---

## Verdict

**READY TO MERGE**

You are merging the backend: deny-by-default Pages Functions over D1 and R2, passphrase sign-in with a signed HttpOnly session, two-step uploads checked by their own bytes, atomic canvas versions, and an album that reads real entries. It's backed by 101 passing tests and a Cloudflare account set up and verified for production and preview. Sign-in on the real iPads is the remaining device check.
