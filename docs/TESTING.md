# Testing

What gets tested, how, and — importantly — what a browser on a laptop can never prove.

---

## The principle

The two things most likely to ruin this project are **a write that silently fails** and **a stranger who can write**. Both are testable without any UI, and both are tested that way. Everything else is secondary.

A test that only proves a button is hidden proves nothing. Permissions are tested by making the request.

---

## 1. Authorization — the real security test

Buttons hidden in the UI are cosmetic. These tests hit the endpoints directly.

`tests/auth.spec.ts` must cover, **for every mutating endpoint individually** — not once against middleware and assumed for the rest:

| Case | Expected |
|---|---|
| No cookie | 401 |
| Malformed cookie | 401 |
| Cookie with a valid payload but **forged signature** | 401 |
| Cookie signed with an **old key** after rotation | 401 |
| **Expired** cookie | 401 |
| Valid cookie | 2xx |
| Valid cookie, but `device_id` injected in the **body** | Ignored for permission; label comes from the session |
| Valid cookie, but `device_id` injected in the **query string** | Same |
| `GET /api/entries` with no cookie | 200 — public read works |

Plus a bundle check: grep the built output for `SESSION_SIGNING_KEY` and `WRITER_PASSPHRASE_HASH` values and confirm zero matches. Paste the command and its output into the phase report.

---

## 2. Concurrency — two iPads at once

`tests/concurrency.spec.ts`:

- Fire 200 simultaneous entry creations, alternating `ipad1` and `ipad2`.
- Assert 200 distinct rows exist, with 200 distinct IDs.
- Assert no row was overwritten and none lost.
- Assert every ID carries the correct device prefix.
- Repeat for media rows and canvas versions.

Then the one that actually matters for the data model: **save the same entry's canvas from both devices in the same instant** and confirm both versions exist, neither clobbering the other.

---

## 3. Upload failure — nothing is ever lost

`tests/e2e/upload-failure.spec.ts` (Playwright, real browser and IndexedDB), with the queue's rules also unit-tested in `tests/uploader.spec.ts`. The requirement is that a capture is not "saved" until storage confirms it, so failure is the interesting path.

| Scenario | Expected |
|---|---|
| Network dies mid-upload | Item NOT marked saved; stays in the IndexedDB queue |
| Network returns | Item uploads automatically and flips to "Saved" |
| Browser closed with items queued | Items survive reload and resume |
| R2 write succeeds, D1 insert fails | Item NOT marked saved; no orphan claimed as saved |
| Upload exceeds the size limit | Rejected server-side with a clear error |
| Upload with a mismatched content type | Rejected server-side |
| Same item retried twice | No duplicate row |

Throttle with Playwright's network emulation; kill the connection outright rather than just slowing it.

---

## 4. Browser journeys

Playwright, in `tests/e2e/`. They run in the **installed Google Chrome** (`channel: 'chrome'`), so no Playwright browser download is needed, with Chrome's fake camera and microphone standing in for the iPad's. `npm run test:e2e` builds the site and starts its own server with throwaway secrets.

Core journey, run against **both** `/ipad1` and `/ipad2`:

```
load → scroll past the hero → album renders → select a slot →
sign in → capture → save a canvas → reload → everything persists
```

Public journey, against `/`:

```
load → album renders read-only → no write control is reachable →
a direct POST from the page context is rejected
```

Viewports: iPad landscape (1180×820), iPad portrait (820×1180), phone (390×844), desktop (1440×900).

**The writing page** (`tests/e2e/canvas.spec.ts`). Pen and touch input are sent through Chrome's DevTools protocol, which produces real `PointerEvent`s with `pointerType` `pen` (with pressure) and `touch`. Covered: strokes saved as new versions with the earlier one kept; Clear after a save; the PNG is 2000 × 1500; the saved stroke JSON redraws the same pixels as the PNG; undo through a resize; unsaved strokes through a reload; offline save; no scroll while a finger writes; palm rejection logic; and coalesced events — stubbed to return three samples per move, to prove every sample becomes a point. None of this proves how the Pencil *feels*: that is §6.

---

## 5. Accessibility

Automated scan plus a manual pass — the scan catches maybe half of what matters.

- Zero violations from an automated check on `/` and `/ipad1`
- Full keyboard traversal with visible focus at every stop
- Every icon-only control has an accessible name
- Contrast at AA; `--brass` never used for small text on the leaf
- `prefers-reduced-motion` genuinely removes motion, verified by toggling it
- Nothing conveys meaning by color alone
- The canvas has a text alternative

---

## 6. What only a real iPad can prove

**Do not claim browser automation validates any of this.** Automation validates everything *around* these; it cannot validate the thing itself.

| What | Why automation can't | What the owner checks |
|---|---|---|
| Apple Pencil pressure | No synthetic event reproduces a real pressure curve | Stroke width responds to pressure naturally |
| Palm rejection | Requires a real palm on real glass | Resting a hand while writing produces no stray marks |
| Stroke latency | Emulated events have no hardware pipeline | Ink keeps up; writing doesn't feel laggy |
| Camera permission | The real Safari prompt can't be scripted | Prompt appears, allow works, deny falls back correctly |
| Video file size and quality | Depends on the actual encoder | A 15s clip is ~5 MB and looks good |
| Venue wifi | Can't be simulated | A 10 MB video uploads in acceptable time |
| Session persistence | Needs a real app close/reopen | Close Safari fully, reopen, still signed in |

Every phase report collects its device-test items; Phase 7 consolidates them into the Phase 8 checklist.

---

## 7. Restore drill

Written procedures rot. In Phase 6 the restore is **performed, not described**:

1. Create a test entry with a photo, a video and a canvas.
2. Run the archive export.
3. Delete the entry from D1 and its objects from R2.
4. Restore it from the archive.
5. Confirm it reappears intact, including the canvas version history.
6. Paste the commands and output into the phase report.

Also confirmed: **`viewer.html` opens from `file://`** with no server, no internet, and plays a video.

---

## Running tests

`npm test` starts the real Pages Functions under `wrangler pages dev` on a free port, against a fresh local D1 + R2 in a temporary folder, with a signing key and passphrase generated for that run and passed as bindings. It never reads `.dev.vars` and never touches Cloudflare. Requests go over HTTP exactly as an iPad's would; nothing is mocked.

```bash
npm test                 # unit + integration (vitest)
npm run test:e2e         # Playwright journeys
npm run test:auth        # authorization suite alone — run this before every merge
```

If Playwright browsers aren't installed:

```bash
npx playwright install chromium
```

If that fails because of a restricted network, say so in the phase report and mark the browser journeys `NEEDS DEVICE TEST` rather than claiming they passed.

---

## Before the wedding

A final rehearsal, not a test run:

- [ ] Both iPads signed in and left alone for a week — still signed in
- [ ] 20 test entries created across both devices
- [ ] Archive export run; `viewer.html` checked offline
- [ ] Test entries deleted; export re-run and verified clean
- [ ] Storage gauge matches what Cloudflare reports
- [ ] Billing alert confirmed active
- [ ] Both iPads charged, screen-lock extended, Safari tabs cleared
- [ ] The site loaded once on each iPad at the venue on venue wifi
