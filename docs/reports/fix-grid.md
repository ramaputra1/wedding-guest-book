# Fix — Grid (after Phase 5)

**Branch:** `fix-grid`
**Date:** 2026-10-11
**Verdict:** READY TO MERGE (a short check on a real iPad is listed below)

---

## What was built

Four changes the owner asked for after testing Phase 5 on `/ipad1` and `/ipad2`:

1. **Photos and videos no longer look flipped.**
   - **Before:** the front camera's preview was shown mirrored, but the saved file was not, so every capture came out reversed from what the guest had seen.
   - **Now:** the preview is unmirrored, so it matches the saved file exactly.
   - The owner chose this over saving mirrored files. Mirroring a video would mean re-encoding it through a canvas on the iPad, and any writing in the background would read backwards in the album for good (DECISIONS D18, revised).
2. **Numbers instead of dots, at most six per spread.**
   - Beneath each mount the items are numbered `1 2 3 …`. The one on show is semibold with a brass hairline beneath it.
   - This applies on the iPads and on the public album.
   - A spread holds at most six photos and videos together (`site.capture.maxPerSpread`).
   - At six, the "+" disappears and the camera turns away.
3. **The camera is aimed only with "+".**
   - The mount is no longer a button. A "+" after the numbers is the only way to send the next capture to that spread.
   - Pressing "+" again lets go.
   - Choosing a number in the aimed spread shows that item and turns the camera away until "+" is pressed again.
   - With no "+" pressed, the camera is off, the shutter is disabled and the rail reads "Tap + on a spread". Nothing is aimed by default, by owner choice.
4. **A page opens for writing only when it is tapped.** This is independent of where the camera is aimed. Tapping another page moves the pen there, and unsaved strokes stay on the iPad as a draft.

**Additional behaviour needed for items 3 and 4:**
- If a photo and a page are both started on "New spread", whichever saves first creates the spread, and the other follows it. The guest's photo and message stay together.
- While a countdown or a recording is running, the camera's spread cannot be changed, so a capture never lands somewhere unexpected.

**What was not changed:**
- The server does **not** refuse a seventh item. The limit is kept by the interface. A capture already queued is never thrown away, even in the rare case that both iPads add the sixth at once.
- No database or API changes.

| Area | Files |
|---|---|
| Island | `album/MediaMount.tsx` (numbers, "+", mount no longer a button, no mirroring), `album/Spread.tsx`, `album/Album.tsx`, `album/WritingPage.tsx` (tap-to-open target), `GuestBook.tsx` (no default destination, camera only while aimed, six-item limit, page chosen separately, new spread followed), `CameraRail.tsx` ("Tap + on a spread") |
| Config | `src/config/site.ts` (`capture.maxPerSpread: 6`, wording), `src/layouts/Writer.astro`, `src/pages/index.astro` |
| Styles | `src/styles/components.css`: `.numbers` replaces `.dots`; `.numbers__add`; `.writing-page__choose`; mirror rule removed; selected mount keyed on `data-selected` |
| Tests | `tests/e2e/grid.spec.ts` (new); `helpers.ts` (`addTo`, `openPage`, `seedEntry`); `capture`, `upload-failure` and `canvas` specs updated for "+" and tap-to-open |
| Docs | `DESIGN.md` (numbers, "+", six, unmirrored, page opens on tap), `ARCHITECTURE.md`, `DECISIONS.md` (D18 revised), `TESTING.md` |

---

## Acceptance (the owner's four points)

| # | Request | Result | Evidence |
|---|---|---|---|
| 1 | Saved photo/video not flipped | PASS (Chrome) / NEEDS DEVICE TEST | e2e `the preview is never mirrored`: the live video has `transform: none`. The capture code was unchanged and already saved unmirrored, so preview and file now agree. |
| 2 | Numbers with underline; max 6 photos + videos | PASS | e2e: numbers `1 2` and `1 2 3` render on the iPad and on `/`. The current one has a brass `::after` hairline. A spread seeded with 5 plus one capture shows `1–6`, the "+" goes, the camera turns off, and it stays that way after a reload. Every target is ≥ 44 × 44. |
| 3 | "+" is the only way to aim; a number shows the item and drops the active state | PASS | e2e: nothing is aimed at first (no video, shutter disabled, rail text); tapping a mount does nothing; "+" turns the camera on; pressing "+" again turns it off; a number shows that item, unpresses "+" and turns the camera off; "+" brings it back. |
| 4 | A page becomes active only by tapping it | PASS | e2e: aiming the camera opens no page; tapping a page opens it while the camera stays aimed elsewhere; tapping another page moves the pen. A photo and a page started on "New spread" end up on the same spread, with the unsaved stroke kept. |

---

## Tests

| Test | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Unit + integration | `npm test` | 145 passed |
| Browser journeys | `npm run test:e2e` | 30 passed (7 new) |

Screenshots were taken in Chrome at 1180 × 820 and 320 × 700, at rest and while aimed. The numbers row, "+", brass underline and selected corners all render as intended.

---

## Needs a real device

| What to test | On | What good looks like |
|---|---|---|
| Not flipped | iPad, front camera: take a photo and a video while holding up some text | Text reads the same way in the preview and in the saved item |
| "+" and numbers | `/ipad1` | Nothing films until "+"; a number shows the photo and the camera stops; at six the "+" is gone |
| Tap to write | `/ipad1` | A page opens only when touched; the camera's spread doesn't change |

---

## Deferred

- None.

---

## Problems and surprises

- **The camera now starts each time a "+" is pressed**, about half a second on an iPad, because it is off while nothing is aimed. This was intended: no filming without a destination, and better battery life.
- **One judgement call:** a number in a spread *other* than the aimed one just switches that spread's photo. It does not turn the camera away from where it is aimed. Only a number in the aimed spread does, because that is where the viewfinder must give way to the item.

---

## Verdict

**READY TO MERGE.** All four requested changes are in and covered by tests. The only remaining step is a quick look on an iPad.
