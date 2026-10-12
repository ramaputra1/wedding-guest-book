# CLAUDE.md

Operating rules for Claude Code on this repository. Read this before doing anything.

---

## What this is

A wedding guest book website. A full-screen landing page, then an interactive album where two iPads capture photos and 15-second videos and write handwritten messages with Apple Pencil. The public can view; only the two iPads can write.

This is a **keepsake, not a product**. It is used hard for one day and then revisited for decades. When a trade-off appears between cleverness and durability, choose durability.

Full context lives in `docs/`. Read `docs/ARCHITECTURE.md` and `docs/PHASES.md` before writing code. Read `docs/DESIGN.md` before writing any CSS or markup.

---

## Git policy — this is absolute

**You do not touch git. The repository owner does all of it.**

| Allowed | Forbidden |
|---|---|
| `git status`, `git diff`, `git log` (to report state) | `git commit` |
| Reading any file | `git add` |
| Creating, editing, deleting working-tree files | `git push`, `git pull`, `git fetch` |
| | `git branch`, `git checkout`, `git switch` |
| | `git merge`, `git rebase`, `git reset`, `git stash` |
| | Creating pull requests, using `gh` |

If you believe a commit should happen, **say so and stop**. Do not do it. The owner creates the branch, reviews, commits, and opens the PR. You will often be working in a branch the owner has already checked out — leave it exactly as you found it except for the file changes you were asked to make.

Never add co-author trailers, never amend history, never create `.gitignore` entries to hide your own output.

---

## Phase discipline

Work proceeds one phase at a time. The phases, their scope and their acceptance criteria are in `docs/PHASES.md`.

**Rules:**

1. **Work only on the current phase.** If you notice something belonging to a later phase, write it down in the phase report under "Deferred" — do not build it.
2. **Do not start the next phase.** When a phase is complete, stop and wait.
3. **Every phase ends with a report.** Copy `docs/templates/PHASE-REPORT.md` to `docs/reports/phase-<N>-<name>.md` and fill it in completely.
4. **The report must end in a verdict:** `READY TO MERGE` or `NOT READY`. Be honest. A `NOT READY` with a clear blocker list is far more useful than an optimistic `READY` that wastes a review cycle.
5. **Never mark an acceptance criterion as passed if you did not actually verify it.** "Should work" is not verification. If something cannot be tested in your environment — Apple Pencil pressure, real camera permissions, venue wifi — mark it `NEEDS DEVICE TEST` and say exactly what the owner must check.

After the report, say in one line what the owner should do next, then stop.

---

## Hard constraints

These came from the approved plan. Do not relitigate them; `docs/DECISIONS.md` records why each was chosen and what was rejected.

**Budget is $0.** Do not add any paid service. Do not add a dependency that requires an account, an API key to a third party, or a credit card beyond the Cloudflare one already approved.

**The stack is fixed:**

- Astro + TypeScript, deployed to **Cloudflare Pages**
- **Cloudflare D1** for metadata, **Cloudflare R2** for media
- **Cloudflare Pages Functions** for the API
- Hand-written CSS with custom properties

**Do not introduce:** Supabase, Firebase, any other backend-as-a-service, Tailwind, any CSS framework, any UI component library, any animation library, any state-management library, any ORM.

**Runtime dependencies are capped at these four:**

| Package | Purpose |
|---|---|
| `preact` | The one interactive island |
| `perfect-freehand` | Pressure-sensitive ink strokes |
| `ulid` | Time-sortable, collision-free IDs |
| `idb` | IndexedDB wrapper for the offline queue |

Adding a fifth requires asking the owner first and justifying it. Build-time tooling (`astro`, `@astrojs/preact`, `sharp`, `typescript`, `wrangler`, `vitest`, `@playwright/test`) is not capped but should stay minimal. **Do not add an Astro server adapter** (`@astrojs/cloudflare` or any other): it makes Cloudflare Pages ignore `functions/`. See `docs/DECISIONS.md` D13.

---

## Security rules

These are not style preferences. Breaking one is a defect regardless of whether tests pass.

1. **No secrets in client code, ever.** The passphrase hash and the session signing key live only in Cloudflare environment variables, read only inside Pages Functions. If a value would appear in the browser's view-source, it is not a secret.
2. **`/ipad1` and `/ipad2` are identity, not authorization.** They are guessable public URLs. The route tells you *which device is writing*; the signed session cookie tells you *whether writing is permitted*. Never grant a permission based on the URL, a query parameter, a request body field, or any client-supplied device id.
3. **Every write endpoint verifies the session cookie before touching D1 or R2.** No exceptions, including endpoints you think are harmless. Hiding a button in the UI is cosmetic and proves nothing.
4. **The session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`**, signed with HMAC-SHA256 via Web Crypto. Client JavaScript must never be able to read it.
5. **Use constant-time comparison** when verifying signatures and passphrase hashes.
6. **Validate uploads server-side**: content type, byte size, and duration ceiling. Never trust what the client claims a file is.
7. If you are unsure whether something is a security boundary, treat it as one and say so in the phase report.

---

## Data integrity rules

The whole point of this project is that nothing is ever lost.

1. **Never overwrite.** Saving a canvas writes a **new version row**. Adding media inserts a **new row**. Nothing updates a shared index, counter, or position field — that is what makes two iPads writing simultaneously safe.
2. **IDs are generated on the device** as `{device_id}-{ULID}`, e.g. `ipad1-01JA2BX7F3K9XYZ`. Never generate an ID server-side; never use an auto-increment integer.
3. **A capture is not "saved" until both the R2 object and the D1 row are confirmed.** Until then the UI says "Saving…" and the blob stays in the IndexedDB queue. Only after confirmation is the local copy released.
4. **Destructive operations need a confirmation step** and must be recoverable from the archive.
5. Never write a migration that drops or rewrites a column holding real data without saying so loudly in the report.

---

## Design rules

`docs/DESIGN.md` is the authority. Follow it.

- **Use only the tokens defined there.** Do not invent colors, fonts, spacing values, or radii. If you need something the system lacks, propose adding it to `DESIGN.md` rather than hard-coding a one-off.
- `--brass` is for **state only** — selection, active, confirmation. Never decoration.
- **No gradients, no glassmorphism, no blur backdrops, no decorative shadows.**
- Do not give everything the same border-radius. The system differentiates on purpose.
- **Motion:** one orchestrated moment (the cover lift). Otherwise motion only confirms a user action. Nothing animates near the canvas while a pointer is down. Honour `prefers-reduced-motion`.
- **Copy:** sentence case, active voice, no filler, no apologies. Errors say what happened and what to do.

Accessibility floor, non-negotiable: visible keyboard focus on every interactive element, touch targets at least 44×44 CSS px, all controls labelled, contrast at AA.

---

## Code conventions

- TypeScript everywhere. `strict: true`. No `any` without a comment explaining why.
- Astro components for anything static. The one Preact island renders the album: read-only on `/`, hydrated only when scrolled into view (`client:visible`); with writer controls on `/ipad1` and `/ipad2`. The cover stays static — never hydrate it.
- CSS lives in `src/styles/`, organised as tokens → base → components. Use custom properties, logical properties (`padding-inline`), and `clamp()` for fluid type.
- Keep functions small and named for what they do. Prefer clarity over brevity.
- Comment **why**, not what. A comment explaining a Safari workaround is valuable; a comment restating the line above is noise.
- Every Pages Function returns typed JSON and a correct status code. Errors return a machine-readable `code` and a human-readable `message`.

---

## iPad and Safari specifics

These bite, and they are easy to get wrong:

- **`touch-action: none`** on the canvas or the page scrolls while writing. This is the single most common cause of a broken stylus experience.
- **Use `getCoalescedEvents()`** with a feature check. Safari dispatches `pointermove` at frame rate and Apple Pencil strokes come out visibly segmented without it. iOS Safari has had a bug returning the wrong `pointerId` on coalesced events — key off the parent event.
- **Palm rejection:** once a `pointerType === 'pen'` event is seen, ignore `touch` for drawing.
- **Back the canvas at 2× device pixel ratio** or saved PNGs are soft.
- **Camera and `MediaRecorder` need a secure context** (HTTPS). Cloudflare Pages provides it, including on preview URLs.
- **Record video as H.264 MP4 at 720p.** Do not hand off to the native camera for video — it produces HEVC, which does not play reliably in Chrome or Firefox on desktop.
- **Browser storage is capped around 1 GB on iOS** and WebKit deletes it after seven days without interaction. The IndexedDB queue is a transit buffer, never a store of record.

---

## When to stop and ask

Stop and ask the owner rather than guessing when:

- A requirement in `docs/` contradicts another, or contradicts something the owner said
- A hard constraint above would need to be broken to proceed
- A change would alter the database schema after Phase 3 has been merged
- Anything touching money, billing, or the Cloudflare account's plan
- You would need a fifth runtime dependency
- An acceptance criterion is ambiguous enough that two reasonable people would test it differently

Asking costs a message. Guessing wrong costs a phase.
