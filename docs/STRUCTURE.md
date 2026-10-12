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
│   ├── _headers                  # Cloudflare Pages cache headers
│   └── favicon.svg
│
├── src/
│   ├── assets/
│   │   └── hero/                 # the wedding photograph, metadata stripped; astro:assets
│   │                             # generates every responsive size from it at build time
│   ├── config/
│   │   └── site.ts               # names, date, hero path — ALL customisation
│   │
│   ├── styles/
│   │   ├── tokens.css            # every custom property from DESIGN.md
│   │   ├── base.css              # reset, typography, @font-face
│   │   └── components.css        # mount, writing page, rail, gutter
│   │
│   ├── layouts/
│   │   ├── Base.astro
│   │   └── Writer.astro          # shared shell of /ipad1 and /ipad2
│   │
│   ├── pages/
│   │   ├── index.astro           # cover + public album, read-only
│   │   ├── ipad1.astro           # writer, device identity 'ipad1'
│   │   ├── ipad2.astro           # writer, device identity 'ipad2'
│   │   └── placeholder/[page].svg.ts  # Phase 2 only — deleted in Phase 3
│   │
│   ├── components/               # static Astro — no hydration
│   │   ├── Hero.astro
│   │   └── CoverLift.astro
│   │
│   ├── islands/                  # Preact — the one island, the only hydrated code
│   │   ├── GuestBook.tsx         # root: album read-only on /, + writer controls on /ipadN
│   │   ├── CameraRail.tsx
│   │   ├── Shutter.tsx
│   │   ├── SignIn.tsx            # Phase 3
│   │   ├── merge.ts              # saved album + queued captures → what the writer sees
│   │   ├── hooks/
│   │   │   ├── useCamera.ts      # the live stream: on only when needed
│   │   │   ├── useUploader.ts    # the queue, as Preact state
│   │   │   └── useSwipe.ts       # sideways swipe through a mount's items
│   │   └── album/                # the album's parts, shared by both modes
│   │       ├── Album.tsx
│   │       ├── Spread.tsx
│   │       ├── MediaMount.tsx    # print shape, viewfinder, save status, carousel
│   │       ├── MediaViewer.tsx   # full-size photo / video on the public album
│   │       ├── ConfirmRemove.tsx # "Delete this photo?" — Yes / No
│   │       ├── playback.ts       # writer iPads: saved videos play in place, one at a time
│   │       ├── PhotoCorners.tsx
│   │       ├── WritingPage.tsx   # a page as the album shows it (saved PNG)
│   │       ├── WritingCanvas.tsx # the writer's page: canvas, tools, save
│   │       └── Gutter.tsx
│   │
│   └── lib/
│       ├── ids.ts                # {device}-{ULID} generation
│       ├── api.ts                # typed client for /api/*
│       ├── types.ts              # shared Entry / Media / Canvas types
│       ├── placeholder-album.ts  # Phase 2 only — deleted in Phase 3
│       ├── placeholder-ink.ts    # Phase 2 only — deleted in Phase 3
│       ├── queue/
│       │   ├── store.ts          # IndexedDB via idb
│       │   └── uploader.ts       # retry, backoff, resume
│       ├── capture/
│       │   ├── camera.ts         # getUserMedia, recorder type, permission
│       │   ├── photo.ts          # frame / file → resized photo + thumbnail
│       │   ├── video.ts          # MediaRecorder, 15s cap, poster frame
│       │   └── fallback.ts       # <input capture> path
│       └── canvas/
│           ├── strokes.ts        # perfect-freehand integration
│           ├── pointer.ts        # coalesced events, palm rejection, pressure
│           ├── drafts.ts         # the page in progress, in localStorage
│           └── export.ts         # 2x DPR PNG + stroke JSON
│
├── functions/                    # Cloudflare Pages Functions
│   ├── tsconfig.json             # Workers types, no DOM
│   ├── worker-runtime.d.ts       # generated: npx wrangler types functions/worker-runtime.d.ts --include-env=false
│   └── api/
│       ├── _middleware.ts        # deny by default: session on everything but 3 public routes
│       ├── auth/
│       │   ├── login.ts
│       │   ├── logout.ts
│       │   └── session.ts
│       ├── entries.ts
│       ├── media.ts              # commit
│       ├── media/[id].ts         # DELETE: take an item out of the album
│       ├── media/[id]/[part].ts  # stream one file to R2
│       ├── canvas.ts             # commit; latest strokes
│       ├── canvas/[id].ts        # stream the PNG to R2
│       ├── files/[[key]].ts      # public file serving, byte ranges
│       └── stats.ts
│
├── lib-server/                   # shared by Functions only — never bundled client-side
│   ├── env.ts                    # Env bindings + limits
│   ├── session.ts                # HMAC sign + verify (constant-time via subtle.verify)
│   ├── passphrase.ts             # PBKDF2 hash + constant-time verify
│   ├── bytes.ts                  # base64url, timingSafeEqual
│   ├── guard.ts                  # the handler-side session check
│   ├── http.ts                   # typed JSON responses and errors
│   ├── ids.ts                    # {device}-{ULID} validation, ULID time
│   ├── files.ts                  # R2 keys, size ceilings, file signatures
│   ├── upload.ts                 # stream to R2, then verify the bytes
│   ├── mp4.ts                    # a video's duration from its own header
│   └── db.ts                     # D1 queries — INSERT only
│
├── migrations/
│   ├── 0001_init.sql
│   └── 0002_media_removals.sql  # deleting a photo or video: hides, never erases
│
├── scripts/
│   ├── prepare-hero.mjs          # original photo → stripped, resized src/assets/hero/hero.jpg
│   ├── hash-passphrase.mjs       # generate WRITER_PASSPHRASE_HASH
│   └── export-archive.ts         # D1 + R2 → archive repo
│
├── tests/
│   ├── setup/                    # starts wrangler with throwaway secrets + a fresh DB
│   ├── helpers.ts
│   ├── auth.spec.ts              # authorization — the real security test
│   ├── concurrency.spec.ts       # two devices writing simultaneously
│   ├── uploads.spec.ts           # server-side upload validation
│   ├── session.spec.ts           # session + passphrase unit tests
│   ├── uploader.spec.ts          # queue rules: backoff, retry, resume
│   ├── mp4.spec.ts               # reading a video's duration from the file
│   ├── fixtures/                 # a 3-second recording from Chrome's fake camera
│   └── e2e/                      # Playwright, in the installed Chrome with a fake camera
│       ├── capture.spec.ts       # capture → saved → right spread; 15 s stop; playback
│       └── upload-failure.spec.ts # network death mid-upload, offline, browser closed
│
└── .github/
    └── workflows/
        └── archive.yml           # nightly export to the archive repo
```

---

## Boundaries that matter

**`src/` is client, `functions/` and `lib-server/` are server.** Nothing in `lib-server/` may ever be imported from `src/`. That is the line that keeps the signing key and passphrase hash out of the browser bundle. If you find yourself wanting to share a type across the line, put it in `src/lib/types.ts` — types erase at compile time, values do not.

**`src/components/` never hydrates.** Static Astro only — the cover. Anything needing state, events, or browser APIs belongs in `src/islands/`.

**The album lives in the island, not in Astro components.** Entries arrive at runtime from `/api/entries`, and a static build cannot render data it does not have, so the album is Preact. Astro pre-renders it to HTML at build time; on `/` it hydrates read-only, and only once scrolled into view (`client:visible`), so the cover itself loads with no island JavaScript. See `DECISIONS.md` D8.

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
