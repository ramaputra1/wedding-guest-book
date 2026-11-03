# Phase 7 — Review and deploy

**Branch:** `phase7` (as checked out by the owner; `PHASES.md` names it `phase-7-review-deploy`)
**Date:** 2026-10-17
**Verdict:** READY TO MERGE. The production deploy itself is the owner's to do, in steps written out below; it is the one criterion not yet met.

---

## What was built

Phase 7 is mostly verification. It found and fixed three real problems, prepared the domains, and turned every earlier device-test note into one rehearsal list.

**Found and fixed:**
- **Focus hidden behind the camera bar (WCAG 2.4.11, AA).** On a phone or an upright iPad the camera rail is a fixed bar at the bottom. Tabbing to a writing tool scrolled it into view *behind* the bar: 18 focus stops were hidden at 390 px and at 820 px.
  - Fix: the page now reserves the bar's height when scrolling (`scroll-padding-block-end`). The bar's height moved to the root so the scroll container can read it.
  - Test: one now fails with the fix removed (18 hidden) and passes with it (0).
- **The automated scan's blind spot for contrast.** axe-core reports text contrast as "incomplete" — neither pass nor fail — wherever a pseudo-element or overlapping layer is nearby. Here that is every underlined control, the writing tools and all of Settings. Its "0 violations" therefore said nothing about contrast there.
  - Fix: a second test measures every visible text against the colours actually behind it. It runs on the iPad with three album colours and on the public album.
  - Result: everything meets AA. The test also proves it catches planted faint text, and that it measured enough text on each screen.
- **Soft photos on large screens.** The public album always used the 640 px thumbnail, which looks soft on a large or Retina screen. A `srcset` now lets those screens take the photo itself, or a video's full poster. The writer iPads keep the thumbnail, so the venue wifi is spent on uploads.

**Added:**
- `public/robots.txt`, which keeps `/ipad1`, `/ipad2` and `/api/` out of search results. SEO 92 → 100.
- **"Delete (1)"**, kept as the owner chose. Its accessible name now starts with the visible label ("Delete (1), this photo"), so voice control can reach it (WCAG 2.5.3).
- **`scripts/clear-album.ts`**, for Phase 8's "delete the test entries". It is the only thing that erases:
  - a dry run unless `--apply`
  - `--production` required for the real album
  - it refuses unless an archive exported after the newest entry holds everything it would remove

  The drill test empties the album with it and brings everything back with `restore-archive.ts --all`.
- **GitHub Actions pinned to commit SHAs** (`checkout` and `setup-node` v4.4.0). This was deferred from Phase 6.
- **Domains** on the owner's `ramaap.com`: `wedding.ramaap.com` for `main`, `wedding-dev.ramaap.com` for `dev-acceptance`. Both are one level deep, so the free certificate covers them. Steps: `SETUP-CLOUDFLARE.md` §9.
- **`docs/PHASE-8-CHECKLIST.md`** — every NEEDS DEVICE TEST item from Phases 0–6, the grid fixes and Settings, in one list. Rewritten for the app as it now is: earlier notes about a trash icon, a mirrored preview, "Sound on" and dots are replaced.

**New tests:**

| Spec | What it proves |
|---|---|
| `journey.spec.ts` | The core journey on `/ipad1` **and** `/ipad2`; both iPads capturing at once |
| `public.spec.ts` | A visitor's every write is refused, by request; the public page sends only reads |
| `a11y.spec.ts` | axe-core, WCAG 2.0–2.2 A/AA, on 11 screens and states; a control test proves it catches violations |
| `contrast.spec.ts` | AA text contrast where axe cannot judge; three album colours |
| `keyboard.spec.ts` | Tab order, visible focus everywhere, dialogs, keyboard operation; focus never hidden behind the bar |
| `responsive.spec.ts` | 6 sizes: no sideways scroll, every control ≥ 44 × 44, screenshots |
| `motion.spec.ts` | Reduced motion removes all motion except the shutter's clock; a control run shows the lift otherwise |
| `archive.spec.ts` (added) | `clear-album.ts` refuses without an up-to-date archive, empties with one, and `restore --all` undoes it |

**Dependencies:**
- Runtime: still exactly 4.
- One dev dependency added: **`axe-core` 4.13.0**, test-only, no account. 4.13.0 is the newest release more than two weeks old; 4.14.0 was 12 days old. Recorded in D22.
- Lighthouse is run on demand with a pinned `npx`; it is not a dependency.

| Area | Files |
|---|---|
| App | `src/styles/components.css` (rail height on the root; `scroll-padding`), `src/lib/api.ts` (`srcset`), `src/islands/album/MediaMount.tsx` (sharp prints on the public album; Delete's name), `src/config/site.ts` |
| Site | `public/robots.txt` |
| Scripts / CI | `scripts/clear-album.ts`, `.github/workflows/archive.yml` (pinned actions) |
| Tests | the seven new specs above; `tests/archive.spec.ts`, `tests/e2e/delete.spec.ts` |
| Docs | `PHASE-8-CHECKLIST.md` (new), `SETUP-CLOUDFLARE.md` (§8 brought up to date; §9 go live and domains), `RUNBOOK.md` (§13 empty the album), `TESTING.md`, `STRUCTURE.md`, `DECISIONS.md` (D22) |
| Tooling | `package.json` (`axe-core` dev dependency) |

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Playwright covers: load → scroll → select slot → sign in → capture → save canvas → reload → everything persists | PASS | `journey.spec.ts`. Load `/ipadN` (title names the device) → sign in → "+" on a spread → photo saved → page written and saved → reload: photo and handwriting still there, the page reopens with its stroke → signed out, `/` loads, scroll past the hero: the spread is in the public album, with no write control. |
| 2 | Journeys pass for **both** `/ipad1` and `/ipad2` | PASS | The journey runs once per device; entries and media ids carry that device's prefix. Plus both iPads capturing at the same moment: two spreads, each visible on the other iPad. |
| 3 | Zero accessibility violations in an automated scan, plus a manual keyboard pass | PASS | axe-core, WCAG 2.0/2.1/2.2 A+AA: 0 violations on 11 screens and states. Its contrast blind spot is covered by `contrast.spec.ts`: 0 below AA. Keyboard: every stop shows focus, every control is reachable, dialogs trap and return focus, and nothing is hidden behind the bar (after the fix). Focus rings were also checked by eye in screenshots. The canvas itself is pointer-only by nature; every tool around it is keyboard-operable. |
| 4 | Lighthouse ≥ 95 performance, ≥ 95 accessibility on `/` | PASS | Lighthouse 13.5.0 against the built site under `wrangler pages dev`: **mobile 99 / 100** (best practices 100, SEO 100), LCP 2.1 s, CLS 0, TBT 0 ms; **desktop 100 / 100**. On the live domain the numbers can differ (network, edge cache); re-run after go-live (TESTING.md). |
| 5 | Public visitor at `/` has no path to any write — verified by request, not by looking for buttons | PASS | `public.spec.ts`: from the public page's own context, with its own (absent) cookies, 12 write attempts are made — create, upload, save, page, delete, change the look, read strokes or stats, sign out, a guessed admin route, and a body or query claiming to be `ipad1`. All answer **401 `unauthorized`**, and afterwards the entries, items and look are unchanged. Pressing every button on the public album sends only GET requests. |
| 6 | Production deploy live over HTTPS | **NEEDS OWNER** | It can only be done from the owner's Cloudflare account. Steps: `SETUP-CLOUDFLARE.md` §9 (migrations, merge to `main`, custom domains, check). Send me the address once it is up and I will check it from here (HTTPS, headers, a read of the API). |
| 7 | All `NEEDS DEVICE TEST` items from earlier phases collected into one checklist for Phase 8 | PASS | `docs/PHASE-8-CHECKLIST.md`: sections A–I, about 70 checks, gathered from every report and rewritten for current behaviour. Ends with clearing the rehearsal and the day itself. |

Also from the Build list:
- **Responsive audit** at 320, 390, 820×1180, 1180×820, 1440, 1920: no sideways scroll and no control under 44 × 44 on the iPad album, a page being written, Settings, the cover and the public album. Screenshots were inspected.
- **Reduced motion**: verified by toggling it (`motion.spec.ts`).

---

## Tests

| Test | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Unit + integration | `npm test` | 187 passed |
| Authorization | `npm run test:auth` | 98 passed |
| Browser journeys | `npm run test:e2e` | **89 passed** (29 new) |
| Lighthouse | `npx lighthouse@13.5.0 http://localhost:8791/` (mobile; `--preset=desktop`) | 99/100/100/100 · 100/100/100/100 |

Each check that could pass vacuously was shown to fail when it should:
- the scan with planted violations
- the contrast measure with planted faint text
- the obscured-focus test with the fix removed
- reduced motion against a run without it

Non-English text and secret scans of the changes are clean.

---

## Needs the owner

- **Go live:** `SETUP-CLOUDFLARE.md` §9.
  1. `npx wrangler d1 migrations apply wedding-guestbook --remote`
  2. Check the Production secrets.
  3. Merge to `main`.
  4. Add `wedding.ramaap.com` and `wedding-dev.ramaap.com`, and point the `wedding-dev` CNAME at `dev-acceptance.<project>.pages.dev`.
  5. Check both addresses show the padlock.
- **The archive:** RUNBOOK §1, then the first runs (Phase 6 report). The workflow now uses pinned actions.
- **The rehearsal:** `docs/PHASE-8-CHECKLIST.md`, on both iPads, ideally at the venue. Send back anything that is not right.

---

## Deferred

- **Phase 8:** the rehearsal itself, and fixing what comes back from it.
- **After go-live:** re-run Lighthouse on `https://wedding.ramaap.com`, and confirm the public album's 30-second edge cache is working there (it is skipped on `*.pages.dev`).

---

## Problems and surprises

- **axe-core's contrast check is silent where this design is most particular.** Underlines drawn with `::after`, the album theme's `::before`, and a modal sheet all turn contrast into "incomplete". Treating "0 violations" as proof would have been wrong; hence `contrast.spec.ts`.
- **The bottom camera bar covered keyboard focus.** Pointer users simply scroll, but focus scrolled into view landed behind the bar. Only a test that tabs on a narrow screen and asks what is drawn at the focused control's position found it.
- **The public album's thumbnails were soft on big screens.** The fix is limited to the public album, so it costs the venue wifi nothing.
- **Four test-only mistakes** were fixed along the way, none in the app:
  - signing in when already signed in
  - counting two simultaneous captures as one
  - not scrolling the public album into view before it loads
  - expecting disabled tools to take focus
- **Branch addresses on Pages:** a custom domain for a non-production branch is a Pages custom domain whose CNAME is pointed at the branch alias. Without that step both addresses would show the real album. Written into §9.

---

## Owner actions before the next phase

- [ ] Review and commit on `phase7`; merge via `dev-acceptance`.
- [ ] Go live (`SETUP-CLOUDFLARE.md` §9), **migrations first**. Send me the address to check.
- [ ] Set up the archive (RUNBOOK §1) and run it once on production.
- [ ] Do the rehearsal (`docs/PHASE-8-CHECKLIST.md`) and send back what you find.

---

## Verdict

**READY TO MERGE**

This merges the review:
- the full journey on both iPads
- proof by request that visitors cannot write
- accessibility at zero violations, including contrast and keyboard checks the scanner cannot do
- three real fixes: focus hidden behind the bar, soft public prints, and robots
- Lighthouse 99/100 mobile and 100/100 desktop
- the go-live steps for `ramaap.com`
- the Phase 8 checklist

The deploy itself is the owner's next step.
