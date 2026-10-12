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

---

# Round 2 — 2026-10-12

Three more changes from the owner, on the same branch.

| # | Request | Result | Evidence |
|---|---|---|---|
| 1 | Photo box always landscape | PASS (Chrome) / NEEDS DEVICE TEST | The box and its print are always 4:3. A portrait photo or 16:9 video fills it (`object-fit: cover`), trimmed **on the page only**; the saved file is whole and the public viewer shows all of it (owner's choice). e2e `the photo box is always 4:3 landscape…`: with the camera forced to portrait (480×640, and the saved photo confirmed taller than wide), the frame measures 4:3 both live and as a print. |
| 2 | Empty box: touching it starts the camera; once it has an item, only "+" | PASS | e2e `an empty mount aims the camera when touched…`: a mount with an item ignores a touch; an empty mount aims the camera; touching the live picture does not turn it off; after the first capture the mount no longer aims. The empty mount is a pointer shortcut only — the "+" beside it remains the named control for keyboard and screen readers. |
| 3 | Notes: Save closes the page | PASS | e2e `saving a page closes it…`: after Save the canvas is gone, the paper shows the saved handwriting, keyboard focus is on that page, and tapping it reopens it with the stroke. The other canvas journeys now reopen the page after each save. |

**Files:** `album/MediaMount.tsx` (fixed 4:3 frame, empty-mount shortcut; the camera aspect is no longer passed), `GuestBook.tsx` (close the page after Save, return focus), `components.css` (`.mount__frame` 4:3, `.mount__frame--tall` removed, pointer cursor on an addable mount), `tests/e2e/grid.spec.ts` (+3 journeys), `tests/e2e/canvas.spec.ts` (reopen after save; offline "Saving…" now on the closed page), `DESIGN.md`, `DECISIONS.md` (D18, second round).

**Tests:** `npm run typecheck` clean · `npm test` 145 passed · `npm run test:e2e` 33 passed.

**Needs a real device:** hold the iPad upright, take a photo and a short video — the box must stay landscape, filled, both in the viewfinder and afterwards; open the photo on the public album to see it whole.

**Verdict:** **READY TO MERGE.**

---

# Round 3 — 2026-10-12

| Request | Result | Evidence |
|---|---|---|
| Swipe left and right through a spread's photos and videos | PASS (Chrome, real touch events) / NEEDS DEVICE TEST | e2e `swiping through a spread` (4 journeys, touch sent through Chrome's DevTools protocol):<br>• left goes onward and right goes back; it stops at both ends<br>• a short or mostly vertical movement is ignored<br>• up/down over a mount still scrolls the page<br>• in the aimed spread, swiping right leaves the live picture for the newest item and turns the camera away, and no swipe turns it back on<br>• on the public album a swipe changes the photo without opening the viewer, and a tap still opens it |

**How:**
- `src/islands/hooks/useSwipe.ts` (new) uses pointer events from a finger or the Pencil. A swipe needs at least 40 px of sideways travel, clearly more than the vertical travel. A mouse is ignored; on a desktop the numbers are the way through.
- `.mount-wrap` has `touch-action: pan-y`, so the browser keeps vertical scrolling.
- The click that ends a swipe is swallowed.
- The item changes instantly with no slide animation, per DESIGN.md (motion only confirms an action). The underlined number moves with it.
- The numbers remain the keyboard and single-tap route (WCAG 2.5.1).

**Files:**
- Changed: `album/MediaMount.tsx`, `components.css`, `tests/e2e/grid.spec.ts`
- New: `hooks/useSwipe.ts`
- Docs: `DESIGN.md`, `STRUCTURE.md`

**Tests:** `npm run typecheck` clean · `npm test` 145 passed · `npm run test:e2e` 37 passed.

**Needs a real device:**
- On the iPad, swipe across a spread with several photos. It should change item on a natural flick.
- Scrolling the album up and down over the photos should still work.
- A swipe should never start Safari's back gesture. This only happens from the very edge of the screen; the mounts sit inside the page margin.

**Verdict:** **READY TO MERGE.**

---

# Round 4 — 2026-10-12

| Request | Result | Evidence |
|---|---|---|
| Recording: the shutter turns a different colour | PASS | New token `--recording` `#D64B3E` (added to `DESIGN.md` and `tokens.css`; 3.8:1 on the rail, above the 3:1 needed for a control; used for nothing else). While recording, the face, already the "stop" square, and the clock ring turn red. e2e checks the computed colours during and after recording. |
| Saved videos play automatically when seen, with sound always available | PASS (Chrome) / NEEDS DEVICE TEST (iOS sound) | e2e `playback.spec.ts` (6 journeys, below). |

**Owner choices:** red, not brass; autoplay in the mounts on the writer iPads only (the public album opens a video in its viewer, which already autoplays with sound from the visitor's tap); loop.

**Autoplay rules** (`src/islands/album/playback.ts`):
- A saved video plays in its mount, unmuted and looping, while at least 60% of it is on screen.
- **One at a time:** the most recently seen or tapped video wins, and the rest pause.
- **Holds:** every video pauses while another video is being recorded (otherwise its sound would end up in the new recording) and while the pen is on a page (DESIGN.md: nothing moves near the canvas).
- **Reduced motion:** nothing starts by itself.
- **Control:** a Play / Pause / Sound on button on each video, plus a tap on the video itself. Audio that starts on its own must be stoppable (WCAG 1.4.2).

**Sound, double-checked:**
1. Recordings do capture audio: the microphone is requested in video mode, and e2e confirms the stored MP4 has a `soun` track.
2. Playback always starts unmuted at full volume.
3. **The limit:** a browser can refuse to start sound without a tap, and iOS Safari may. In that case the video plays silently and its control reads **"Sound on"**; one tap turns the sound on. That tap is the only way any website can be sure of sound on an iPad. The e2e test simulates this refusal.

**e2e evidence:**
- Red shutter, plus a sound track in the stored recording.
- Plays unmuted, volume 1, looping; Pause stays paused and Play resumes. The public album does not autoplay.
- Only one video plays with two on screen, and tapping the other switches.
- Pauses under the pen and during a recording, and a tap cannot start it while recording; resumes after.
- When sound is refused: plays muted, "Sound on", then unmuted.
- Reduced motion: no autoplay, and Play works.

**Files:**
- New: `album/playback.ts`, `tests/e2e/playback.spec.ts`
- Changed:
  - `album/MediaMount.tsx` (inline video and its control)
  - `GuestBook.tsx` (holds for recording and pen)
  - `config/site.ts` (`playback` wording)
  - `tokens.css`, `components.css`
  - `tests/e2e/helpers.ts` (`seedEntry` can add videos)
  - docs: `DESIGN.md`, `STRUCTURE.md`, `TESTING.md`

**Tests:** `npm run typecheck` clean · `npm test` 145 passed · `npm run test:e2e` 43 passed.

**Needs a real device:**
1. Record a video: the shutter turns red.
2. Once it is saved, scroll to it:
   - it should play by itself in the box, with sound, and loop
   - if it plays silently with "Sound on", one tap should bring the sound
3. Scroll so two videos are on screen: only one plays.
4. Start recording: the playing video pauses.
5. Write on a page: the video pauses.

**Verdict:** **READY TO MERGE.**

---

# Round 5 — 2026-10-12: Delete

| Request | Result | Evidence |
|---|---|---|
| Tap a number → trash button in the middle | PASS | e2e: no trash until a number is tapped; then it sits centred on the print (within 2 px) and is ≥ 44 px. Swiping, "+" and the live camera never show it. |
| Pop-up "are you sure?" with Yes / No | PASS | e2e: "Delete this photo?" / "Delete this video?" with the item shown. **No** is focused first; No and Escape keep the item; **Yes, delete** removes it. |
| Yes deletes, No does nothing | PASS | e2e and API: after Yes the item is gone on both iPads and the public album, and stays gone after a reload. After No it is still on the server. |

**Owner decisions:**
- **Hide, recoverable** (DECISIONS D20).
- **Either iPad may delete any item.**

**How it works:**
- `DELETE /api/media/{id}` (session required) inserts a row into the new table `media_removals`.
- **Nothing is erased.** The media row and its files stay; the album and the item count leave it out, while storage bytes still count its files.
- ARCHITECTURE.md, "Removing a photo or video", has the owner's commands to list deleted items and bring one back.

**Other behaviour:**
- On the iPad the item disappears at once. If the server cannot be reached, it comes back and a notice reads "That didn't delete. Check the wifi and try again."
- A spread that was full gets its "+" back.
- On the public album, a spread left with nothing in it is hidden.
- The public copy can take up to 30 s to update (the shared cache).

## ⚠ Database schema change

`migrations/0002_media_removals.sql` adds **one new table**. It is additive only: no existing table or column is altered, and no data is touched.

- **Without the migration the album still loads.** Verified by serving the built site against a database that has only 0001: `/api/entries` returned the album normally. Deleting fails until the migration is applied.
- **The owner must apply it**, see "Owner actions" below. Vitest and Playwright apply all migrations to their throwaway databases automatically.

**Security:**
- The new write endpoint verifies the session first. It is in the authorization table: 7 forged, expired or missing cookies all get 401, and the item stays in the album.
- The middleware's cross-origin check refuses a delete from another site.
- The device id comes from the session, never from the request.
- A deleted item's file URL keeps working for anyone who already has it, because the file is kept on purpose (recoverable). The URLs are unguessable random ids. Noted in ARCHITECTURE.md.

**Files:**
- New:
  - `migrations/0002_media_removals.sql`
  - `functions/api/media/[id].ts`
  - `src/islands/album/ConfirmRemove.tsx`
  - `tests/removals.spec.ts`
  - `tests/e2e/delete.spec.ts`
- Changed:
  - `lib-server/db.ts` (removal-aware album and counts, with the pre-migration fallback; `insertRemoval`)
  - `src/lib/api.ts` (`removeMedia`)
  - `album/MediaMount.tsx` (trash after a number tap)
  - `Spread.tsx`, `Album.tsx` (public album hides emptied spreads)
  - `GuestBook.tsx` (dialog, optimistic hide, failure notice)
  - `config/site.ts` (wording)
  - `components.css`
  - `tests/auth.spec.ts`
  - docs: `ARCHITECTURE.md`, `SETUP-CLOUDFLARE.md`, `STRUCTURE.md`, `DESIGN.md`, `DECISIONS.md`, `TESTING.md`

**Tests:** `npm run typecheck` clean · `npm test` 157 passed · `npm run test:auth` 90 passed · `npm run test:e2e` 49 passed. Token parity: 0 mismatches.

**Deferred:**
- **Phase 6 (Durability):** the archive export must include `media_removals`, and the deleted items' files, so a restore keeps both the photo and the fact that it was deleted.
- **Phase 7:** run an accessibility scan on the confirm dialog.

## Owner actions

Do these **before** merging this branch into `dev-acceptance`, from the project folder:

```bash
npx wrangler d1 migrations apply wedding-guestbook-test --remote --env preview
```

It should list `0002_media_removals.sql ✅`.

Do the same for production **before** this reaches `main`:

```bash
npx wrangler d1 migrations apply wedding-guestbook --remote
```

**Needs a real device:** on the iPad:
1. Tap a photo's number: the trash appears in the middle.
2. Tap the trash, then **No**: the photo stays.
3. Tap the trash again, then **Yes, delete**: the photo disappears.
4. The other iPad no longer shows it after a reload.

**Verdict:** **READY TO MERGE**, once the test-database migration above has been applied.

---

# Round 6 — 2026-10-12

| Request | Result | Evidence |
|---|---|---|
| Replace the trash icon with the word "Delete", underlined, top right of every photo and video; a tap asks to confirm | PASS | e2e `delete.spec.ts`: "Delete" is visible from the start on every saved item, underlined, in the top-right quarter of the print, ≥ 44 × 44, and named "Delete this photo" / "Delete this video". It is absent on the live camera. No / Escape / Yes work as before. Round 5's trash icon and its "tap a number first" rule are gone. |
| Remove the Play and Pause box on videos | PASS | e2e: no button other than "Delete" on a playing video. A tap on the video pauses and plays it. |
| Videos loop everywhere | PASS | The public album's viewer now loops too (the iPad mounts already did). e2e: the viewer's video has `loop`, and is still playing 4 s into a 3-second clip. |

**Kept on purpose:**
- **Keyboard and screen readers.** With the Play/Pause box gone, the video itself takes keyboard focus. Enter or Space pauses and plays it, and its name ends in what a press will do ("… Pause" / "… Play"). Sound that starts by itself must stay stoppable (WCAG 1.4.2).
- **"Sound on".** This is the only plate a video can still show, and only when the browser refused to start sound without a tap (iOS Safari may). Without it nobody would know there is sound. It disappears once the sound is on. If the owner prefers it gone too, tapping the video already turns the sound on.

**Files:**
- `album/MediaMount.tsx`: "Delete" button; no playback plate; the video is focusable.
- `album/MediaViewer.tsx`: `loop`.
- `config/site.ts`: `remove.label`.
- `components.css`: `.mount__delete` and `.mount__sound` replace `.mount__remove` and `.mount__playback`.
- `tests/e2e/delete.spec.ts`, `tests/e2e/playback.spec.ts`.
- Docs: `DESIGN.md`, `ARCHITECTURE.md`, `TESTING.md`.

**Tests:** `npm run typecheck` clean · `npm test` 157 passed · `npm run test:e2e` 48 passed.

**Owner action (from Round 5, still needed):** apply `0002_media_removals.sql` to the test database before merging into `dev-acceptance`.

**Verdict:** **READY TO MERGE.**

---

# Round 7 — 2026-10-12

| Request | Result | Evidence |
|---|---|---|
| "Delete" looks better and does not overlap the picture | PASS | Moved from a dark plate on the print to the word alone, underlined, just above the print's top right, on the leaf with no background (`--on-leaf-soft`, brighter on hover). e2e: its box ends above the print's top edge, its right edge lines up with the print's, its background is transparent, and it is ≥ 44 × 44. |
| DELETE fails with "check the wifi" while online | Cause found; message fixed; **owner action needed** | See below. |
| Homepage: expand icon at bottom right; a tap on a video plays / pauses; a tap on a photo does nothing | PASS | The public mount is no longer one big "open" button. A saved video plays in place on a tap, with sound and looping, and stops on the next tap. The expand icon (bottom right, `--leaf` plate) is the only way to open the viewer. e2e: a video waits for a tap; tap → plays unmuted, loops past its 3 s end; tap → pauses; the icon sits in the bottom-right quarter and opens the looping viewer while the mount's copy pauses; tapping a photo opens nothing. |
| No "Sound on" button; videos always have sound unless paused | PASS | The muted fallback is gone. A video is never played muted. If a browser refuses sound before a tap, the video stays paused on its poster and a tap starts it with sound. e2e simulates that refusal: paused, not muted, no button; one tap plays it unmuted. |

**Why DELETE failed.** The code was tested against a database that has migration `0002_media_removals`. The test database on Cloudflare almost certainly does not have it yet: Round 5 asked for it to be applied before merging. Without the table:
- the album still loads, because of the deliberate fallback;
- each delete hit a server error, which the iPad showed as "check the wifi" because it treated every failure that way.

Two fixes:
- **Server:** a missing table now answers `503 migration_missing`, "Deleting isn't set up on this database yet. The owner needs to apply migration 0002_media_removals."
- **iPad:** shows the server's own message whenever the server answered, and the wifi message only when the request never arrived. e2e covers both.

The real fix is the owner's: apply the migration (below).

**Files:**
- `functions/api/media/[id].ts` (`migration_missing`)
- `src/lib/types.ts` (error code)
- `GuestBook.tsx` (honest notice; videos hold while the viewer is open)
- `album/playback.ts` (never muted; `autoplay` option)
- `album/MediaMount.tsx` (inline video in both modes; expand icon; "Delete" above the print; no "Sound on")
- `config/site.ts` (`viewer.expand`; `playback.soundOn`, `viewer.openPhoto` and `viewer.playVideo` removed)
- `components.css` (`.mount__delete` restyled; `.mount__expand` new; `.mount__sound` and `button.mount--open` removed)
- tests: `delete`, `playback`, `grid`, `capture` e2e specs
- docs: `DESIGN.md`, `ARCHITECTURE.md`, `TESTING.md`

**Tests:** `npm run typecheck` clean · `npm test` 157 passed · `npm run test:auth` 90 passed · `npm run test:e2e` 50 passed.

**Owner action (required for Delete to work on `dev-acceptance`):**

```bash
npx wrangler d1 migrations apply wedding-guestbook-test --remote --env preview
```

**Needs a real device:**
- On the iPad, check whether a video starts with sound by itself. If Safari refuses, it now waits paused until tapped, instead of playing silently.
- On a phone, on the homepage: tap a video to play or pause it, and tap the expand icon to open it full screen.

**Verdict:** **READY TO MERGE** (Delete on `dev-acceptance` needs the migration above).
