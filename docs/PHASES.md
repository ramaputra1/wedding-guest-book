# Build Phases

Nine phases. Each is built on its own branch, reviewed, and merged to `main` before the next begins.

---

## The cycle

```
owner creates branch  →  Claude builds ONLY that phase  →  Claude writes
docs/reports/phase-<N>-<slug>.md with a verdict  →  owner reviews,
commits, opens PR, merges  →  next branch
```

**Claude Code performs no git operations.** See `CLAUDE.md`.

**Claude does not start the next phase.** When the report is written, stop.

---

## Report rules

At the end of every phase, copy `docs/templates/PHASE-REPORT.md` to `docs/reports/phase-<N>-<slug>.md` and fill it in completely. The report must:

- Tick every acceptance criterion as `PASS`, `FAIL`, or `NEEDS DEVICE TEST` — and **never** tick `PASS` for something not actually verified. "Should work" is not verification.
- List what was deliberately deferred to a later phase.
- List anything the owner must do manually before the next phase can start.
- End with **`READY TO MERGE`** or **`NOT READY`** plus the blocker list.

A `NOT READY` with clear blockers is more useful than an optimistic `READY` that costs a review cycle.

---

## Phase 0 — Foundation

**Branch:** `phase-0-foundation`

Scaffold the project and lock the design system in code. No features.

**Build**
- Astro + TypeScript project, `strict: true`
- `@astrojs/preact` and `@astrojs/cloudflare` configured
- `wrangler.toml` with D1 and R2 bindings declared (services created in Phase 3)
- Directory skeleton per `docs/STRUCTURE.md`
- `src/styles/tokens.css` — every custom property from `docs/DESIGN.md`, verbatim
- `src/styles/base.css` — reset, `@font-face`, type scale
- Self-hosted Spectral and Public Sans woff2 in `public/fonts/`
- `src/config/site.ts` with placeholder values and typed fields
- `npm run dev`, `npm run build`, `npm run preview` all working

**Out of scope:** any page content, any component, any API.

**Acceptance**
- [ ] `npm run build` succeeds with zero errors and zero warnings
- [ ] `npm run preview` serves via Wrangler
- [ ] Every token in `DESIGN.md` exists in `tokens.css`, with no extras invented
- [ ] Both fonts load from `public/fonts/`, no network request to any font CDN
- [ ] Dependency count matches the cap in `CLAUDE.md`
- [ ] `tsconfig.json` has `strict: true`
- [ ] `.gitignore` covers `.dev.vars`, `.wrangler/`, `dist/`, `node_modules/`

---

## Phase 1 — Landing page

**Branch:** `phase-1-landing`

**Needs from owner first:** both names, the wedding date and its format, the hero photograph at full resolution.

**Build**
- Full-viewport hero with the photograph as background
- Names **centred**, Spectral italic, `--step-hero`, with the date below
- Legibility treatment over the photograph that is not a flat dark scrim — the type must read without dimming the picture into mud
- Responsive hero images generated at build time via `astro:assets`
- The cover-lift transition from hero into the album section
- Everything editable from `src/config/site.ts`

**Out of scope:** the album itself (a placeholder section below is fine).

**Acceptance**
- [ ] Hero fills the viewport on iPad landscape, iPad portrait, phone, desktop
- [ ] Names and date are legible against the photograph at every breakpoint
- [ ] Changing a name in `site.ts` updates the page with no other edit
- [ ] Cover lift runs once on scroll, and is disabled under `prefers-reduced-motion`
- [ ] Zero JavaScript shipped on `/` beyond what the lift requires
- [ ] Lighthouse performance ≥ 95 on desktop and mobile
- [ ] No font CDN request; no layout shift as fonts load

---

## Phase 2 — Album shell

**Branch:** `phase-2-album-shell`

The interface, with hard-coded placeholder data. This is the main design review gate — it is cheaper to rebuild here than anywhere later.

**Build**
- Spread layout: media mount left, writing page right, gutter between
- Photo corners on mounts; empty mounts show bare corners as the invitation
- Selection state: corners turn `--brass`, hairline rule appears
- Carousel dots beneath multi-item mounts
- Collapsible camera rail with Photo/Video toggle, shutter, destination indicator
- Duration badge treatment for video items
- Responsive folding for iPad portrait and phone
- Keyboard navigation and visible focus throughout

**Out of scope:** real data, camera, canvas drawing, API, auth.

**Acceptance**
- [ ] Matches `docs/DESIGN.md` — tokens only, no invented values
- [ ] Spread reads as an open book; the gutter is a seam, not a gap
- [ ] Empty mount needs no instructional text to be understood
- [ ] Selection is unmistakable and does not rely on color alone
- [ ] Rail collapses and expands; shutter target well over 44×44
- [ ] iPad landscape and portrait both correct; phone folds to one column
- [ ] Full keyboard navigation with visible focus
- [ ] No horizontal scroll at any width from 320px up
- [ ] Contrast checked and passing AA

---

## Phase 3 — Backend

**Branch:** `phase-3-backend`

**Needs from owner first:** Cloudflare account set up per `docs/SETUP-CLOUDFLARE.md`, D1 and R2 created, environment variables set.

**Build**
- `migrations/0001_init.sql` — schema exactly as in `docs/ARCHITECTURE.md`
- `lib-server/session.ts` — HMAC sign/verify, constant-time compare
- `functions/_middleware.ts` — session check on every mutating method
- `functions/api/auth/login.ts`, `logout.ts`
- `functions/api/entries.ts`, `media.ts`, `canvas.ts`, `stats.ts`
- `scripts/hash-passphrase.mjs`
- `/ipad1` and `/ipad2` routes with device identity and the sign-in island
- `tests/auth.spec.ts` and `tests/concurrency.spec.ts`

**Out of scope:** capture, canvas drawing. Endpoints are exercised by tests, not UI.

**Acceptance**
- [ ] Migration applies cleanly to a fresh D1 database
- [ ] `POST /api/entries` with **no** cookie → 401
- [ ] `POST /api/entries` with a **forged** cookie → 401
- [ ] `POST /api/entries` with an **expired** cookie → 401
- [ ] `POST /api/entries` with a valid cookie → 201
- [ ] Every mutating endpoint rejects unauthenticated requests — verified individually, not assumed from middleware
- [ ] `GET /api/entries` works unauthenticated
- [ ] A client-supplied `device_id` in a body or query string **cannot** grant permission
- [ ] 200 simultaneous writes as `ipad1` and `ipad2` produce 200 distinct rows, zero collisions, zero lost writes
- [ ] No secret appears in any client bundle — grep `dist/` for the key and hash and show the result
- [ ] Billing alert configured in Cloudflare (owner confirms)

---

## Phase 4 — Capture

**Branch:** `phase-4-capture`

**Build**
- Photo capture via `getUserMedia`, resize to ≤2560px, ~0.85 quality
- Thumbnail generation (~40 KB) for every item
- Video via `MediaRecorder`, 720p H.264, **hard 15-second stop**
- Poster frame extracted from the first frame
- Shutter progress ring depleting over 15s
- `<input capture>` fallback when `getUserMedia` or `MediaRecorder` is unavailable
- IndexedDB queue: write blob first, upload, retry with backoff, release only on confirmation
- Chunked resumable upload for video
- "Saving…" / "Saved" / "Not saved — tap to retry" states on the mount
- Queue depth and storage warning in the writer UI
- Server-side validation of content type, byte size, duration

**Out of scope:** canvas drawing.

**Acceptance**
- [ ] Photo captured, resized, uploaded, appears in the selected slot
- [ ] Video stops automatically at 15s, every time
- [ ] Recorded video is H.264 MP4 and plays in Chrome, Firefox and Safari
- [ ] Poster frame is a real frame, not black
- [ ] **Network killed mid-upload:** item is NOT marked saved, stays queued, retries and succeeds on reconnect
- [ ] **Browser closed with items queued:** they survive reload and resume
- [ ] Oversized or wrong-type upload rejected server-side with a clear error
- [ ] Selecting a slot then capturing puts media in **that** slot
- [ ] Storage gauge reflects real usage from `/api/stats`
- [ ] NEEDS DEVICE TEST: real camera permission prompt on iPad
- [ ] NEEDS DEVICE TEST: capture quality and file size on real hardware

---

## Phase 5 — Canvas

**Branch:** `phase-5-canvas`

**Build**
- `perfect-freehand` over raw `PointerEvent`s
- `touch-action: none`; `getCoalescedEvents()` with feature detection
- Palm rejection: ignore `touch` once `pen` has been seen
- Pressure → stroke width, with velocity fallback
- 2× DPR backing store
- Tools: pen, pencil, eraser, three inks
- Stroke-level undo; clear with confirmation
- Save writes a **new version row** plus PNG and stroke JSON
- Reduced-motion and no animation near the canvas while drawing

**Acceptance**
- [ ] Strokes are smooth, not segmented, with coalesced events in use
- [ ] Page does not scroll while drawing
- [ ] Saving produces a new version; the previous version still exists in D1
- [ ] "Clear" after a save does not destroy the saved version
- [ ] Exported PNG is crisp at 2× DPR
- [ ] Stroke JSON round-trips — re-rendering from it reproduces the drawing
- [ ] Undo works stroke by stroke and survives a window resize
- [ ] Canvas has a text alternative for assistive technology
- [ ] NEEDS DEVICE TEST: Apple Pencil pressure response
- [ ] NEEDS DEVICE TEST: palm rejection with a hand resting on screen
- [ ] NEEDS DEVICE TEST: perceived latency while writing

---

## Phase 6 — Durability

**Branch:** `phase-6-durability`

**Needs from owner first:** the private archive repository created, with Git LFS enabled and an Actions secret holding a fine-grained token scoped to it.

**Build**
- `scripts/export-archive.ts` — D1 + R2 → `manifest.json` + media files
- `viewer.html` — self-contained offline album, **zero dependencies**, plays video
- `.github/workflows/archive.yml` — nightly and manual dispatch, Git LFS
- `docs/RUNBOOK.md` — revoke a lost iPad, restore a file, restore everything, rotate secrets, check billing

**Acceptance**
- [ ] Export produces a complete archive: every entry, media item and canvas version
- [ ] `manifest.json` validates and references every file present
- [ ] **`viewer.html` opens from `file://` with no server and no internet, and plays a video**
- [ ] Nightly workflow runs green on a manual dispatch
- [ ] Git LFS correctly tracks media; the repo is not bloated with raw binaries
- [ ] **Restore drill performed for real:** delete a test entry, restore it from the archive, confirm it reappears — documented with output in the report
- [ ] `RUNBOOK.md` is specific enough to follow while stressed, with exact clicks and commands

---

## Phase 7 — Review and deploy

**Branch:** `phase-7-review-deploy`

**Build**
- Accessibility pass: focus order, labels, contrast, target sizes, reduced motion
- Responsive audit at every breakpoint
- Playwright journeys in `tests/e2e/`
- Lighthouse on `/`
- Production deploy, custom domain if the owner has one

**Acceptance**
- [ ] Playwright covers: load → scroll → select slot → sign in → capture → save canvas → reload → everything persists
- [ ] Journeys pass for **both** `/ipad1` and `/ipad2`
- [ ] Zero accessibility violations in an automated scan, plus a manual keyboard pass
- [ ] Lighthouse ≥ 95 performance, ≥ 95 accessibility on `/`
- [ ] Public visitor at `/` has no path to any write — verified by request, not by looking for buttons
- [ ] Production deploy live over HTTPS
- [ ] All `NEEDS DEVICE TEST` items from earlier phases collected into one checklist for Phase 8

---

## Phase 8 — iPad rehearsal

**Branch:** none — this is the owner's work, on real hardware.

Claude's job is to produce the checklist in Phase 7 and then fix what comes back.

**The owner tests, on both iPads, ideally at the venue on venue wifi:**

- [ ] Apple Pencil: pressure, palm rejection, latency, eraser
- [ ] Camera permission prompt and capture on both devices
- [ ] Video: 15s cap, quality, file size, playback
- [ ] Both iPads writing at the same time; both entries land in the album
- [ ] Sign-in persists — close Safari, reopen, still signed in
- [ ] **Upload a 10 MB video on actual venue wifi** and time it
- [ ] Airplane mode mid-capture; queue holds; reconnect; it uploads
- [ ] Album readable on a phone, as guests will see it
- [ ] Storage gauge reflects reality after ~20 test entries

**Then delete the test entries** and confirm the archive export is clean before the wedding.

---

## Content the owner still owes

| Item | Needed by |
|---|---|
| Both names, as they should be set | Phase 1 |
| Wedding date and format | Phase 1 |
| Hero photograph, full resolution | Phase 1 |
| Cloudflare account, D1, R2, env vars | Phase 3 |
| Writer passphrase (set in Cloudflare — never sent to Claude) | Phase 3 |
| Private archive repo + Actions token | Phase 6 |
| Custom domain, if any | Phase 7 |
