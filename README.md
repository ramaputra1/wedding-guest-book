# Wedding Guest Book

A digital wedding guest book. A full-screen landing page opens onto an album where photos, 15-second videos and Apple Pencil handwriting are captured on two iPads during the wedding, and viewed by anyone afterwards.

Built to be revisited for decades, not for a season.

---

## Status

Pre-build. The architecture is approved and documented; no application code exists yet.

Work proceeds phase by phase — see `docs/PHASES.md`.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Astro + TypeScript, one Preact island |
| Styling | Hand-written CSS with custom properties |
| Hosting | Cloudflare Pages |
| API | Cloudflare Pages Functions |
| Metadata | Cloudflare D1 (SQLite) |
| Media | Cloudflare R2 (object storage) |
| Handwriting | `perfect-freehand` |
| Archive | GitHub Actions → private repo with Git LFS |

Running cost: **$0** within free tiers. See `docs/DECISIONS.md` for why each piece was chosen.

---

## Routes

| Route | Purpose | Access |
|---|---|---|
| `/` | The unified album — every entry from both iPads, chronological | Public, read-only |
| `/ipad1` | Writer interface, device identity `ipad1` | Passphrase |
| `/ipad2` | Writer interface, device identity `ipad2` | Passphrase |

The two writer routes are guessable public URLs. They establish *which device is writing*, not *whether writing is allowed* — that is the signed session cookie's job, checked server-side on every write.

---

## Local development

```bash
npm install
npm run dev          # Astro dev server
npm run preview      # Wrangler — exercises Pages Functions, D1 and R2 locally
npm run build
```

Pages Functions, D1 and R2 do not run under `npm run dev`. Use `npm run preview` for anything touching the API.

Copy `.env.example` to `.dev.vars` and fill it in for local Function development. `.dev.vars` is git-ignored and must never be committed.

---

## Deployment

Pushing to `main` deploys via Cloudflare Pages. Branch pushes produce preview URLs with their own HTTPS, which is what camera and `MediaRecorder` require.

First-time Cloudflare setup — account, D1 database, R2 bucket, environment variables, billing alert — is in `docs/SETUP-CLOUDFLARE.md`.

---

## Documentation

| File | What it covers |
|---|---|
| `CLAUDE.md` | Operating rules for Claude Code. Read first. |
| `docs/ARCHITECTURE.md` | System design, data model, auth, capture, archive |
| `docs/DESIGN.md` | Design system — tokens, type, components, motion, copy |
| `docs/STRUCTURE.md` | Repository layout and what belongs where |
| `docs/PHASES.md` | The build plan and acceptance criteria per phase |
| `docs/TESTING.md` | What gets tested, how, and what only a real iPad can prove |
| `docs/DECISIONS.md` | Decisions made, options rejected, and why |
| `docs/SETUP-CLOUDFLARE.md` | One-time account and service setup |
| `docs/reports/` | Phase completion reports, written as each phase finishes |

---

## Workflow

Each phase is built on its own branch, reviewed, and merged into `dev-acceptance` before the next begins. `dev-acceptance` is tested on its preview URL and promoted to `main` (production) at milestones.

1. Owner creates a branch for the phase from `dev-acceptance`.
2. Claude Code builds only that phase's scope.
3. Claude Code writes `docs/reports/phase-<N>-<name>.md` with results and a `READY TO MERGE` / `NOT READY` verdict.
4. Owner reviews, commits, opens a PR into `dev-acceptance`, merges.
5. Repeat. At milestones, the owner opens a PR from `dev-acceptance` to `main`.

**Claude Code performs no git operations.** Branches, commits, PRs and merges are the owner's.
