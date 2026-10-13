# Feature — Settings: the album's look

**Branch:** `fix-grid` (as checked out by the owner)
**Date:** 2026-10-13
**Verdict:** READY TO MERGE, once migration 0003 is applied to the test database (see "Owner actions")

---

## What was built

A **Settings** control on signed-in iPads, the word underlined at the top right of the album. It opens a sheet at the side of the screen, so the album beside it previews every choice as it is made. **Save** applies the look to the **whole album**: both iPads and the public site. **Cancel** or Escape puts back the look that was saved.

| Question | Choices (first = the designed album) |
|---|---|
| Album colour | Midnight, Charcoal, Forest, Wine, Walnut, Navy |
| Photo frame | Photo corners, White border, Instant print, No border |
| Writing paper | Ruled, Plain, White, Dotted |
| Watermark | The owner's text, up to 24 characters, in one of 7 places: four corners, top, bottom, middle. Empty means none. |
| Decoration | None, Botanical, Confetti, Starlight |

**Owner decisions:**
- **One look for the whole album.** Frame and paper are album-wide, not chosen per spread.
- **The watermark is the owner's mark** (e.g. the couple's initials), not something guests fill in.
- **Settings is open on any signed-in iPad.** A person beside each iPad keeps guests out of it. Re-asking the passphrase on Save was offered and declined.
- **I designed the options,** within the design system.

**How it works:**
- `POST /api/settings` (session) inserts a row into the new `album_settings` table. The newest row by server time is the look in use. Earlier looks stay, so any past look can be restored.
- `GET /api/settings` is public, cached 30 s for visitors like the album itself.
- Every value is from a fixed list (`src/lib/settings.ts`, shared by server and island). The watermark is at most 24 characters with no control characters and is only ever rendered as text, so nothing sent can become CSS or markup.
- The island puts `data-leaf`, `data-frame`, `data-paper` and `data-theme` on `<html>`, and the CSS does the rest.
- The watermark is a text element on every writing page, under the ink, sized to the page.
- A returning visitor gets the last-seen look before first paint: a few-line inline script reads it from `localStorage`. The cover still hydrates nothing.
- **Design system:** the new colours and alphas are tokens, added to `DESIGN.md` and `tokens.css` together (parity checked). All six album colours keep `--on-leaf-soft` ≥ 4.5:1 and `--brass` / `--recording` ≥ 3:1. Light album colours were left out on purpose: every colour on the leaf was chosen for a dark ground.
- **The themes are a deliberate exception to DESIGN.md's "no decoration".** They are faint ornaments on the leaf only, never on prints or pages, never animated, never brass; "None" stays the default. Recorded as D21.

| Area | Files |
|---|---|
| Model | `src/lib/settings.ts` (new: choices, defaults, `parseLook`), `src/lib/look.ts` (new: apply and remember) |
| Server | `functions/api/settings.ts` (new), `lib-server/db.ts` (`latestSettings`, `insertSettings`), `functions/api/_middleware.ts` (public GET) |
| Schema | `migrations/0003_album_settings.sql` (new; additive only) |
| Island | `SettingsDialog.tsx` (new), `album/Watermark.tsx` (new), `GuestBook.tsx` (load, preview, save, poll every minute), `Album.tsx` (dot pattern), `Spread.tsx`, `WritingPage.tsx`, `WritingCanvas.tsx` |
| Page | `layouts/Base.astro` (inline script that applies the remembered look) |
| Config | `src/config/site.ts` (`settings` wording; kept the owner's formatting and "Delete (1)") |
| Styles | `tokens.css` (album colours, `--writing-dot`, `--watermark`, `--ornament`), `components.css` (frames, papers, watermark, themes, Settings sheet) |
| Tests | `tests/settings.spec.ts` (new), `tests/auth.spec.ts`, `tests/e2e/settings.spec.ts` (new), `tests/e2e/delete.spec.ts` (follows the owner's label) |
| Docs | `DESIGN.md`, `ARCHITECTURE.md`, `DECISIONS.md` (D21), `SETUP-CLOUDFLARE.md`, `STRUCTURE.md`, `TESTING.md` |

---

## Acceptance (the owner's five points)

| # | Request | Result | Evidence |
|---|---|---|---|
| 1 | Album background colour choices | PASS | e2e: choosing Forest previews at once (`body` becomes `rgb(17, 26, 21)`); Cancel and Escape restore it; a saved Navy survives a reload on the iPad and shows on the public album. |
| 2 | Photo frame choices | PASS | e2e: Instant print hides the corners and gives the print a 32 px foot, on the iPad and the public album. All four checked in screenshots. |
| 3 | Writing paper choices, incl. full white | PASS | e2e: White gives `--photo-paper` and no ruling. Dotted and Plain checked in screenshots. |
| 4 | Owner's watermark: free text, max length, choice of place | PASS | e2e: the input stops at 24 and counts "24 of 24"; the server refuses 25 and accepts 24 emoji. "R & A" at Top right appears in the top-right of saved pages, the live writing page and the public album; it is `aria-hidden` and takes no taps; emptied, it disappears. |
| 5 | Theme: decorations on the album background | PASS | e2e: the ornament layer is painted on the album leaf with its pattern and `--ornament` colour. Botanical, Confetti and Starlight checked in screenshots. Faint by design. |

Also verified:
- Settings appears only on signed-in iPads, never on the public album.
- Save failures keep the sheet open and show the server's reason.
- A returning visitor sees their remembered look even with every island script blocked.

---

## Tests

| Test | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Unit + integration | `npm test` | 179 passed (new: 13 in `settings.spec.ts`) |
| Authorization | `npm run test:auth` | 98 passed (`POST /api/settings` × every bad cookie; no rejected save changed the look) |
| Browser journeys | `npm run test:e2e` | 55 passed (5 new) |

Other checks:
- Token parity between `DESIGN.md` and `tokens.css`: identical.
- Non-English text scan of code and docs: clean.

---

## ⚠ Database schema change

`migrations/0003_album_settings.sql` adds **one new table** and touches nothing existing. Without it the album shows the designed look, and Save answers "Settings aren't set up on this database yet…".

---

## Needs a real device

| What | On | What good looks like |
|---|---|---|
| The sheet | iPad, `/ipad1` | Opens from "Settings", scrolls, and the album beside it changes as you choose |
| Colours, frames, papers | iPad and a phone (public) | Everything stays readable; ink colours read well on every paper |
| Watermark | iPad | Your initials sit where chosen and do not get in the way of writing |
| Themes | iPad and a phone | Ornaments are faint and never distracting; scrolling stays smooth |

---

## Deferred

- **Phase 6 (Durability):** the archive must include `album_settings`, so a restored album keeps its look and watermark.
- **Phase 7:** run an accessibility scan on the Settings sheet.

---

## Problems and surprises

- **The theme layer was first invisible.** The album section paints its own solid leaf over the page. The ornaments now sit on the album section itself; e2e checks that they are painted there.
- **`site.ts` had changed.** It now uses double quotes and the label "Delete (1)", committed by the owner. I kept both. The delete test now accepts any label starting with "Delete".
- **"Delete (1)" and voice control.** The button's accessible name is "Delete this photo", which does not contain the visible "(1)". Voice-control users who say exactly what they see may not reach it (WCAG 2.5.3). If "(1)" stays, the names should include it; tell me and I'll align them.

---

## Owner actions

Before merging into `dev-acceptance`:

```bash
npx wrangler d1 migrations apply wedding-guestbook-test --remote --env preview
```

It should list `0003_album_settings.sql ✅`, and also `0002` if that has not been applied yet.

Before `main`:

```bash
npx wrangler d1 migrations apply wedding-guestbook --remote
```

---

## Verdict

**READY TO MERGE**, once the test-database migration above has been applied. This adds Settings: one look for the whole album (colour, frame, paper, watermark, decoration), saved as history and never overwritten.
