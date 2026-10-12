# Phase 0 — Foundation

**Branch:** `phase0` (as checked out by the owner; `PHASES.md` names it `phase-0-foundation`)
**Date:** 2026-10-11
**Verdict:** READY TO MERGE

---

## What was built

The project now exists as an Astro 7 + TypeScript site that builds to plain static files in `dist/`. Cloudflare Pages will serve those files, and Pages Functions in `functions/` will serve the API. `npm run preview` runs both together through Wrangler, with the D1 (`DB`) and R2 (`MEDIA`) bindings already declared and simulated locally. No features exist yet: the only page is an empty `<main>` so that the build has something to emit and the stylesheets actually ship.

The design system is now in code. `src/styles/tokens.css` holds all 42 custom properties from `docs/DESIGN.md`, copied verbatim and checked by script (below). `src/styles/base.css` declares the self-hosted fonts and a small reset, applies the type scale to plain elements, and includes the reduced-motion rule exactly as `DESIGN.md` gives it. It uses no literal colours or lengths, only tokens. The fonts are real files in `public/fonts/`: Spectral at 400 and 600 in roman and italic, and Public Sans as a single variable file. Each comes in a latin and a latin-ext subset, and `unicode-range` means a page only downloads latin-ext if it contains those characters. The SIL Open Font License files sit beside the fonts. They are OFL-licensed and were copied from the Fontsource packages; they are not npm dependencies.

**One deliberate deviation from `PHASES.md`, approved by the owner during the phase:** `@astrojs/cloudflare` is **not** installed. Details are under "Problems and surprises", item 1. In short, every version of that adapter breaks the `functions/` directory the whole API is designed around.

| File | Purpose |
|---|---|
| `package.json` | 4 runtime deps (exactly the cap), 4 build tools, exact versions pinned; `engines.node >= 22.19.0` |
| `package-lock.json` | Locks the full tree so a reinstall in five years gets the same bytes |
| `.node-version` | Pins Cloudflare Pages' build to Node `24.21.0` (current LTS) |
| `astro.config.mjs` | Static output + `@astrojs/preact`. A comment explains why no Cloudflare adapter |
| `tsconfig.json` | Extends `astro/tsconfigs/strict`, sets `"strict": true` explicitly, Preact JSX |
| `wrangler.toml` | Pages config: `pages_build_output_dir`, `DB` → `wedding-guestbook` (placeholder id), `MEDIA` → `wedding-media` |
| `.gitignore` | `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.dev.vars`, `.env*` (except `.env.example`), test artifacts, `.DS_Store` |
| `.env.example` | Variable *names* from `SETUP-CLOUDFLARE.md §6`, secrets left blank |
| `src/styles/tokens.css` | Every `DESIGN.md` token, nothing else |
| `src/styles/base.css` | `@font-face` ×10, reset, type scale, reduced motion |
| `src/styles/components.css` | Empty placeholder, loaded last; Phase 2 fills it |
| `src/config/site.ts` | Typed `SiteConfig` (names, joiner, ISO + display date, hero, intro, title) with placeholder values, `as const satisfies SiteConfig` |
| `src/layouts/Base.astro` | Document shell: `lang`, meta, title from `site.ts`, stylesheets in order tokens → base → components |
| `src/pages/index.astro` | Empty placeholder page. Phase 1 replaces it |
| `public/fonts/` | 10 woff2 files + 2 licence files |
| `.gitkeep` skeleton | `src/components`, `src/islands`, `src/lib/{queue,capture,canvas}`, `functions/api/auth`, `lib-server`, `migrations`, `scripts`, `tests/e2e`, `.github/workflows`, per `STRUCTURE.md` |

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `npm run build` succeeds with zero errors and zero warnings | PASS | Clean rebuild after `rm -rf dist .astro`: exit 0, and `grep -ciE "warn\|error\|deprecat"` on the full build log returns `0`. (`npm install` does print one engine warning on Node 22.14; that is install time, not build. See "Problems", item 2.) |
| 2 | `npm run preview` serves via Wrangler | PASS | `wrangler pages dev` on :8788 → `GET / 200`, CSS `200 text/css`, font `200 font/woff2`. Bindings listed: `env.DB (wedding-guestbook) D1 local`, `env.MEDIA (wedding-media) R2 local`. Wrangler also prints a red `✘ [ERROR] No routes found when building Functions directory` line. It is harmless and explained in "Problems", item 5. |
| 3 | Every token in `DESIGN.md` exists in `tokens.css`, with no extras invented | PASS | A script parses every ` ```css ` block in `DESIGN.md` and compares names *and values*: `DESIGN.md tokens: 42  tokens.css properties: 42 / missing: none / extras: none / value mismatches: none`. A second check found no `var(--x)` in `base.css` that `tokens.css` lacks, and no hard-coded colour or length in `base.css`. |
| 4 | Both fonts load from `public/fonts/`, no network request to any font CDN | PASS | Headless Chrome (system Chrome via a throwaway `playwright-core` in the scratchpad, not added to the project) against **both** `npm run preview` and `npm run dev`. All 8 requested faces report `document.fonts.check → true`. Network log: every font request is `200 http://localhost:<port>/fonts/…woff2`, and `requests to any other host: 0`. latin-ext loaded only when `łő` was requested. Public Sans 400 and 700 came from one file. A grep of `dist/` and `src/` for `googleapis\|gstatic\|fontsource\|typekit\|cdnjs\|jsdelivr\|unpkg` finds nothing. |
| 5 | Dependency count matches the cap in `CLAUDE.md` | PASS | `dependencies (4): idb, perfect-freehand, preact, ulid`. `devDependencies (4): @astrojs/preact, astro, typescript, wrangler` |
| 6 | `tsconfig.json` has `strict: true` | PASS | `tsconfig.json:6  "strict": true`; `tsc --showConfig` resolves `"strict": true`. `npm run typecheck` exits 0. |
| 7 | `.gitignore` covers `.dev.vars`, `.wrangler/`, `dist/`, `node_modules/` | PASS | `git check-ignore -v`: `.gitignore:12 .dev.vars`, `:9 .wrangler/`, `:5 dist/`, `:2 node_modules/`. `.env.example` is matched by the `!.env.example` negation, so it stays tracked. |

The build list for Phase 0 has two items that are not acceptance criteria:

| Build item | Status |
|---|---|
| `npm run dev`, `build`, `preview` all working | Verified. `dev` → `GET / 200`, fonts 200, font check passes |
| `@astrojs/cloudflare` configured | **Not done, by owner decision.** See "Problems", item 1 |

---

## Tests

No test runner exists yet. Vitest and Playwright arrive with the first code worth testing (Phase 3). These are the checks that were run:

| Test | Command | Result |
|---|---|---|
| Clean build | `rm -rf dist .astro && npm run build` | exit 0, 0 warnings |
| Type check | `npm run typecheck` (`astro sync && tsc --noEmit`) | exit 0 |
| Token parity | `python3 token-diff.py docs/DESIGN.md src/styles/tokens.css` | 42 / 42, no extras, no mismatches |
| Font loading | `node check.mjs … http://localhost:8788/` (preview) and `:4321` (dev) | 8/8 faces load, 0 off-host requests |
| Ignore rules | `git check-ignore -v …` | all four required paths ignored |

```
DESIGN.md tokens: 42   tokens.css properties: 42
missing from tokens.css: none
extras not in DESIGN.md: none
value mismatches: none

--- every network request:            (npm run preview)
200 document   http://localhost:8788/
200 stylesheet http://localhost:8788/_astro/index.oHN4TKFD.css
200 font       http://localhost:8788/fonts/spectral-latin-400-normal.woff2
200 font       http://localhost:8788/fonts/spectral-latin-400-italic.woff2
200 font       http://localhost:8788/fonts/spectral-latin-600-normal.woff2
200 font       http://localhost:8788/fonts/spectral-latin-600-italic.woff2
200 font       http://localhost:8788/fonts/public-sans-latin-wght-normal.woff2
200 font       http://localhost:8788/fonts/spectral-latin-ext-400-normal.woff2
200 font       http://localhost:8788/fonts/spectral-latin-ext-400-italic.woff2
--- requests to any other host: 0

computed body: font-family "Spectral, Georgia, …"  background rgb(18, 21, 28) = --leaf   color rgb(232, 228, 220) = --on-leaf
```

The verification scripts live in the session scratchpad and are not part of the repo. I can add them under `scripts/` if you want them kept.

---

## Verified by hand

- Read `dist/index.html`. It is one static document with one stylesheet link and **no `<script>` tag**. `@astrojs/preact` still emits its client runtime into `dist/_astro/`, but no page references it yet.
- Read the built CSS. It has exactly 10 `@font-face` rules, and every `url()` points to `/fonts/…`.
- Stopped every dev and preview process afterwards (`pgrep` shows no astro, wrangler or workerd processes left).

---

## Needs a real device

Nothing in Phase 0 depends on hardware. Fonts were checked in desktop Chrome only. The faces are plain woff2, which Safari has supported since iOS 10, so the first real check on an iPad is Phase 1's landing page.

---

## Deferred

- **Brass focus ring** (Phase 2). The accessibility floor asks for a `--brass` outline with offset, but `DESIGN.md` defines no outline or rule width, and inventing `2px` would break "tokens only". Browser-default focus rings are untouched for now; the reset does not remove outlines. Proposed tokens are listed below.
- **Font preload and fallback metric overrides** (`size-adjust`, `ascent-override` on a Georgia/system fallback) (Phase 1). Phase 1's criterion "no layout shift as fonts load" needs them.
- **`favicon.svg`** (Phase 1).
- **Hero image location** (Phase 1). `STRUCTURE.md` puts it in `public/hero/`, but `astro:assets` only generates responsive sizes for images imported from `src/`. Phase 1 should likely use `src/assets/hero/`, and `site.ts`'s `hero.src` may become an imported `ImageMetadata`. I did not create `public/hero/`, because a `.gitkeep` there was copied into `dist/`.
- **Function and binding types** (Phase 3). Run `wrangler types`, which generates `Env` with `DB: D1Database`, `MEDIA: R2Bucket` from `wrangler.toml` without adding `@cloudflare/workers-types`.
- **Enforce "`src/` never imports `lib-server/`"** with a check in the test suite (Phase 3).
- **Vitest, Playwright, and the `npm test` / `test:auth` / `test:e2e` scripts** (Phase 3 / Phase 7).
- **`@astrojs/check`** to type-check `.astro` files (Phase 1 or 2, owner's call). `tsc` alone ignores them; this matters once components exist.
- **Vietnamese font subset** is not included (only latin + latin-ext). Add it if either name needs Vietnamese diacritics.

### Proposed additions to `DESIGN.md`

None of these were hard-coded. Each needs your approval before a phase uses it:

| Proposed token | Value | Source / need |
|---|---|---|
| `--duration-state` | `120ms` | Durations already stated in `DESIGN.md` prose (Motion) |
| `--duration-rail` | `240ms` | same |
| `--duration-lift` | `600ms` | same; needed by Phase 1's cover lift |
| `--ease` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | same |
| `--rule-width` (or `--hairline`) | `1px` | The selection "hairline rule" and gutter seam (Phase 2) |
| `--focus-width` | `2px` | The brass focus outline required by the accessibility floor |

---

## Problems and surprises

1. **`@astrojs/cloudflare` is incompatible with the approved architecture.** I tested this rather than assuming it:
   - **v14 (current, Astro 7):** targets Cloudflare *Workers* only, via `@cloudflare/vite-plugin`. Against a Pages `wrangler.toml` the build fails: `The name 'ASSETS' is reserved in Pages projects`. It also switches on a KV `SESSION` binding and a Cloudflare Images `IMAGES` binding by default. v13 (Astro 6) follows the same Workers direction.
   - **v12 (Astro 5):** supports Pages, but emits `dist/_worker.js`. On Pages that turns on "advanced mode", which **ignores the `functions/` directory entirely**. Under `wrangler pages dev`, a test `functions/api/ping.js` was never reached; Astro's worker answered instead.
   - **No adapter (Astro 7, static):** `functions/api/ping.js` → `200 {"ok":true}`, and `/` serves the static page. This is what was built, with the owner's approval.

   What this costs: nothing the plan relies on. Every server-side concern was already in `functions/` and `lib-server/`. `/ipad1` and `/ipad2` will be static pages with the device id fixed at build time. That's correct, because the route is identity, not authorization. `Astro.locals.runtime` is not available, but nothing in the docs uses it.

   **Docs that are now wrong** (I did not edit them):
   - `PHASES.md` Phase 0 says "`@astrojs/preact` and `@astrojs/cloudflare` configured". Drop the Cloudflare adapter.
   - `CLAUDE.md` build-time tooling list includes `@astrojs/cloudflare`. Remove it, and perhaps say "no Astro server adapter: it disables `functions/`".
   - `DECISIONS.md` deserves a short **D13 — No Astro adapter** entry recording the reason above, so nobody "fixes" it later by adding the adapter back.

2. **Node version.** Astro 7 requires Node ≥ 22.12. A transitive dependency (`astro → unifont → undici@8`) declares ≥ 22.19, and this machine runs 22.14, so `npm install` prints one `EBADENGINE` warning. The build itself runs clean. `engines.node` is set to `>=22.19.0` so it tells the truth. `.node-version` pins Pages' build to Node 24.21.0 (current LTS, supported into 2028). `SETUP-CLOUDFLARE.md §2` says "Node version 20 or later", which is now wrong. It should say 24, set by `.node-version`.

3. **`wrangler.toml` probably makes the dashboard bindings read-only.** Cloudflare documents that once a Pages project has a `wrangler.toml` with `pages_build_output_dir`, that file is the source of truth for bindings. That conflicts with `SETUP-CLOUDFLARE.md §5` ("bind D1 and R2 in the dashboard"). Plaintext variables (`SESSION_TTL_DAYS`, `MAX_*`) may also need to move into a `[vars]` section; the two encrypted secrets stay in the dashboard either way. I have **not** verified this against a real account; I can't from here. Phase 3 should settle it and update `SETUP-CLOUDFLARE.md`.

4. **The placeholder D1 id could fail a real Pages deploy.** `database_id = "00000000-…"` works locally, because Wrangler keys a local SQLite file by it. A real Pages deployment may reject a binding to a database that doesn't exist. If the Pages project is already connected to this repo, merging Phase 0 could produce a failed deploy until Phase 3 fills in the real id. That would be expected and harmless, since nothing is live yet, but it might look alarming.

5. **Wrangler prints `✘ [ERROR] No routes found when building Functions directory: ./functions - skipping`.** `functions/` holds only a `.gitkeep`. Wrangler carries on ("No Functions. Shimming…") and serves normally. The line disappears once Phase 3 adds the first route.

6. **Astro 7's `astro dev` detached into the background** in this non-interactive shell. It printed `Dev server running … Stop: astro dev stop`. In a normal terminal it should stay in the foreground; I could not check that interactively. If it ever detaches for you, `npx astro dev stop` ends it.

7. **TypeScript "latest" on npm is 7.0** (the native port). `@astrojs/check` accepts only `^5 || ^6`, so TypeScript is pinned to `5.9.3`. Preact is pinned to `10.29.8` because `@astrojs/preact` requires `preact ^10`; Preact 11 is out but unsupported by the integration.

8. **Astro collects anonymous telemetry by default.** It costs nothing and needs no account, but `npx astro telemetry disable` turns it off if you prefer.

**Security notes:** no secret exists anywhere in the repo. `.env.example` has blank values for the two secrets, and `.dev.vars` is ignored. `wrangler.toml` comments say secrets never go there. `lib-server/` exists only as an empty directory.

---

## Owner actions before the next phase

- [ ] Review and commit. I made no git operations. Git will show every new file as untracked, including `package-lock.json`, which should be committed.
- [ ] Apply the doc corrections in "Problems" 1 and 2 (`PHASES.md`, `CLAUDE.md`, `DECISIONS.md` D13, `SETUP-CLOUDFLARE.md` Node version), or tell me to make them.
- [ ] Decide on the proposed `DESIGN.md` tokens (motion durations and easing are needed by Phase 1's cover lift).
- [ ] Upgrade local Node to 24 LTS (`nvm install 24` or similar) to clear the install warning.
- [ ] If the Cloudflare Pages project is already connected, expect the first deploy may fail on the placeholder D1 id (item 4). Otherwise, nothing to do on Cloudflare until Phase 3.
- [ ] **For Phase 1:** both names as they should be set, the wedding date and its display format, and the hero photograph at full resolution.

---

## Verdict

**READY TO MERGE**

You are merging a static Astro 7 scaffold with the full design-token set, self-hosted fonts, a typed `site.ts`, and a Pages + Wrangler setup with D1 and R2 bindings declared. It deliberately has no `@astrojs/cloudflare` adapter, a deviation you approved during the phase, which keeps the `functions/` API directory working.
