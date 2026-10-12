# Repository Structure

The layout the project builds toward. Phase 0 creates the skeleton; later phases fill it. If you need a file that doesn't fit this map, say where it should go and why in the phase report.

---

## Tree

```
.
├── CLAUDE.md                     # operating rules — read first
├── README.md
├── .gitignore
├── .env.example                  # copy to .dev.vars locally
├── package.json
├── tsconfig.json
├── astro.config.mjs
├── wrangler.toml                 # D1 + R2 bindings, Pages config
│
├── docs/
│   ├── ARCHITECTURE.md           # system design, data model, auth, capture
│   ├── DESIGN.md                 # the design system — authority for all visuals
│   ├── STRUCTURE.md              # this file
│   ├── PHASES.md                 # build plan + acceptance criteria
│   ├── TESTING.md                # what gets tested and how
│   ├── DECISIONS.md              # choices made, options rejected, why
│   ├── SETUP-CLOUDFLARE.md       # one-time account setup
│   ├── RUNBOOK.md                # written in Phase 6 — operations + recovery
│   ├── templates/
│   │   └── PHASE-REPORT.md
│   └── reports/                  # one report per completed phase
│
├── public/
│   ├── fonts/                    # self-hosted Spectral + Public Sans (woff2)
│   ├── hero/                     # the wedding photograph, responsive sizes
│   └── favicon.svg
│
├── src/
│   ├── config/
│   │   └── site.ts               # names, date, hero path — ALL customisation
│   │
│   ├── styles/
│   │   ├── tokens.css            # every custom property from DESIGN.md
│   │   ├── base.css              # reset, typography, @font-face
│   │   └── components.css        # mount, writing page, rail, gutter
│   │
│   ├── layouts/
│   │   └── Base.astro
│   │
│   ├── pages/
│   │   ├── index.astro           # public album, read-only
│   │   ├── ipad1.astro           # writer, device identity 'ipad1'
│   │   └── ipad2.astro           # writer, device identity 'ipad2'
│   │
│   ├── components/               # static Astro — no hydration
│   │   ├── Hero.astro
│   │   ├── CoverLift.astro
│   │   ├── Album.astro
│   │   ├── Spread.astro
│   │   ├── MediaMount.astro
│   │   ├── PhotoCorners.astro
│   │   ├── WritingPage.astro
│   │   └── Gutter.astro
│   │
│   ├── islands/                  # Preact — the only hydrated code
│   │   ├── GuestBook.tsx         # writer surface root
│   │   ├── CameraRail.tsx
│   │   ├── Shutter.tsx
│   │   ├── Canvas.tsx
│   │   └── SignIn.tsx
│   │
│   └── lib/
│       ├── ids.ts                # {device}-{ULID} generation
│       ├── api.ts                # typed client for /api/*
│       ├── types.ts              # shared Entry / Media / Canvas types
│       ├── queue/
│       │   ├── store.ts          # IndexedDB via idb
│       │   └── uploader.ts       # retry, backoff, resume
│       ├── capture/
│       │   ├── photo.ts          # getUserMedia + resize + thumbnail
│       │   ├── video.ts          # MediaRecorder, 15s cap, poster frame
│       │   └── fallback.ts       # <input capture> path
│       └── canvas/
│           ├── strokes.ts        # perfect-freehand integration
│           ├── pointer.ts        # coalesced events, palm rejection, pressure
│           └── export.ts         # 2x DPR PNG + stroke JSON
│
├── functions/                    # Cloudflare Pages Functions
│   ├── _middleware.ts            # session verification on all mutations
│   └── api/
│       ├── auth/
│       │   ├── login.ts
│       │   └── logout.ts
│       ├── entries.ts
│       ├── media.ts
│       ├── canvas.ts
│       └── stats.ts
│
├── lib-server/                   # shared by Functions only — never bundled client-side
│   ├── session.ts                # HMAC sign + verify, constant-time compare
│   ├── db.ts                     # D1 queries
│   └── r2.ts                     # R2 put/get helpers
│
├── migrations/
│   └── 0001_init.sql
│
├── scripts/
│   ├── hash-passphrase.mjs       # generate WRITER_PASSPHRASE_HASH
│   └── export-archive.ts         # D1 + R2 → archive repo
│
├── tests/
│   ├── auth.spec.ts              # authorization — the real security test
│   ├── concurrency.spec.ts       # two devices writing simultaneously
│   ├── upload-failure.spec.ts    # network death mid-upload
│   └── e2e/                      # Playwright journeys
│
└── .github/
    └── workflows/
        └── archive.yml           # nightly export to the archive repo
```

---

## Boundaries that matter

**`src/` is client, `functions/` and `lib-server/` are server.** Nothing in `lib-server/` may ever be imported from `src/`. That is the line that keeps the signing key and passphrase hash out of the browser bundle. If you find yourself wanting to share a type across the line, put it in `src/lib/types.ts` — types erase at compile time, values do not.

**`src/components/` never hydrates.** Static Astro only. Anything needing state, events, or browser APIs belongs in `src/islands/`.

**`src/config/site.ts` holds every customisable value** — names, date, hero image path, title text. The owner edits this one file to change the wedding's details. Never hard-code a name, date, or copy string in a component.

**`migrations/` is append-only once Phase 3 is merged.** New schema changes get a new numbered file. Never edit a migration that has run against the live database.

---

## Naming

| Kind | Convention | Example |
|---|---|---|
| Astro components | PascalCase | `MediaMount.astro` |
| Preact islands | PascalCase | `CameraRail.tsx` |
| Modules | camelCase | `uploader.ts` |
| CSS custom properties | kebab-case, grouped by role | `--photo-paper` |
| D1 tables and columns | snake_case | `created_at` |
| R2 keys | `{kind}/{entry_id}/{media_id}.{ext}` | `videos/ipad1-01JA.../ipad1-01JB....mp4` |
| Migrations | zero-padded, descriptive | `0002_add_entry_title.sql` |
| Phase reports | `phase-<N>-<slug>.md` | `phase-3-backend.md` |

---

## What does not belong in this repository

- The wedding archive itself. That lives in a **separate private repository** with Git LFS. This repo holds the application; that repo holds the memories. Keeping them apart is what lets you delete or move either one independently.
- Real secrets. `.env`, `.dev.vars`, tokens, the passphrase. All git-ignored; all live in the Cloudflare dashboard.
- Original full-resolution wedding photos, other than the single hero image.
- Build output, `node_modules/`, `.wrangler/`, test artifacts.
