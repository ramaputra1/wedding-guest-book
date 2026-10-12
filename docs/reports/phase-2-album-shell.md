# Phase 2 — Album shell

**Branch:** `phase2` (as checked out by the owner; `PHASES.md` names it `phase-2-album-shell`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE (this is the design review gate; see "Owner actions")

---

## What was built

The album now exists as an interface, filled with placeholder content.

**On `/`**, below the cover, visitors see the book. Each entry is an open spread: a mounted print on the left, held by four photo corners, and its handwritten page on the right, on warm writing paper. A continuous seam runs down the middle. Prints with several items show carousel dots; videos carry a small `0:15` badge. Nothing here can be selected or captured: `/` is read-only.

**On `/ipad1` and `/ipad2`**, the same book adds the writer's controls.
- Tapping a mount selects it: its corners turn brass and a brass hairline appears beneath it.
- A camera rail on the right edge holds the Photo/Video toggle, the shutter, and where the next capture will go ("→ Spread 2").
- The rail collapses to a thin strip.
- In video mode the shutter gains the ring that Phase 4 will deplete over 15 seconds.
- A fresh empty spread always waits at the end of the book. Its four bare corners are the invitation, with no instruction text.

On iPad portrait and phone, each spread folds (mount above, page below, joined by a horizontal seam) and the rail becomes a bottom bar with the shutter in thumb reach.

**How it's built.** The album is the project's one Preact island, used in two modes (owner decision, recorded in `DECISIONS.md` D8):
- Astro pre-renders it to HTML at build time.
- On `/` it hydrates read-only, and only when the album scrolls into view: the cover still loads with **zero** script requests, and ~12 KB gzipped arrives on scroll.
- On the iPad pages it hydrates immediately, with the writer controls.

The writer routes are real routes now (owner decision). Nothing can write yet, because there is no API, so there is nothing to protect until Phase 3 adds sign-in.

**Placeholder content** comes from three files that Phase 3 deletes:
- `src/lib/placeholder-album.ts`: four entries with real ULID ids. The photos are crops of the hero photograph, which is already public.
- `src/lib/placeholder-ink.ts`: handwriting drawn with `perfect-freehand`, the library Phase 5 uses for real ink.
- `src/pages/placeholder/[page].svg.ts`: serves that handwriting as static SVG files.

| File | Purpose |
|---|---|
| `src/islands/GuestBook.tsx` | The island root: album only in `view`; rail + album + selection state in `write` |
| `src/islands/CameraRail.tsx`, `Shutter.tsx` | Rail (collapse, mode radios, destination) and shutter (ring in video mode) |
| `src/islands/album/*.tsx` | `Album`, `Spread`, `MediaMount` (print, corners, badge, carousel, selection), `PhotoCorners`, `WritingPage` (paper + ruled lines), `Gutter` |
| `src/lib/types.ts` | `AlbumEntry`, `AlbumMedia`, `AlbumPage`, `DeviceId` — types only, safe on both sides of the client/server line |
| `src/layouts/Writer.astro`, `src/pages/ipad1.astro`, `ipad2.astro` | The writer pages; the route fixes the device identity (identity, not authorization) |
| `src/pages/index.astro` | Cover + island in view mode, `client:visible` |
| `src/config/site.ts` | All album and rail wording (`album`, `album.camera`, `devices`). No copy is hard-coded in a component |
| `src/styles/components.css` | Album, spread, gutter, mount, corners, dots, writing page, rail, shutter; folded-first with one breakpoint |
| `src/styles/base.css` | Global brass `:focus-visible` ring; `.visually-hidden` |
| `src/styles/tokens.css` + `docs/DESIGN.md` | New tokens (below) and the two accessibility changes |

**Tokens added** (owner: "approve and use yours for now; I'll review later"):

| Token | Value | Use |
|---|---|---|
| `--rule-width` | `1px` | Selection hairline, gutter seam line, dot rings |
| `--focus-width` | `2px` | Brass keyboard focus ring; shutter-ring and chevron strokes |
| `--writing-rule` | `rgba(26, 34, 56, 0.08)` | Ruled lines on writing paper (`--ink` at 8%) |
| `--lift-scale` | `0.96` | Names the Phase 1 cover-lift value |
| `--album-max` | `80rem` | **Not in the approved list; added by me.** Caps the book's width on large screens ("content capped at a comfortable measure"). Please confirm |

**Docs updated:**
- `DESIGN.md`: the tokens above; corners at rest are `--on-leaf-soft`; inactive dots are full-strength rings (owner-approved accessibility fixes); the one breakpoint; the exact focus-ring rule.
- `DECISIONS.md` D8: the island now renders the album in both modes.
- `DECISIONS.md` D13: **corrected**. Phase 0 wrote that dropping the adapter cost "nothing the plan uses"; it cost server rendering of `/`.
- `STRUCTURE.md`: the new tree, and why the album lives in the island.
- `CLAUDE.md`: the hydration rule.
- `PHASES.md` Phase 3: routes already exist, and the placeholder files get deleted there.
- `ARCHITECTURE.md`: `/` renders entries in the browser.

---

## Acceptance criteria

Headless Chrome against `npm run preview` (Wrangler), at iPad landscape 1180×820, iPad portrait 820×1180, phone 390×844 and desktop 1440×900, plus the width sweep below.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Matches `docs/DESIGN.md` — tokens only, no invented values | PASS | Token parity script: **51/51**, no extras, no mismatches. No `var(--x)` is used without a definition. The only literal values left in `components.css` are: the documented breakpoint `48rem`; chevron rotations (`90deg`, `180deg`); `0px` fallbacks in `env(safe-area-inset-*)`; and `50%` for round dots, which is geometry, not a radius choice (commented). `.visually-hidden` uses the standard `1px` clip. No gradients: ruled lines are an SVG pattern. No blur backdrops, no decorative shadows: the only shadows are `--mount-lift` on prints and the gutter's seam depth, both specified in DESIGN.md. Radii stay differentiated: mount 2, paper 3, button 4, pill only on the shutter |
| 2 | Spread reads as an open book; the gutter is a seam, not a gap | PASS (by eye) · owner review | Screenshots at all four viewports. Wide: one continuous seam down the book. The first version broke at every spread join and was fixed (see "Problems", item 3). Folded: the space between spreads (`--space-9`) is now clearly larger than the space within one, so mount and page group as a unit. **This is a judgement; it's yours to confirm on the device** |
| 3 | Empty mount needs no instructional text to be understood | PASS | The empty mount renders four corners and nothing else: no visible text in the DOM. Its accessible name is "New spread, empty" / "Spread 4, empty", for screen readers only |
| 4 | Selection is unmistakable and does not rely on color alone | PASS · owner review | Selected = corners go `--brass` **and** a 1px brass rule appears beneath (shape), **and** the rail's destination text changes ("→ Spread 2"), **and** `aria-pressed="true"`. Measured after the 120 ms transition: corner `rgb(160,138,82)` = `--brass`, rule height `1px` |
| 5 | Rail collapses and expands; shutter target well over 44×44 | PASS | Toggle by click and by keyboard: `aria-expanded` true → false → true, controls `hidden` when collapsed, label "Hide camera" ↔ "Show camera". Collapsed: a 48 px strip (wide) or a single-control bar (folded). **Shutter 64×64** |
| 6 | iPad landscape and portrait both correct; phone folds to one column | PASS (browser) · NEEDS DEVICE TEST | Screenshots: landscape = side-by-side spreads + right rail; portrait and phone = folded spreads + bottom bar. Real iPad Safari check listed below |
| 7 | Full keyboard navigation with visible focus | PASS | Tab walk on `/ipad1` at iPad landscape and phone: **11 stops**, all with a 2 px brass ring (`rgb(160,138,82)`), none without. Order: Hide camera → Photo (radio group) → Take photo → Spread 1 → Spread 2 → dots 1–3 → Spread 3 → Spread 4 → New spread. Operated by keyboard: Enter selects (destination → "Spread 3"); Space deselects; ArrowRight switches to Video (shutter becomes "Start recording"); Enter on dot 3 switches the item; Enter collapses and reopens the rail |
| 8 | No horizontal scroll at any width from 320px up | PASS | Every 10 px from 320 to 1440, at a portrait and a landscape height, on both `/` and `/ipad1`: **452 combinations, 0 overflow** |
| 9 | Contrast checked and passing AA | PASS | Rendered colours measured (table below); every text pair ≥ 4.5:1 and every UI graphic ≥ 3:1. Lighthouse accessibility **100** on `/` and `/ipad1`, mobile and desktop |

### Contrast, measured

| Pair | Ratio | Needs |
|---|---|---|
| Intro text on leaf | 14.4:1 | 4.5 |
| Mode label, unselected, on rail (12.8 px) | 4.97:1 | 4.5 |
| Mode label, selected / destination, on rail | 12.9:1 | 4.5 |
| Duration badge | 14.4:1 | 4.5 |
| Corner at rest vs leaf / vs print border | 5.57:1 / 3.14:1 | 3 |
| Corner selected (brass) vs leaf / vs print border | 5.44:1 / 3.21:1 | 3 |
| Dot ring vs leaf / active dot vs leaf | 5.57:1 / 5.44:1 | 3 |
| Shutter vs rail | 15.6:1 | 3 |
| Focus ring vs leaf / vs rail | 5.44:1 / 4.85:1 | 3 |

---

## Tests

As in earlier phases, these are scripts in the session scratchpad using a throwaway `playwright-core`, `lighthouse` and system Chrome; nothing was added to the project.

| Test | Result |
|---|---|
| Clean build (`rm -rf dist && npm run build`) | exit 0, **0** warnings |
| `npm run typecheck` | exit 0 |
| Token parity | 51/51 |
| Overflow sweep 320–1440 px | 452 combinations, 0 overflow |
| Touch targets | 12 interactive elements per writer page, none under 44×44 |
| Keyboard walk + operation | 11 stops, all ringed; all controls operable |
| Contrast | all pass (table above) |
| Lazy hydration on `/` | **0** script requests with the cover in view; 4 after scrolling to the album; public carousel works after hydration; 0 selectable mounts and no rail on `/` |
| Cover lift (Phase 1) re-check | still 1 run, 0 under reduced motion, intact without JS; scale now from `--lift-scale` |
| Lighthouse | below |
| Secret scan | clean |

```
/ mobile:      perf 99   a11y 100  best-practices 100  LCP 2.0 s  TBT 0 ms  CLS 0
/ desktop:     perf 100  a11y 100  best-practices 100  LCP 0.5 s  TBT 0 ms  CLS 0
/ipad1 mobile: perf 96   a11y 100  best-practices 100  LCP 2.7 s  TBT 0 ms  CLS 0
/ipad1 desktop:perf 100  a11y 100  best-practices 100  LCP 0.7 s  TBT 0 ms  CLS 0

page weight:  /  18.7 KB HTML (5.1 KB gz)   /ipad1  18.0 KB (4.6 KB gz)
island JS:    GuestBook 2.1 KB + Astro client 1.5 KB + preact 4.4 KB + hooks 1.1 KB (gzipped)
```

---

## Verified by hand

Screenshots inspected in Chrome at all four viewports, in four states: public view, writer default, writer with spread 2 selected and video mode on, and rail collapsed.
- **Wide:** the book reads as an open album, with one unbroken seam. Prints and pages align top to bottom. The selected print has brass corners and a brass rule. The dots are ring-versus-disc. The video ring shows on the shutter.
- **Folded:** mount, seam and page group as one unit. The bottom bar has the shutter centred. Collapsed, it shrinks to a single "show camera" control.

---

## Needs a real device

| What to test | On | What good looks like | What to watch for |
|---|---|---|---|
| The book at a glance | iPad landscape | Reads as an open album: prints on black leaves, a seam, warm paper | Looks like a grid of cards; seam reads as a gap or a divider |
| Selection from across a table | iPad | Instantly clear which print is selected | The 1 px brass rule too faint to notice (it can be thickened) |
| Rail open/close | Both iPads | A smooth 240 ms slide | Stutter: the album re-flows while the rail animates |
| Fold | iPad portrait, iPhone | Bottom bar reachable by thumb, clear of the home indicator | Bar hidden by Safari's toolbar or the home indicator |
| Touch accuracy | iPad, finger | Dots and mode toggle easy to hit | Mis-taps between the three dots |
| Reduce Motion on | iPad | Rail opens instantly | Any animation |

---

## Deferred

- **Real entries, sign-in, deleting the placeholder files** (Phase 3, now listed in `PHASES.md`).
- **The shutter does nothing yet**; the video ring is static; no "Saving… / Saved / Not saved" states on mounts (Phase 4).
- **Opening full media on tap / playing a video** ("thumbnails in the grid, full media on tap", ARCHITECTURE.md). Not assigned to a phase yet; I'd fold it into Phase 4.
- **The writing page's ruled lines don't line up with the placeholder ink.** Phase 5's canvas should set the ruling to its own line height.
- **Arrow-key movement between mounts.** Tab works for every control; arrow keys would be a nicety for a long book.
- Still pending from Phase 1: 404 page / `robots.txt` (and your indexing decision), security headers, share-preview metadata.

---

## Problems and surprises

1. **The docs contradicted each other about the album.** `STRUCTURE.md` said album components were static Astro, but entries arrive at runtime, and a static site can't render them. Resolved by your decision (one island, two modes), and the docs were updated. In tracing this I found **my Phase 0 note in D13 was wrong**: dropping the adapter cost server rendering of `/`. It's corrected in place and marked as a correction.
2. **The placeholder handwriting first made `/` weigh 305 KB**, because inline images get serialized twice (in the HTML and in the island's props). Moving it to build-time SVG files brought the page to **18.7 KB**. Real entries in Phase 3 are URLs, so this won't recur.
3. **The gutter looked broken at every spread join.** Each spread drew its own blurred seam line, and the blur faded out at the ends. On wide screens the seam is now drawn once, down the whole book.
4. **Folded spreads grouped the wrong way at first.** The gap inside a spread (~130 px) was larger than the gap between spreads (64 px), so a page looked like it belonged to the *next* photo. Fixed by proximity: 96 px between spreads, and empty dot rows are hidden when folded.
5. **Lighthouse's label-in-name audit** caught the video mount. Its visible "0:15" wasn't in its accessible name, which matters for voice control (WCAG 2.5.3). The name is now e.g. "Spread 3, 1 item, Video 0:15".
6. **The placeholder photos look alike.** A 4:3 crop of a 3:2 photo can only slide sideways. Cosmetic; the real entries replace them in Phase 3.
7. **Every mount is a fixed 4:3, and photos are cover-cropped into it.** That keeps spreads aligned, but **portrait photos from the iPad will be cropped to landscape** in the book. This is a design decision for you (see "Owner actions").
8. **`/` now ships JavaScript.** Phase 1's "zero JavaScript beyond the lift" is superseded by your Phase 2 decision. The cover itself still loads with none; the island arrives only on scroll.
9. **Placeholder content is on `/`.** If `dev-acceptance` is promoted to `main` before Phase 3, the public site will show fake entries.

---

## Owner actions before the next phase

- [ ] **Design review on the iPads.** This is the gate PHASES.md calls "cheaper to rebuild here than anywhere later". Use the device table above and tell me anything that feels wrong.
- [ ] **Decide: portrait photos.** Keep every mount 4:3 (aligned spreads; portrait photos cropped), or let each mount take its photo's shape (no cropping; spreads vary in height)?
- [ ] **Confirm `--album-max: 80rem`**, or give me another cap.
- [ ] **Don't promote `dev-acceptance` to `main` yet**: `/` shows placeholder entries until Phase 3.
- [ ] **For Phase 3** (blocking), per `SETUP-CLOUDFLARE.md`:
  - a Cloudflare account and Pages project
  - the D1 database `wedding-guestbook` and R2 bucket `wedding-media`
  - your chosen passphrase (keep the plaintext in your password manager only)
  - a billing alert
  
  I'd also recommend a separate test database and bucket for previews (`DECISIONS.md` D14).
- [ ] Still open: should search engines index the site?

---

## Verdict

**READY TO MERGE**

You are merging the album interface: open-book spreads with photo corners, brass selection, carousel dots, video badges and a collapsible camera rail. It folds for portrait and phone, is fully keyboard-operable with AA contrast, and has no horizontal scroll from 320 px up. It's rendered by one Preact island that the public cover loads only on scroll. All of it runs on placeholder data until Phase 3.
