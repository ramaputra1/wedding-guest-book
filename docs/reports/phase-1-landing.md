# Phase 1 — Landing page

**Branch:** `phase1` (as checked out by the owner; `PHASES.md` names it `phase-1-landing`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE

---

## What was built

The site now opens on the cover. The wedding photograph fills the screen, and **Rama & Assela** is set over it in Spectral italic with **19 December 2026** beneath. As the reader scrolls, the album page slides up over the photograph. The first time it comes into view, the photograph recedes slightly into the dark leaf and the page rises over it; this happens once. Below is a placeholder album section with the guest book's single introduction line and "Nothing here yet." Phase 2 replaces it.

**Legibility comes from composition, not from darkening the picture.** The names sit over the photograph's shaded lawn, below the couple, where the picture is already dark. Sky, sea and trees keep their full light, and no scrim, gradient or shadow is applied. Contrast was measured against the real photo pixels at every breakpoint (table below). `site.ts` has a `textPlacement` setting (`lower` / `center`) in case a future photograph needs the names elsewhere.

**The photograph** was prepared by a new script, `scripts/prepare-hero.mjs`. It auto-orients, resizes to 3840 px, re-encodes, and then *checks* that no metadata survived. That check matters here because the repository is public. The original file contained **no GPS coordinates**, but it did contain the **camera body serial number, lens serial number, an owner-name field and Canon maker notes**. All are gone from the committed master and from every generated image. The original stays outside the repo.

At build time, `astro:assets` turns the master into 26 variants: two crops (the full landscape frame, and a 2:3 portrait crop for tall screens), each in AVIF and WebP, plus a JPEG fallback. A phone downloads a ~130–320 KB portrait AVIF instead of the 10.6 MB original. The landing page's HTML is ~4 KB and ships **one 660-byte inline script** (the lift) and nothing else.

| File | Purpose |
|---|---|
| `src/config/site.ts` | Real content: names, joiner, ISO + display date, hero image import, alt text, focus, text placement. Title, description and alt text are *derived* from the names, so one edit updates all of them |
| `src/components/Hero.astro` | The cover: `<picture>` with portrait/landscape × AVIF/WebP sources, names and `<time>` |
| `src/components/CoverLift.astro` | The lift script, inline: marks `<html>` before first paint, observes the album once, then disconnects |
| `src/pages/index.astro` | Cover + placeholder album |
| `src/layouts/Base.astro` | Adds a `head` slot, favicon, `theme-color`, and preloads of the two Spectral faces the cover needs |
| `src/styles/components.css` | Hero, album placeholder and lift styles. Tokens only |
| `src/styles/base.css` | Adds the four `Spectral Fallback` faces (see "Problems", item 4) |
| `src/styles/tokens.css` | Adds the four motion tokens; `--font-display` gains `'Spectral Fallback'` |
| `src/assets/hero/hero.jpg` | The metadata-free master, 3840×2560, 1.69 MB |
| `scripts/prepare-hero.mjs` | Original photo → stripped, resized master, with a metadata check |
| `public/_headers` | Long-lived cache for hashed build output and fonts |
| `public/favicon.svg` | An empty mount: four photo corners on the leaf |
| `package.json` | `sharp@0.35.5` declared as a devDependency. It was already installed by Astro at that exact version; the prep script imports it directly, so it is now declared. Runtime dependencies are still exactly 4 |

**Docs updated, as approved:**
- `PHASES.md`, `README.md`, `DECISIONS.md` D14: the `dev-acceptance` flow.
- `PHASES.md`, `CLAUDE.md`, `DECISIONS.md` D13: no Astro adapter, and why.
- `SETUP-CLOUDFLARE.md`: Node set by `.node-version`; the preview branch; a flagged note that dashboard bindings may be read-only (Phase 3 confirms).
- `STRUCTURE.md`: hero in `src/assets/hero/`, `_headers`, `prepare-hero.mjs`.
- `DESIGN.md`: motion tokens; `Spectral Fallback` in `--font-display`, with a paragraph explaining it.

---

## Acceptance criteria

Measured at TESTING.md's viewports (iPad landscape 1180×820, iPad portrait 820×1180, phone 390×844, desktop 1440×900), plus a 320×568 small phone. Headless Chrome against `npm run preview` (Wrangler).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Hero fills the viewport on iPad landscape, iPad portrait, phone, desktop | PASS (browser) · NEEDS DEVICE TEST (real Safari) | Hero box equals the viewport exactly at all five sizes, e.g. `1180x820 = 1180x820`. No horizontal overflow at any size. Real iOS Safari toolbar behaviour is a device check (see below) |
| 2 | Names and date are legible against the photograph at every breakpoint | PASS | Text hidden, the photo pixels under each text box were measured, and WCAG contrast of `--on-leaf` was computed per pixel. **Names** (large text, AA = 3:1): 98.4–100% of pixels ≥ 3:1; median 6.7–14:1. **Date** (held to the stricter 4.5:1): 99.5–100% of pixels ≥ 4.5:1. Full table below. Screenshots were also inspected by eye |
| 3 | Changing a name in `site.ts` updates the page with no other edit | PASS | Changed `'Rama'` → `'Ramadhan'` in the one `names` line, rebuilt. Title, meta description, `<h1>` and image alt all read "Ramadhan…", with 0 stale occurrences. Restored `site.ts` byte-for-byte (`cmp`) and rebuilt |
| 4 | Cover lift runs once on scroll, and is disabled under `prefers-reduced-motion` | PASS | Counted `transitionrun` events: 0 at load, **1** after the first scroll, still **1** after two more scroll-up/scroll-down cycles. Cover `matrix(0.96…)`, album offset `64px → none`. With `reducedMotion: 'reduce'`: no classes, transforms `none` before and after scrolling, 0 transitions. With JavaScript disabled: no offset left behind, page intact |
| 5 | Zero JavaScript shipped on `/` beyond what the lift requires | PASS | `dist/index.html` has one `<script>` (inline, 660 bytes, the lift) and 0 `type="module"` scripts. Browser network log: **0 script requests** at every viewport. (Preact's runtime files still sit unreferenced in `dist/_astro/` for the future island) |
| 6 | Lighthouse performance ≥ 95 on desktop and mobile | PASS | **Mobile: 99** (three runs, all 99): FCP 0.8 s, LCP 2.0 s, TBT 0 ms, CLS 0. **Desktop: 100** (two runs): FCP 0.2 s, LCP 0.5 s, CLS 0. Accessibility 100 on both. Lighthouse 12.8.2, run locally against Wrangler; production on Cloudflare adds compression and edge caching |
| 7 | No font CDN request; no layout shift as fonts load | PASS | 0 requests to any other host at every viewport. CLS **0** on normal loads and in every Lighthouse run. Stress test with all fonts held back 2 s (forcing fallback → swap): CLS **0.0003** (phone) / **0.0012** (desktop), down from 0.0015 / 0.006 before the metric-matched fallback; Google's "good" line is 0.1 |

### Legibility, measured

Share of photo pixels under each text box where `--on-leaf` meets the bar:

| Viewport | Names ≥ 3:1 | Names median | Date ≥ 4.5:1 | Date median | Image served |
|---|---|---|---|---|---|
| iPad landscape | 99.4% | 12.1:1 | 99.9% | 14.0:1 | landscape AVIF |
| iPad portrait | 100% | 13.8:1 | 99.9% | 13.9:1 | portrait AVIF |
| Phone | 100% | 14.1:1 | 99.5% | 12.8:1 | portrait AVIF |
| Desktop | 99.7% | 12.1:1 | 99.9% | 13.9:1 | landscape AVIF |
| Small phone 320 | 98.4% | 6.7:1 | 100% | 14.0:1 | portrait AVIF |

The pixels below the bar are scattered sunlit spots in the grass, at worst on the 320 px phone. Each text box was measured as a whole rectangle, including the gaps between letters, so these figures are conservative. In the screenshots every letter reads clearly.

---

## Tests

No test runner exists yet (Vitest and Playwright arrive in Phase 3/7). The checks below were run as scripts in the session scratchpad, using a throwaway `playwright-core`, `lighthouse` and system Chrome; nothing was added to the project.

| Test | What it does | Result |
|---|---|---|
| Clean build | `rm -rf dist && npm run build` | exit 0, **0** lines matching warn/error/deprecat |
| Type check | `npm run typecheck` | exit 0 |
| Token parity | DESIGN.md css blocks vs `tokens.css` | 46 / 46, no extras, no mismatches |
| Viewports + legibility | 5 viewports: hero box, overflow, chosen image, per-pixel contrast | all pass (table above) |
| Lift | transition count across 3 scroll cycles; reduced motion; JS off | 1 run; 0 under reduced motion; intact without JS |
| Layout shift | PerformanceObserver, normal and fonts delayed 2 s | 0 / 0.0003–0.0012 |
| Fallback metrics | canvas measure of Spectral vs Spectral Fallback | ascent/descent identical (136/59 at 128 px); width within 0.3–2.8% |
| Lighthouse | mobile ×3, desktop ×2 | 99 / 100 perf, 100 a11y |
| Name change | edit one name, rebuild, grep, restore | all four places updated; restored byte-for-byte |
| Metadata | EXIF parser on master + all 26 variants | no EXIF / XMP / IPTC anywhere |
| Secrets | grep for keys/tokens across the repo | none |
| Cache headers | `curl -I` on a font and a hashed CSS file | `public, max-age=31536000, immutable` |

```
[motion] at load        htmlClass 'lift-ready'         cover none               album matrix(…, 0, 64)  runs 0
[motion] after scroll   htmlClass 'lift-ready lifted'  cover matrix(0.96, …)    album none              runs 1
[motion] after 2 cycles htmlClass 'lift-ready lifted'  cover matrix(0.96, …)    album none              runs 1
[reduced] after scroll  htmlClass ''                   cover none               album none              runs 0
[no-js]                 htmlClass ''                   album none               names 'Rama & Assela'

mobile:  perf 99  a11y 100  FCP 0.8 s  LCP 2.0 s  TBT 0 ms  CLS 0
desktop: perf 100 a11y 100  FCP 0.2 s  LCP 0.5 s  TBT 0 ms  CLS 0
```

---

## Verified by hand

- Inspected screenshots at all five viewports (Chrome). The names sit on the shaded lawn below the couple, the couple stays the subject on every crop, and sky and sea are untouched.
- Inspected a mid-lift screenshot (iPad landscape). The photograph sits inside a thin leaf border as the album covers it, which reads as a print laid on the page.
- Read the built HTML: no HTML comments shipped, one inline script, preloads ahead of the stylesheet.
- Accessibility: the page has no interactive elements yet, so there is no focus order to test. Heading structure is a single `<h1>`, the date is a real `<time datetime="2026-12-19">`, the photograph has descriptive alt text, and `lang="en"` is set.

---

## Needs a real device

| What to test | On | What good looks like | What to watch for |
|---|---|---|---|
| Hero height in Safari | iPhone + both iPads | Photo fills the screen on load; names fully visible above the bottom toolbar | Names hidden behind Safari's bottom bar, or a band of album showing under the photo after the toolbar collapses (the hero uses `100svh`, the small viewport, on purpose) |
| The lift | Both iPads, finger scroll | One calm settle the first time the album appears, then never again | Jank, a jump, or replaying on every scroll |
| Reduced motion | iPad: Settings → Accessibility → Motion → Reduce Motion **on** | No lift at all; the album simply scrolls | Any movement |
| Type rendering | iPad | Spectral italic names crisp, no fallback flash | A visible font swap on first visit |
| Photo crop | iPhone portrait | Couple centred and clear | Couple cut off or too small |

---

## Deferred

- **404 page and `robots.txt`** (Phase 7, plus an owner decision below). With no `404.html`, Cloudflare Pages serves the landing page with status **200** for *every* unknown path, including `/robots.txt`. That is why Lighthouse's SEO audit shows 92. Not a Phase 1 criterion.
- **Security headers / Content-Security-Policy** (Phase 7). `_headers` currently only sets caching. The lift script is inline, so a CSP will need its hash; Astro can emit that.
- **Share-preview metadata** (Open Graph image, title). Not in any phase yet; worth adding before the link is sent to guests. Flagging it, not building it.
- **Focus-ring and hairline tokens** (Phase 2), still unapproved from the Phase 0 proposal. Phase 2 needs them for the selection rule and the keyboard focus outline.
- **The placeholder album section** is replaced in Phase 2.

---

## Problems and surprises

1. **The camera file carried identifying metadata.** No GPS, but the body serial, lens serial, owner name and maker notes were all present. `prepare-hero.mjs` strips and *verifies*, and the original never entered the repo. **Any future photo should go through that script**, not straight into `src/assets/`.
2. **Astro copies the imported master into `dist/` at full size** (`hero.UJ7zcPip.jpg`, 1.77 MB) even though no page references it. It is metadata-free, so it's harmless, but it is publicly fetchable if someone guesses the hashed name. Not worth fighting.
3. **Lighthouse caught a `sizes` off-by-a-hair.** The mathematically exact `67vh` for the portrait crop made common phones pick the 1280 w file (210 KB) over the 960 w (130 KB). It is now `66vh`, a deliberate 1% under-estimate, which cut mobile LCP from 2.4 s to 2.0 s and raised the score from 98 to 99.
4. **The font swap moved the names slightly.** CLS was 0 in all normal loads, but when fonts arrived late the names nudged ~6 px, because Georgia italic is ~10% wider and sits differently in the line than Spectral. Two fixes:
   - (a) The title box now spans the full width, so the box itself no longer resizes.
   - (b) With the owner's approval, I added `Spectral Fallback`: Georgia resized with `size-adjust` and `ascent`/`descent-override`, with the values *measured* in Chrome. The token `--font-display` changed accordingly in DESIGN.md and tokens.css. Residual stress-test CLS is 0.0003–0.0012.
5. **`svh`, not `dvh`, for the hero.** `dvh` would track iOS toolbars collapsing and rescale the photograph mid-scroll. The cost: after the toolbar collapses, a strip of the album can show under the photo. That is listed under device tests.
6. **Two motion values are not tokens:** the cover recedes to `scale(0.96)`, and the album rises by `--space-8`. The second uses a spacing token; the scale factor has no token category in DESIGN.md. It is the one bare number in `components.css`. If you want it named, I'd propose `--lift-scale: 0.96` in the Motion section.
7. **The date is stored twice** in `site.ts`: `date.iso` (machine-readable) and `date.display` (your chosen wording). Changing the date means editing both; they sit next to each other.

---

## Owner actions before the next phase

- [ ] Review and commit. Notable new files: `src/assets/hero/hero.jpg` (metadata-free master), `scripts/prepare-hero.mjs`, `public/_headers`, `public/favicon.svg`.
- [ ] **Keep the original photo somewhere safe outside the repo.** The copy I worked from is in a temporary session folder that will be cleaned up.
- [ ] **Decide: should search engines index the site?** A personal wedding site is often kept out of Google (`robots.txt: Disallow`), but it's your call. This goes in with the 404 page.
- [ ] **Approve or adjust the Phase 2 tokens** proposed in Phase 0: `--rule-width: 1px` (hairline and selection rule) and `--focus-width: 2px` (keyboard focus ring). Optionally `--lift-scale` (item 6 above).
- [ ] Optional: check the cover on your iPhone and iPads once this branch's preview URL is up (the device table above).

---

## Verdict

**READY TO MERGE**

You are merging the finished landing page: the cover photograph (metadata-stripped, served responsively: ~130–320 KB on phones, up to ~720 KB on a 4K screen), the names and date set over its shaded lawn with measured AA contrast at every breakpoint, the one-time cover lift (off under reduced motion), and Lighthouse 99 mobile / 100 desktop with zero layout shift, plus the approved doc corrections.
