# Phase 4 — Capture

**Branch:** `phase4` (as checked out by the owner; `PHASES.md` names it `phase-4-capture`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE (the camera on real iPads is the standard device check; see "Needs a real device")

---

## What was built

The iPads can now take photos and 15-second videos into the guest book, and nothing taken can be lost on the way.

**Capturing.**
- On a signed-in iPad with the rail open, the **live camera appears inside the mount where the capture will land**, and the book scrolls it into view. The front camera faces the guests and is shown mirrored, as people expect; the photo taken is not mirrored.
- **Photo, always on a self-timer** (owner request during the phase): choose **3 s** (default) or **5 s** in the rail. A tap starts the countdown, shown large on the viewfinder and on the shutter's ring; a second tap cancels. Then a JPEG at most 2560 px on its long edge (≈0.9 MB from a real photo) is saved, plus a 640 px thumbnail (≈50 KB). On phones the bottom bar grows to two rows so the extra choice still fits at 320 px.
- **Video:** one tap starts recording H.264 MP4 at 720p, the ring depletes, and recording **stops by itself at 15 seconds**. A second tap stops it early. While recording, the shutter face becomes the rounded "stop" square.
- A **poster frame** is cut from the recording, moving a little later if the first frame is black.
- After each capture the new item shows in its mount for ~2.5 s before the viewfinder returns.
- Capturing into "New spread" makes that spread the destination, so a guest's several shots stay together.
- **If the live camera can't work** (permission refused, or no in-page recorder), the shutter opens the iPad's own camera instead, and a notice says why.

**Saving.**
- Every capture is written to **IndexedDB first**. The uploader then creates the entry if needed, streams each file, and commits.
- **Only a confirmed commit removes the local copy.**
- Failures retry with backoff (2 s, 4 s, 8 s …). After four attempts the mount shows **"That photo didn't save. Tap to try again."**, which stays until it's fixed. Retries continue automatically every minute and whenever the connection returns.
- Queued captures **survive a reload or a closed browser** and resume by themselves.
- An expired session pauses the queue and asks to sign in again; nothing is dropped.
- The rail shows "N waiting to save" and the **storage gauge** from `/api/stats`. A notice appears above the album if the queue piles up (> 250 MB, ≥ 25 items, or > 60% of the iPad's browser storage).

**On the public album**, tapping a print opens it full size in a viewer (a native `<dialog>`); videos play there.

**On the server:**
- the **15-second cap is now read from the video file itself** (`mvhd`/`mehd`), and overrules what the iPad claims
- the native-camera fallback's **QuickTime `.mov` is accepted** when declared (DECISIONS D17), instead of being refused

**Portrait photos keep their shape** (option C, as agreed): the mount stays 4:3 so spreads line up, and a portrait print stands upright inside it, with nothing cropped.

| Area | Files |
|---|---|
| Capture | `src/lib/capture/camera.ts`, `photo.ts`, `video.ts`, `fallback.ts` |
| Queue | `src/lib/queue/store.ts` (IndexedDB via `idb`), `src/lib/queue/uploader.ts` |
| IDs / API | `src/lib/ids.ts` (monotonic `{device}-{ULID}`), `src/lib/api.ts` (upload, commit, stats) |
| Island | `GuestBook.tsx` (orchestration), `CameraRail.tsx`, `Shutter.tsx`, `merge.ts`, `hooks/useCamera.ts`, `hooks/useUploader.ts`, `album/MediaMount.tsx`, `album/MediaViewer.tsx`, `album/Spread.tsx`, `album/Album.tsx` |
| Server | `lib-server/mp4.ts` (duration from the file), `lib-server/files.ts` (`.mov`), `functions/api/media.ts`, `functions/api/media/[id]/[part].ts` |
| Config | `src/config/site.ts`: save, viewer and camera wording; `capture.facing` |
| Styles | `src/styles/components.css`: frame shape, viewfinder, save status, Saved flash, shutter recording, rail status, notices, viewer |
| Tests | `tests/uploader.spec.ts`, `tests/mp4.spec.ts`, more in `tests/uploads.spec.ts`, `tests/fixtures/fake-camera-3s.mp4`, `playwright.config.ts`, `tests/e2e/{global-setup,helpers,capture.spec,upload-failure.spec}.ts` |
| Dev tooling | `@playwright/test@1.64.0` (devDependency, on CLAUDE.md's list). Runtime dependencies are still exactly 4 |

**Docs updated:**
- `DESIGN.md`: print shape, viewfinder, landing, viewer, shutter "stop" face, status line; `--warn` marks rather than writes.
- `ARCHITECTURE.md`: thumbnail size, `.mov` fallback, duration read from the file, viewfinder.
- `DECISIONS.md`: D17 (keep the fallback's `.mov`), D18 (the viewfinder lives in the destination mount).
- `STRUCTURE.md`: new files.
- `TESTING.md`: Playwright runs in the installed Chrome with a fake camera.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Photo captured, resized, uploaded, appears in the selected slot | PASS (now on a self-timer) | `capture.spec.ts › a photo is captured, resized, saved, and lands in the selected spread`: long edge ≤ 2560 (fake camera: 2560×1920). On a real photo the same pipeline gives 2560×1707, 906 KB |
| 2 | Video stops automatically at 15 s, every time | PASS (Chrome) · NEEDS DEVICE TEST (iPad) | `capture.spec.ts › video stops by itself at 15 seconds…`: nobody presses stop; recording ends between 14 and 17 s after starting; the server stores the duration *read from the file*, 14–15.5 s. Passed in 3 of 3 full runs. The stop is a timer separate from the ring, so a throttled tab can't run long |
| 3 | Recorded video is H.264 MP4 and plays in Chrome, Firefox and Safari | PASS (Chrome recording; playback in all three engines) · NEEDS DEVICE TEST (an iPad recording) | The file is served as `video/mp4`, `ftyp` box with a non-QuickTime brand, contains `avc1` (H.264). Played **through the real server** in **WebKit (Safari's engine), Firefox and Chrome**: all `playing: true`, 1280×720, no error. WebKit's `Range: bytes=0-1` probe answered with 206. A real iPad Safari recording can only be checked on the device |
| 4 | Poster frame is a real frame, not black | PASS (Chrome) · NEEDS DEVICE TEST | The poster's average brightness is > 40 on a 0–255 scale (the fake camera is green). Code tries 0.1 s, 0.5 s, 1 s, 2 s until a frame isn't near-black |
| 5 | Network killed mid-upload: not marked saved, stays queued, retries and succeeds | PASS | `upload-failure.spec.ts › the network dies mid-upload…`: thumbnail upload aborted (`connectionreset`), item stays in IndexedDB with `stored: ['original']`, attempts > 0, no row on the server, status shown. On recovery it's saved **exactly once**. Also: `offline, then back online` (real `setOffline`), `files stored but the database write fails` (two 500s on commit), `the server saved it but the reply was lost` (no duplicate row) |
| 6 | Browser closed with items queued: they survive reload and resume | PASS | `upload-failure.spec.ts › the browser is closed with captures queued…`: a persistent Chrome profile goes offline, takes 2 photos, and the browser is **closed**. On reopening the same profile online: still signed in, both items save, one row each |
| 7 | Oversized or wrong-type upload rejected server-side with a clear error | PASS | `uploads.spec.ts`: text posing as JPEG → 415; JPEG as video → 415; `.mov` without `container=mov` → 415; photo > 8 MB → 413; video claiming 16 s → 413; **file whose header says 20 s while the iPad claims 10 s → 413**; unknown container → 400. Messages say what happened ("Videos stop at 15 seconds. This one is longer and was not saved.") |
| 8 | Selecting a slot then capturing puts media in **that** slot | PASS | Same test as #1: three photos (new spread, explicit new spread, then select the **first** spread). The first spread ends with 2 items and the second with 1 |
| 9 | Storage gauge reflects real usage from `/api/stats` | PASS | `capture.spec.ts › the storage gauge shows what /api/stats reports`: the rail text equals the formatted `bytesUsed of bytesAllowance` |
| + | Owner request: photos only on a 3 s or 5 s self-timer | PASS | `capture.spec.ts › a photo waits for its self-timer…`: 3 s is the default; the countdown shows "3"; the upload starts ≥ 2.9 s after the tap. After choosing 5 s it shows "5" and starts ≥ 4.9 s after. A second tap cancels: the countdown disappears and **no** upload happens in the next 6 s. At 1180, 820, 390 and 320 px wide: no horizontal overflow; every rail control ≥ 44 px |
| 10 | Real camera permission prompt on iPad | NEEDS DEVICE TEST | See below |
| 11 | Capture quality and file size on real hardware | NEEDS DEVICE TEST | See below |

---

## Tests

```
$ npm test                       # Vitest: unit + API integration against the real Functions
 Test Files  6 passed (6)
      Tests  121 passed (121)    (Phase 3's 101 + uploader 11 + mp4 5 + video/container 4)

$ npm run test:e2e               # builds, then Playwright in installed Chrome with a fake camera
  ✓ a photo is captured, resized, saved, and lands in the selected spread
  ✓ video stops by itself at 15 seconds, is H.264 MP4, and has a real poster frame
  ✓ the storage gauge shows what /api/stats reports
  ✓ a saved video plays from the public album (Chrome)
  ✓ the network dies mid-upload: not saved, still queued, saved on recovery
  ✓ offline, then back online: the queue sends itself
  ✓ files stored but the database write fails: not saved until it really is, and saved once
  ✓ the server saved it but the reply was lost: the retry adds no duplicate
  ✓ the browser is closed with captures queued: they survive and finish after reopening
  ✓ a photo waits for its self-timer: 3 s by default, 5 s when chosen; a second tap cancels
  10 passed (~1.6 min). The first nine also passed in two earlier full runs (9/9, 9/9) before the timer was added

Playback through the server (Playwright's WebKit 27.2 and Firefox 157, downloaded to a scratch folder, not the project):
  WebKit (Safari engine)  playing, 1280×720  | Range: bytes=0-1, bytes=0-124247
  Firefox                 playing, 1280×720
  Chrome                  playing, 1280×720
```

The browser tests found **two real app bugs**, both fixed:
1. **Switching to Video, then pressing the shutter quickly, opened the iPad's camera app.** The old, already-stopped stream lingered while the new one (with the microphone) started. Now the stream is cleared at once, the shutter is disabled while the camera starts, and the native camera takes over **only** for a real camera problem, never for "still starting".
2. **Pressing the shutter during the 2.5 s "landing" moment also opened the camera app**, because the live video element was unmounted. Now it stays mounted, invisible, underneath.

Two failures were **mistakes in my tests**, not the app, and are fixed:
- A wait that raced the photo encoder.
- A patch that assumed a 32-bit MP4 header when Chrome writes the 64-bit one. The server had read it correctly all along.

Also: `npm run build` has 0 warnings; `npm run typecheck` is clean; DESIGN.md ↔ `tokens.css` parity is 51/51; secret scan clean.

---

## Verified by hand

Screenshots in Chrome:
- **The viewfinder:** in the destination mount, mirrored.
- **Recording:** stop-square face, ring running.
- **After a capture:** the new item in its mount; carousel dots; brass corners and rule on the auto-selected new spread.
- **A portrait photo:** upright in its 4:3 space, corners hugging the print, nothing cropped, spread still aligned.
- **On a phone:** "Not saved" persistent on the mount with the `--warn` edge; "1 waiting to save · 0.0 of 10 GB used" in the strip above the bar. Tapping it retried and saved.
- **The viewer:** full portrait photo, Close button, focus inside the dialog, Escape closes it.

---

## Needs a real device

On the `dev-acceptance` preview URL (HTTPS, which the camera needs), on both iPads:

| What to test | What good looks like | What to watch for |
|---|---|---|
| Camera permission | Safari asks once on `/ipad1`; "Allow" → the live picture appears in the "New spread" mount | No prompt and no picture; or a prompt every visit (Settings → Safari → Camera → **Allow** makes it permanent) |
| Permission refused | Tap "Don't Allow": a notice explains, and the shutter opens the iPad camera app instead; the photo still saves | A dead shutter |
| Framing | Front camera facing the guests; the preview mirrored like a mirror | Wrong camera (`site.capture.facing` can switch to `'environment'`) |
| Photo | Sharp, ~1 MB; appears in the mount, "Saved" brass flash | Soft, dark, or > 3 MB |
| Video | Stops by itself at 15 s; ~5 MB; plays back with sound | Runs past 15 s; no sound; > 10 MB |
| An iPad-recorded video on a **desktop** | Opens and plays in Chrome **and** Firefox on a computer | Black player (would mean Safari did not record H.264) |
| Airplane mode mid-capture | Capture → "Saving…" → stays; turn wifi back on → saves by itself | "Saved" while offline (must never happen) |
| Close Safari with items waiting | Reopen `/ipad1` → they finish saving | Items gone |
| Venue wifi | A 15-second video saves in a reasonable time | Repeated "Not saved" |

---

## Deferred

- **The thumbnail is ~50 KB, not ~40 KB.** 640 px at quality 0.72, chosen so the album stays sharp on a Retina iPad. Lower quality would reach 40 KB at a visible cost; your call.
- **Firefox shows a growing duration for Chrome-made recordings.** Those are fragmented MP4. It plays correctly; only the length shown upfront differs. iPad Safari's recordings are expected to be ordinary MP4 (check with the device test above).
- **No front/back camera switch on screen**; it's a setting (`site.capture.facing`). Easy to add if guests should also photograph the room.
- **Removing a never-saveable item uses the browser's own confirm dialog** (`window.confirm`). It's accessible and recoverable-by-refusal, but unstyled; could match the design later.
- **Content-Security-Policy (Phase 7):** a print's aspect ratio is set with an inline `style` attribute, so the CSP will need `style-src-attr 'unsafe-inline'` (or a class-based alternative).
- **R2 multipart upload** only if a single 15 MB `PUT` proves unreliable on venue wifi (PHASES.md).
- **An automated accessibility scan of the signed-in writer page** (Phase 7). New controls are native buttons, the viewer is a native modal dialog, and all colours are AA-checked pairs from earlier phases.
- Phase 3's iPad sign-in test: I haven't heard the result. Please include it when you test this phase.

---

## Problems and surprises

1. **Chrome records *fragmented* MP4 with a 64-bit (version 1) header**, and puts the duration near the start. Cameras usually put it at the end. The server reads both by walking the file's top-level boxes with small range reads, and never reads the media itself.
2. **Accepting `.mov` reverses part of Phase 3** (which refused QuickTime). The fallback runs exactly when the camera permission was refused, and refusing its output would lose a guest's video (DECISIONS D17). Desktop Chrome and Firefox may not play iOS's HEVC; Safari will, and the file is intact.
3. **Where the viewfinder lives was a design call I had to make**: DESIGN.md didn't specify one. It's in the destination mount (D18). Please judge it on the iPad.
4. **A Chrome quirk:** the very first fake-camera recording attempt with a microphone hung once and never again. If an iPad ever shows the shutter stuck in "starting", that's the first thing to look at.
5. **The reduced-motion rule would have frozen the 15-second ring** (it shortens every animation to 0.01 ms). The ring is drawn from elapsed time in JavaScript instead, because it's a clock, not decoration.
6. **The test server now listens on `localhost`, not `127.0.0.1`**, because browsers only allow the camera on secure origins, and `localhost` counts as one.
7. **Nothing changes in Cloudflare:** no new bindings, secrets, or migrations.

---

## Owner actions before the next phase

- [ ] Review and commit; merge `phase4` → `dev-acceptance`.
- [ ] Run the device table above on **both iPads** via the `dev-acceptance` preview, and tell me what you find, including Phase 3's sign-in test.
- [ ] Judge the design calls on the iPad: the **viewfinder inside the mount** (D18), the **2.5 s landing moment**, and the **self-timer**: is the large countdown number right, and should 3 s stay the default?
- [ ] Optional: thumbnail size (~50 KB now, or smaller at some softness).

---

## Verdict

**READY TO MERGE**

You are merging capture: live photo and 15-second H.264 video (stopped by itself, poster from a real frame, duration verified from the file), written to IndexedDB first and uploaded with retries until the server confirms. It never says "Saved" early, survives offline, reloads and a closed browser, lands in the spread you chose, and shows the real storage gauge. Photos are taken on a 3 s or 5 s self-timer. Backed by 121 Vitest and 10 Playwright tests and playback verified in WebKit, Firefox and Chrome; the camera on the real iPads is the remaining device check.
