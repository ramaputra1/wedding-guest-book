# Phase 6 — Durability

**Branch:** `phase6` (as checked out by the owner; `PHASES.md` names it `phase-6-durability`)
**Date:** 2026-10-13
**Verdict:** READY TO MERGE — two criteria can only be checked by the owner once the workflow is on `main` with its secrets (see "Needs the owner")

---

## What was built

The album now has a copy that does not depend on Cloudflare, and a way back.

**Export: `scripts/export-archive.ts`.** It reads the live album and writes an archive folder:
- **`manifest.json`** — every entry, photo and video (deleted ones included, marked `removed`), every version of every handwritten page, and every saved look, with dates and devices, and each file's size and SHA-256.
- **The original files**, at their R2 keys: `photos/`, `videos/`, `thumbs/`, `posters/`, and `canvases/` (each version's PNG plus its stroke JSON).
- **`viewer.html`, `manifest.js`, the two fonts, a README and `.gitattributes`.**

How it behaves:
- **Incremental.** R2 keys are never reused, so files already in the folder are kept and only new ones are downloaded.
- **Validates its own output.** Every file named by an entry must be listed, present and matching its SHA-256, with nothing unaccounted for. `--check` validates an archive without touching Cloudflare.
- **Reads through Wrangler** (already a dev dependency), so the same code runs against the local test server, the test database and production. No new dependency.

**Offline album: `viewer.html`.** One file with zero dependencies. Double-click it and the album appears, in its saved colour, frame, paper and watermark:
- spreads in order, with dates
- numbers to move between items, videos that play and loop, photos that open full size
- every version of a page, a tap away
- a button to show the photos deleted on the day

It reads `manifest.js` (the manifest as a script), because browsers refuse to `fetch()` a file:// JSON.

**Nightly: `.github/workflows/archive.yml`.** Runs at 19:23 UTC (02:23 WIB) and on demand. It exports, commits and pushes to the private archive repository: the real album to `main`, the test album to a `test` branch.
- **Read-only on Cloudflare.** It uses a read-only Cloudflare token (D1 Read, R2 Read), so it cannot change the album. It writes only to the archive repository, with a fine-grained token limited to that repository.
- **No nightly LFS download.** It clones the archive without downloading old media, so the free 10 GiB of LFS bandwidth is not spent every night; the export reads size and SHA-256 from the LFS pointers.
- **Fails loudly, keeps what it has.** If the database names a file R2 lacks, it still commits everything else, then the run turns red. It also fails if any media file is not in Git LFS.
- **Public logs, no secrets.** This repository is public, so the logs print only counts and file names.

**Restore: `scripts/restore-archive.ts`.** Puts back what is missing and nothing else:
- **Dry run unless `--apply`;** the real album also needs `--production`.
- **Files first, then rows.** It uploads only files storage lacks, after checking each one's SHA-256, then inserts missing rows with `INSERT OR IGNORE`, so it never overwrites.
- **Deleted items stay deleted.**
- **Refuses LFS pointers,** telling you to run `git lfs pull`.

**`docs/RUNBOOK.md`.** Twelve situations with exact clicks and commands:
- setting up the archive
- checking a run
- opening the album offline
- un-deleting a photo
- a lost file, a lost spread, losing everything
- a lost iPad
- changing the passphrase
- rotating each secret
- usage and billing
- Wrangler's 7403

| Area | Files |
|---|---|
| Export / restore | `scripts/export-archive.ts`, `scripts/restore-archive.ts`, `scripts/archive/store.ts` (D1 + R2 via wrangler), `scripts/archive/manifest.ts` (shape, build, validate, LFS pointers) |
| Viewer | `scripts/archive/viewer.html` (copied into each archive) |
| Nightly | `.github/workflows/archive.yml` |
| Runbook | `docs/RUNBOOK.md` |
| Tests | `tests/archive.spec.ts` (export + restore drill), `tests/e2e/archive-viewer.spec.ts` (file://), `tests/setup/global.ts` and `tests/e2e/global-setup.ts` (expose the test server's state folder) |
| Docs | `ARCHITECTURE.md` (archive layout, how it runs, restore), `DECISIONS.md` (D10 as built), `STRUCTURE.md`, `TESTING.md` (how the drill runs), `SETUP-CLOUDFLARE.md` (points to the runbook) |

Runtime dependencies are still exactly 4. No new dev dependency either.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Export produces a complete archive: every entry, media item and canvas version | PASS (local D1 + R2) | `tests/archive.spec.ts`: an entry with a photo, a video, two page versions and a deleted photo exports with all three items in order, the deleted one marked `removed`, both versions with their exact stroke JSON, and the saved look. The files match the stored files byte for byte. Against Cloudflare: see "Needs the owner". |
| 2 | `manifest.json` validates and references every file present | PASS | `manifest valid` after every export; `--check` exits 0 ("Valid: 11 files, 1 entries"). The validator also catches a changed file, a missing file and a stray file (test). |
| 3 | **`viewer.html` opens from `file://` with no server and no internet, and plays a video** | PASS (Chrome) | `tests/e2e/archive-viewer.spec.ts`: opened as `file://` with every non-file request refused (none were attempted). It shows the album, plays the video (currentTime > 0.5 s, no error, `loop`) and opens a photo full size. Screenshot checked. Safari double-click: owner check below. |
| 4 | Nightly workflow runs green on a manual dispatch | **NEEDS OWNER** | It cannot run before it is on `main` (GitHub only offers "Run workflow" for workflows on the default branch) and has its secrets. Checked here: the YAML parses, every shell step passes `bash -n`, and the steps' logic is exercised by the tests (export, LFS pointers). |
| 5 | Git LFS correctly tracks media; the repo is not bloated with raw binaries | PASS (rules) / **NEEDS OWNER** (on GitHub) | `git check-attr` on an exported archive (in a scratch copy, not this repository): all 18 media and font files resolve to `filter: lfs`; only the text files (manifest, viewer, stroke JSON, README, licences) do not. The workflow fails if any media file escapes LFS. Confirm on GitHub after the first run. |
| 6 | **Restore drill performed for real:** delete a test entry, restore it from the archive, confirm it reappears — documented with output | PASS (local D1 + R2, real deletes) | Output below. Rows deleted with `wrangler d1 execute`, objects with `wrangler r2 object delete`. Restored, the API shows the entry, its photo and video, its page at version 2 with the exact strokes, and both versions in D1. Every file matches byte for byte, and the deleted photo stays deleted. The same drill on the Cloudflare test database is RUNBOOK section 6 (owner, recommended). |
| 7 | `RUNBOOK.md` is specific enough to follow while stressed, with exact clicks and commands | PASS (written) — owner to judge | Every section is numbered steps with dashboard paths, exact commands and what success looks like. Dry runs come before every write. |

### Restore drill — commands and output

From `test-results/restore-drill.log`; ids shortened.

```
Restore drill — 2026-10-13T22:56:41.017Z — local D1 + R2 of the test server

$ node --experimental-strip-types scripts/export-archive.ts --target local --persist-to <local state> --out <archive>
Reading the local database…
  1 entries, 3 photos and videos, 2 page versions, 1 saved looks
  files: 9 downloaded, 0 already here
  manifest valid: every file listed, present and matching its SHA-256
(exit 0)

$ node --experimental-strip-types scripts/export-archive.ts --check --out <archive>
Valid: 11 files, 1 entries.
(exit 0)

$ wrangler d1 execute wedding-guestbook --local --command "DELETE FROM media_removals WHERE media_id = 'ipad1-01…'; DELETE FROM media WHERE entry_id = 'ipad1-01…'; DELETE FROM canvases WHERE entry_id = 'ipad1-01…'; DELETE FROM entries WHERE id = 'ipad1-01…'"

(deleted 9 objects from local R2 with wrangler r2 object delete)

$ node --experimental-strip-types scripts/restore-archive.ts --from <archive> --target local --persist-to <local state> --entry ipad1-01…
Archive exported 2026-10-13T22:56:55.145Z → local
  entries:        1 to put back
  photos/videos:  3 to put back
  page versions:  2 to put back
  deletions:      1 to put back (items deleted on the day stay deleted)
  looks:          0 to put back
  files:          9 missing from storage, to upload
    ↑ photos/ipad1-01…/ipad1-01….jpg
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ videos/ipad1-01…/ipad1-01….mp4
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ posters/ipad1-01…/ipad1-01….jpg
    ↑ photos/ipad1-01…/ipad1-01….jpg
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ canvases/ipad1-01…/ipad1-01….png
    ↑ canvases/ipad1-01…/ipad1-01….png

Dry run: nothing was changed. Run again with --apply to do this.
(exit 0)

$ node --experimental-strip-types scripts/restore-archive.ts --from <archive> --target local --persist-to <local state> --entry ipad1-01… --apply
Archive exported 2026-10-13T22:56:55.145Z → local
  entries:        1 to put back
  photos/videos:  3 to put back
  page versions:  2 to put back
  deletions:      1 to put back (items deleted on the day stay deleted)
  looks:          0 to put back
  files:          9 missing from storage, to upload
    ↑ photos/ipad1-01…/ipad1-01….jpg
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ videos/ipad1-01…/ipad1-01….mp4
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ posters/ipad1-01…/ipad1-01….jpg
    ↑ photos/ipad1-01…/ipad1-01….jpg
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
    ↑ canvases/ipad1-01…/ipad1-01….png
    ↑ canvases/ipad1-01…/ipad1-01….png
Restored. Checked again: nothing in scope is missing.
(exit 0)

$ node --experimental-strip-types scripts/restore-archive.ts --from <archive> --target local --persist-to <local state> --entry ipad1-01… --apply
Archive exported 2026-10-13T22:56:55.145Z → local
  entries:        0 to put back
  photos/videos:  0 to put back
  page versions:  0 to put back
  deletions:      0 to put back (items deleted on the day stay deleted)
  looks:          0 to put back
  files:          0 missing from storage, to upload
Nothing is missing. Nothing to do.
(exit 0)

(deleted thumbs/ipad1-01…/ipad1-01….jpg from local R2)

$ node --experimental-strip-types scripts/restore-archive.ts --from <archive> --target local --persist-to <local state> --media ipad1-01… --apply
Archive exported 2026-10-13T22:56:55.145Z → local
  entries:        0 to put back
  photos/videos:  0 to put back
  page versions:  0 to put back
  deletions:      0 to put back (items deleted on the day stay deleted)
  looks:          0 to put back
  files:          1 missing from storage, to upload
    ↑ thumbs/ipad1-01…/ipad1-01….jpg
Restored. Checked again: nothing in scope is missing.
(exit 0)
```

The same run also showed:
- `--target production --apply` without `--production` is refused before anything is contacted.
- A pointer-only archive is refused with "Run `git lfs pull`".
- A repeat export downloads nothing: "files: 0 downloaded, 9 already here".

---

## Tests

| Test | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean (the scripts included) |
| Unit + integration | `npm test` | 186 passed (7 new in `archive.spec.ts`) |
| Authorization | `npm run test:auth` | 98 passed |
| Browser journeys | `npm run test:e2e` | 60 passed (1 new: viewer from file://) |
| Workflow | YAML parse + `bash -n` per step | clean |

The drill test ran three times in a row without a failure. Secret and non-English scans of the new files are clean.

---

## Needs the owner

| What | Where | What good looks like |
|---|---|---|
| Set up the archive | RUNBOOK section 1 (≈15 min): private repo, fine-grained token, read-only Cloudflare token, 3 secrets + 1 variable | — |
| First runs | After merge to `main`: Actions → Archive → Run workflow → **test**, then **production** | Green ticks; the archive repo has `test` and `main` branches |
| LFS on GitHub | Open a photo in the archive repo | "Stored with Git LFS"; Settings → Billing → Usage shows LFS storage near the album's size |
| viewer.html in Safari | Clone (RUNBOOK section 3), `git lfs pull`, double-click `viewer.html` on the Mac | The album appears; a video plays |
| Cloudflare drill (recommended) | RUNBOOK section 6 on the **test** album: delete a test spread in the D1 console, restore with `--target test` | The spread is back on `dev-acceptance` |
| Read-only token really is read-only | The token from RUNBOOK 1c | Optional: `CLOUDFLARE_API_TOKEN=<token> npx wrangler d1 execute wedding-guestbook-test --remote --env preview --command "DELETE FROM entries WHERE 0"` should be refused |

---

## Deferred

- **Phase 7:** pin the two GitHub Actions (`actions/checkout`, `actions/setup-node`) to commit SHAs rather than `@v4` tags. They are first-party, but SHA pins are the hardened form.
- **Phase 7:** run an accessibility scan of `viewer.html`.
- **Phase 8 (before the wedding):** delete the test entries; run the export and check it is clean (TESTING.md, "Before the wedding").

---

## Problems and surprises

- **Wrangler's error text.** A missing R2 object prints "The specified key does not exist." on stderr, after its banner on stdout. The first version cut the text too early and treated a missing file as a failure. Fixed, and covered by the drill.
- **The local simulator refuses overlapping calls.** Parallel `wrangler` calls against local D1/R2, while `pages dev` holds the same storage, fail intermittently ("Failed to get session commit token"; R2 put 500). The scripts run one call at a time against local storage and stay parallel against Cloudflare. Database reads are sequential everywhere: there are only five.
- **LFS pointers in the nightly checkout.** Downloading every old file each night would use the LFS bandwidth allowance, so the job checks out pointers. The export reads the true size and SHA-256 from each pointer; restore refuses to upload one. Both are tested.
- **file:// and JSON.** Browsers block `fetch()` of a local JSON file, so the archive carries `manifest.js` beside `manifest.json`.
- **Viewer and decoration themes.** The viewer reproduces the album's colour, frame, paper and watermark, but not the decoration patterns: they are ornament, and the archive is about the content. Easy to add if wanted.
- **Workflow testing.** The workflow cannot be run from here. Its steps are syntax-checked and its logic is tested through the scripts, but the first real run is the owner's (criterion 4).

---

## Owner actions before the next phase

- [ ] Review and commit on `phase6`; merge through `dev-acceptance` as usual.
- [ ] RUNBOOK section 1: set up the archive repository and the secrets.
- [ ] **Before this reaches `main`:** apply migrations 0002 and 0003 to the production database (`npx wrangler d1 migrations apply wedding-guestbook --remote`). Delete and Settings need them there; the export reads those tables too.
- [ ] Once on `main`: run the Archive workflow (test, then production); check LFS on GitHub; open `viewer.html` from a clone.
- [ ] Optional but recommended: the Cloudflare restore drill on the test album (RUNBOOK section 6).

---

## Verdict

**READY TO MERGE**

This merges the archive: a nightly, read-only export of the whole album into a private Git LFS repository; an offline `viewer.html` that opens by double-click and plays video; a restore that puts back only what is missing; and a runbook.

The export, manifest validation, viewer and restore drill are verified here, the drill with real deletes. The workflow's first run and LFS on GitHub need the owner's setup and the workflow on `main`.
