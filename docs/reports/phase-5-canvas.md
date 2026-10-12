# Phase 5 — Canvas

**Branch:** `phase5` (as checked out by the owner; `PHASES.md` names it `phase-5-canvas`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE (Pencil pressure, palm rejection and latency are the standard device checks; see "Needs a real device")

---

## What was built

Guests can now write on the album's pages by hand, with Apple Pencil or a finger, and every save is kept forever as a new version.

**Writing.**
- On a signed-in iPad, the **page of the destination spread** (the same spread the camera is aimed at) becomes a live canvas. The page is unchanged: same paper, same ruling, no frame.
- Its tools sit in **one quiet row below the paper**: Pen · Pencil · Eraser, three inks, Undo, Clear, Save.
- **Inks** are design tokens:
  - `--ink` (blue-black), the default
  - `--ink-sepia` (new, `#5B3A1E`)
  - `--ink-oxblood` (new, `#6E1E2A`)

  All three are added to `DESIGN.md` and `tokens.css`. The chosen ink has a brass ring.
- The **pencil** is graphite (`--ink-soft`), thinner and slightly translucent.
- The **eraser** removes ink but never the paper.
- **Pressure** from the Pencil drives the line's width. A finger gets a width simulated from speed, so its line still looks alive.
- **Undo** removes one stroke at a time.
- **Clear** asks first, and only clears the screen. Saved versions are untouched.
- **Save** changes to "Saved".
- While the pen is down, the **live camera preview beside the page pauses**, so nothing moves near the canvas. It resumes when the pen lifts.

**How it holds up.**
- Input comes from raw `PointerEvent`s:
  - `getCoalescedEvents()` is used where it exists, so a fast curve is not drawn as straight segments. The parent event's `pointerId` is the only one trusted.
  - **Palm rejection:** once a pen has been seen, touches never draw. A touch that was already drawing when the pen lands is withdrawn.
  - `touch-action: none` and a non-passive `touchstart` stop the page from scrolling and stop iOS's magnifier.
- Two stacked canvases, backed at `max(2, devicePixelRatio)` × their size:
  - finished strokes go on the lower one
  - the stroke being written goes on the upper one, redrawn once per frame
- Strokes are stored in **page units** (1000 × 750), so rotation and resize redraw the same page and undo survives both.
- Every stroke is written to a **draft in `localStorage`**, so a reload or a crash costs nothing.

**Saving.**
- Save creates a **2000 × 1500 transparent PNG** (ink only; the album supplies the paper) and the **stroke JSON**. Both go through the **same IndexedDB queue as photos**: create the entry if new → PUT the PNG → POST the strokes.
- The server assigns the next version number atomically. **Nothing is ever replaced.**
- While a version is on its way, the page shows "Saving…". If it fails, the page shows "That page didn't save. Tap to try again."
- The iPad keeps its draft until the server confirms that version, so the next edit builds on it even offline.
- **Selecting a spread whose page already has writing** loads that page's latest strokes from the new `GET /api/canvas?entryId=` (session required), and the guest carries on from there. If those strokes can't be fetched and the iPad has no copy, the page says so and stays read-only rather than risk a version that hides the earlier writing.

**On the server:**
- `POST /api/canvas` now **refuses stroke JSON that is not a redrawable page**. It must be:
  - `format: "guestbook-strokes"`, version 1
  - a known tool on every stroke
  - every point three finite numbers
- **No database schema change.**

| Area | Files |
|---|---|
| Stroke model | `src/lib/canvas/strokes.ts` (format, tools, perfect-freehand → Path2D, render), `export.ts` (PNG + JSON), `pointer.ts` (coalesced events, palm rejection, pressure), `drafts.ts` (page in progress) |
| Island | `src/islands/album/WritingCanvas.tsx` (new), `Spread.tsx`, `Album.tsx`, `WritingPage.tsx` (save status on a page), `GuestBook.tsx` (save, drafts, camera pause), `merge.ts` (a saving page shows at once) |
| Queue / API | `src/lib/queue/store.ts` (`kind: 'canvas'`, `strokes`), `uploader.ts` (page path), `src/lib/api.ts` (`putCanvasPng`, `commitCanvas`, `getLatestStrokes`), `hooks/useUploader.ts` |
| Server | `functions/api/canvas.ts` (GET latest, stroke validation), `lib-server/db.ts` (`latestCanvas`) |
| Config / types | `src/config/site.ts` (`album.page` wording), `src/lib/types.ts` (`AlbumPage.pending`) |
| Styles | `src/styles/tokens.css` (two inks), `components.css` (live page, tools row, ink swatches) |
| Tests | `tests/strokes.spec.ts`, `tests/canvas.spec.ts` (new); `tests/uploader.spec.ts`, `tests/auth.spec.ts`, `tests/helpers.ts` (updated); `tests/e2e/canvas.spec.ts` (new) |

Runtime dependencies are still exactly 4 (`perfect-freehand` was already one of them).

**Docs updated:**
- `DESIGN.md`: two inks; "Writing on it (writer iPads)".
- `ARCHITECTURE.md`: `GET /api/canvas`; how the canvas is built (page units, stroke document, drafts, carrying on).
- `DECISIONS.md`: D19 (a version is the whole page, continued from the latest).
- `STRUCTURE.md`: new files.
- `TESTING.md`: what the canvas journeys cover.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Strokes are smooth, not segmented, with coalesced events in use | PASS (logic) / NEEDS DEVICE TEST (feel) | e2e `coalesced pointer events are used…`: `getCoalescedEvents` is stubbed to return 3 samples per move, with a wrong `pointerId` on purpose. 10 pen moves produce ≥ 31 points and ≥ 10 calls. Smoothness to the eye is a device check. |
| 2 | Page does not scroll while drawing | PASS | e2e `a finger writes without scrolling the page`: with room to scroll both ways, an upward and a downward finger stroke leave `scrollY` unchanged. **Checked that the test catches the bug:** with both `touch-action: none` and the `touchstart` guard removed, it fails (the browser takes the gesture and cancels the stroke). |
| 3 | Saving produces a new version; the previous version still exists in D1 | PASS | e2e `a stroke is drawn, saved as a new version…`: `/api/stats` `canvasVersions` goes +1 per save, `GET /api/canvas` returns version 2 with both strokes, and version 1's PNG still serves 200. API `canvas.spec.ts`: version 2 is returned, version 1 is kept. |
| 4 | "Clear" after a save does not destroy the saved version | PASS | e2e `clearing after a save…`: dismissing the confirmation changes nothing. Accepting it empties the screen while the server's latest stays the saved id. Saving the cleared page makes version 2 (0 strokes), and version 1's PNG still serves. |
| 5 | Exported PNG is crisp at 2× DPR | PASS | e2e: the saved PNG is `image/png` 2000 × 1500 (2× page units), and the live canvas's backing width = CSS width × `max(2, devicePixelRatio)`. |
| 6 | Stroke JSON round-trips — re-rendering from it reproduces the drawing | PASS | Unit `strokes.spec.ts`: JSON → `fromDocument` gives identical strokes. e2e `the saved stroke JSON redraws the same page the PNG shows`: after the draft is released, a reload draws the page from the server's JSON alone. Compared with the saved PNG pixel by pixel, < 5% of inked pixels differ by more than half opacity (anti-aliased edges after rescaling). |
| 7 | Undo works stroke by stroke and survives a window resize | PASS | e2e `undo survives a resize…`: 3 strokes → undo → 2; viewport 1180×820 → 820×1180 changes the backing size, still 2 strokes and ink present; two more undos → 0 strokes, 0 inked pixels. |
| 8 | Canvas has a text alternative for assistive technology | PASS | e2e: the canvas is `role="img"` with `aria-label` "Writing page, New spread. 0 strokes. Write with Apple Pencil or a finger.", and the count updates as strokes are added. Every tool is labelled, ≥ 44 × 44, and selection is `aria-pressed`. |
| 9 | NEEDS DEVICE TEST: Apple Pencil pressure response | NEEDS DEVICE TEST | Logic verified: a CDP pen stroke with force 0.2 → 0.9 is saved with `pressure: true` and a pressure spread > 0.3. The feel on glass is the owner's check. |
| 10 | NEEDS DEVICE TEST: palm rejection with a hand resting on screen | NEEDS DEVICE TEST | Logic verified: e2e `palm rejection…`. A touch already drawing is dropped when the pen lands, and touches after a pen never draw. Only the pen stroke is saved. |
| 11 | NEEDS DEVICE TEST: perceived latency while writing | NEEDS DEVICE TEST | Cannot be measured in automation. |

Also verified, from the Build list:
- **Tools:** the eraser removes ink and is saved as an eraser stroke (e2e).
- **Unsaved strokes survive a reload** (e2e).
- **Offline save:**
  - "Saving…" appears and the draft is kept.
  - A reload shows the page from the iPad's copy.
  - When the connection returns, the save completes, the queue empties and the draft is released (e2e).
- **Narrow screen:** at 320 px the tools wrap with no sideways scroll (e2e).
- **Reduced motion:** nothing new animates. The tools have no transitions, and the only motion near the page is the camera preview, which pauses under the pen.

---

## Tests

| Test | Command | Result |
|---|---|---|
| Typecheck (site + Functions) | `npm run typecheck` | clean |
| Unit + integration | `npm test` | 8 files, 145 passed |
| Authorization suite | `npm run test:auth` | 82 passed (now includes `GET /api/canvas` × every bad cookie) |
| Browser journeys | `npm run test:e2e` | 23 passed (12 new canvas journeys + 11 from Phase 4) |
| Build | `npm run build` | 3 pages; no secret names in `dist/` |

```
 Test Files  8 passed (8)
      Tests  145 passed (145)

      Tests  82 passed (82)

  23 passed (2.1m)
```

New tests:
- **`tests/strokes.spec.ts`**:
  - page units and rounding
  - the pencil is always graphite
  - simulated pressure only without a stylus
  - the JSON round-trip
  - non-documents are refused
- **`tests/canvas.spec.ts`**:
  - five malformed stroke payloads are refused with 400 and save nothing
  - an empty (cleared) page is a valid version
  - `GET /api/canvas`: 404 when never written; the latest version with its exact strokes, older versions kept; 400 for a bad id
- **`tests/uploader.spec.ts`**:
  - the page path: entry → PNG → strokes commit → release
  - offline, the PNG is remembered and only the commit is retried
- **`tests/e2e/canvas.spec.ts`**: 12 journeys, listed in the table above.

Other checks:
- Token parity between `DESIGN.md` and `tokens.css`: 0 mismatches.
- No undefined custom properties, and no hex colours in the new CSS.
- Secret-pattern scan of `src`, `functions`, `lib-server`, `tests` and `docs`: no hits.
- Non-English text scan: no hits.

---

## Verified by hand

Screenshots taken in Chrome after drawing with each tool:
- **1180 × 820:** the tools sit below the paper. The selected tool has a brass underline, and the ink swatches are visible as ink on a paper ring. The keyboard focus ring is visible on a swatch.
- **820 × 1180 and 320 × 700:** the page fills the width, and the tools wrap.
- **Bottom camera bar on narrow screens:** the album's existing bottom padding lets the tools row scroll above it.

---

## Needs a real device

| What to test | On | What good looks like | What to watch for |
|---|---|---|---|
| Apple Pencil pressure | iPad + Pencil, `/ipad1` and `/ipad2` | Pressing harder gives a visibly wider line; a light touch gives a fine one | Uniform width (pressure ignored), or blobs at stroke starts |
| Line weight | Same | Pen reads like a fountain pen at the page's on-screen size; pencil is finer and greyer | Too thin to read from arm's length, or too heavy. The sizes are one line each in `TOOL_OPTIONS` (`src/lib/canvas/strokes.ts`); tell me and I'll tune them |
| Smoothness | Same | Fast loops and signatures stay round | Visible straight segments or corners in quick curves |
| Palm rejection | Same, writing with a hand resting on the glass | No marks where the hand rests, before or after the Pencil touches down | A dot or streak under the palm; a stroke that vanishes mid-word |
| Latency | Same | Ink keeps up with the nib | Ink trailing visibly behind the Pencil |
| No scroll, no magnifier | Same, also with a finger | The page never moves while writing; no loupe on a long press | Page drifting while writing; iOS magnifier or callout appearing |
| Camera pause | Rail open, write on the page | Preview freezes while writing, resumes on lift | Preview not resuming |
| Save offline | Turn wifi off, write, Save, turn wifi on | "Saving…" then the page saves by itself | "Not saved" stuck after wifi returns |
| Rotation | Write, rotate the iPad, keep writing | Strokes stay where they were, sharp | Strokes shifted, stretched or blurry |

---

## Deferred

- **Phase 6 (Durability):** the archive export must include every canvas version's PNG **and** its stroke JSON (`canvases.stroke_data`). It is a self-describing document (ARCHITECTURE, "How it is built"), so the archive can redraw a page without this code.
- **Phase 7 (Review and deploy):**
  - the automated accessibility scan and a manual keyboard pass over the tools row
  - the full Playwright journey "… → save canvas → reload → everything persists" on both `/ipad1` and `/ipad2`. The pieces are covered here, but not that exact single chain on both routes.

---

## Problems and surprises

- **Drawing in an effect blinks the stroke.** Preact runs effects *after* paint. Redrawing the finished-strokes canvas in an effect left one frame where a just-finished stroke had left the upper canvas but not reached the lower one. The e2e pixel check caught it. Fix: the finished stroke is drawn onto the lower canvas in the same task, before the upper one is cleared, and undo and clear redraw immediately.
- **The album's own smooth scroll moves the page under the test's pen.** When the camera starts, the book scrolls the destination into view. Tests now wait for scrolling to stop before drawing. On a real iPad a guest starts writing on a page they can see, so this is a test-timing matter only.
- **Either scroll guard alone stops Chrome scrolling.** `touch-action: none` and the non-passive `touchstart` each suffice in Chrome, and the test only fails with both removed. Both are kept: `touch-action` is what iOS needs for pointer events, and the `touchstart` guard stops the long-press magnifier. This is the kind of thing only the device check can confirm on Safari.
- **Two iPads writing the same page at the same moment:** the later save is what the album shows; the other version is kept but not merged (DECISIONS D19). On the day each iPad usually writes on its own spreads.
- **Drawing is pointer-only.** The canvas cannot be drawn on with a keyboard, which is inherent to handwriting. Every tool around it is keyboard-operable and labelled, and the canvas has a text alternative.
- **Discarding a page version that can never save** (a "Remove" on a permanent failure — not expected in practice) marks the iPad's draft unsaved again. The open page still shows "Saved" until the next stroke or until the page is reopened. Cosmetic; noted rather than complicated.
- **Stricter stroke validation:** `POST /api/canvas` now refuses the loose stroke arrays the Phase 3 tests used. No real data is affected: before this phase nothing could write a page except the tests. A stored page that is not in the new format would load as an empty page. Production has none.
- **Line weights were chosen by eye in Chrome** (pen 8, pencil 5 page units). They may need a nudge on the iPad; see the device table.

No document in `docs/` is now wrong; the ones touched are listed above.

---

## Owner actions before the next phase

- [ ] Review and commit on `phase5`, merge to `dev-acceptance`, and let Cloudflare build the preview.
- [ ] On the preview, with an iPad and Apple Pencil, run the "Needs a real device" table, and tell me if the line weights need changing.

---

## Verdict

**READY TO MERGE**

This merges handwriting on the album's pages: pen, pencil, eraser, three inks, undo, clear, and saving every page as a new, permanent version (PNG + redrawable stroke JSON) through the same no-loss queue as photos. All automated criteria pass; Pencil feel, palm rejection and latency await the device check.
