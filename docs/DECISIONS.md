# Decisions

Why the stack looks the way it does, and what was rejected. **Do not relitigate these.** If you think one is wrong, raise it with the owner and say why — don't quietly build something else.

Each entry records the options actually evaluated, because the rejected ones are the part that gets forgotten.

---

## D1 — Hosting: Cloudflare Pages

**Chosen:** Cloudflare Pages.

**Rejected — Netlify.** Its free plan is credit-based: 300 credits/month shared across deploys, bandwidth and compute, where a production deploy costs 15 credits regardless of build time and bandwidth costs 20 credits/GB. **When credits run out, free sites are paused and stop serving traffic.** For a photo-heavy wedding site shared with 150 guests, a traffic spike could take the site offline in exactly the week people are looking at it.

**Rejected — Vercel Hobby.** Workable (100 GB bandwidth, non-commercial use, which this is), but has its own overage pausing and no advantage over Cloudflare here.

**Why Cloudflare wins:** unlimited static bandwidth, no credit card required for Pages itself, 500 builds/month, and it sits in the same account as D1 and R2 — one dashboard, one deploy, one bill that stays at zero.

Because the site is a static Astro build, this is **reversible**. The same output deploys anywhere.

---

## D2 — Media storage: Cloudflare R2

**Chosen:** R2. 10 GB free with **free egress**, against a projected ~1.3 GB.

**Rejected — Supabase Storage.** Three independent disqualifiers: a 1 GB total ceiling, a **50 MB per-file limit** that a single minute-long video would exceed, and free projects that pause after 7 days of low activity. It would also have consumed the owner's last free Supabase project slot.

**Rejected — Firebase Storage.** No longer free. Since September 2024 provisioning a Cloud Storage bucket requires the pay-as-you-go Blaze plan; Spark projects get 402/403 errors from Storage entirely.

**Rejected — GitHub repository as the media store.** Fine for photos, wrong for video. Multi-gigabyte binary repos are what git is worst at, and GitHub caps individual files at 100 MB.

**Accepted cost:** R2 requires completing a subscription checkout, which means a payment method on file even though usage inside the allowance bills at $0. **The owner approved this.** Egress being free means guest traffic cannot generate a bill — stored bytes are the only meter that moves, and overage past 10 GB is ~$0.015/GB-month. A billing alert and an in-app storage gauge go in at Phase 3.

---

## D3 — Metadata: Cloudflare D1

**Chosen:** D1. 5 GB storage, 5M row reads/day, 100k row writes/day on the Workers free plan — orders of magnitude beyond what entry metadata needs. Same account as Pages and R2, bound directly into Functions with no credentials to manage.

**Rejected — Postgres anywhere.** Nothing here needs it, and every managed free Postgres either pauses or expires.

---

## D4 — No device-local storage as the system of record

The owner asked whether photos and videos could be saved directly on the iPad instead of online. **No**, for three independent reasons:

1. **Capacity.** A website in Safari cannot write to the Photos library or Files app. It gets browser storage, typically capped around **1 GB** on iOS. The project needs several times that.
2. **Eviction.** WebKit deletes script-writable storage — IndexedDB, LocalStorage, SessionStorage, Service Workers — **after seven days without user interaction**. This applies to every iOS browser, because they all use WebKit. Home Screen web apps are exempt, but irreplaceable wedding memories should not rest on an exemption.
3. **It contradicts the requirements.** If iPad 1 writes locally, that data cannot appear on iPad 2 or for online visitors. The brief requires one unified album across both devices plus public viewing. **Device-local storage and a shared online album are mutually exclusive.**

**What the owner actually wanted — ownership — is delivered by the archive**, not the live store. After the wedding, one export puts every original file on their own drive as plain, playable files. The cloud is the delivery mechanism for the day; it becomes disposable once the export is verified.

**Local storage still has a job:** the IndexedDB queue holds every capture until upload is confirmed, so a wifi failure loses nothing. Transit buffer, never store of record.

---

## D5 — Video capped at 15 seconds, 720p, H.264

**The problem:** iPad video runs ~60 MB/minute at 1080p HEVC, ~130 MB at H.264, ~170 MB at 4K. One minute of video costs more than a hundred photos. Uncapped video breaks any free tier.

**The fix is a product decision, not an engineering one.** A guest book video is a greeting, not a film. 15 seconds at 720p is ~5 MB, so 150 videos fit in ~750 MB.

**Recorded in-page with `MediaRecorder`, not the native camera.** Handing off to `<input type="file" accept="video/*" capture>` yields more efficient HEVC, but HEVC does not play reliably in Chrome or Firefox on desktop — guests on other browsers would see a blank player. Recording H.264 avoids a post-wedding transcoding chore entirely. Native capture stays as the automatic fallback.

---

## D6 — Auth: passphrase → signed HttpOnly cookie

**Chosen:** a passphrase exchanged for an HMAC-SHA256-signed, HttpOnly session cookie, verified server-side in Pages Function middleware.

**Rejected — Supabase Auth.** Was the recommendation while Supabase was in the stack; removed with it. It would have been the audited option.

**Rejected — any conventional registration flow.** Explicitly excluded by the brief.

**Rejected — a passphrase checked client-side.** Would be readable in view-source. Not an option at any price.

**Known trade, accepted:** this is hand-rolled rather than off-the-shelf, which was flagged to the owner. Mitigating factors: it is a small, well-trodden pattern; the secret never reaches the browser; endpoints are tested directly with forged, missing and expired cookies; and the blast radius of a bug is a stranger adding a drawing, which is deletable and recoverable from the archive.

**Revocation** is rotating `SESSION_SIGNING_KEY`, which kills every session on both iPads at once.

---

## D7 — Two iPads: separate routes, one database

`/ipad1` and `/ipad2` write to the same D1 database and R2 bucket. The data is never split.

**Collision safety is structural, not probabilistic.** IDs are generated on-device as `{device_id}-{ULID}`. Every write is an `INSERT`; nothing updates a shared counter, index row, or position field. Two devices writing in the same millisecond touch disjoint rows and disjoint R2 keys, so no locking exists anywhere in the system.

**The routes are identity, not authorization.** They are guessable and treated as public. The URL decides which device label a write carries; the cookie decides whether the write happens.

---

## D8 — Framework: Astro + one Preact island

**Chosen:** Astro + TypeScript. The landing page ships as static HTML with no JavaScript; only the writer surface hydrates. Output is portable static files, which serves the decades-long requirement.

**Preact over React** for the island — same API, a fraction of the bytes, and only one island exists.

**Rejected — Next.js.** Heavier, and its advantages are for applications this is not.

**Rejected — plain Vite + React.** Would ship JavaScript to visitors who only need to look at photographs.

---

## D9 — Hand-written CSS, no Tailwind

The design is a bespoke album aesthetic — photo corners, a gutter seam, two paper temperatures. That is easier to express in real CSS than in utility classes, and it removes a build dependency that may not `npm install` cleanly in five years.

**Rejected — Tailwind, and every CSS or component framework.** Also rejected: any animation library. The site has one orchestrated motion; it does not need a runtime for that.

---

## D10 — Archive: separate private repo with Git LFS

The live data is Cloudflare's; **the archive is the owner's**. A nightly GitHub Action exports D1 and R2 into a private repository as `manifest.json`, plain media files, and a self-contained `viewer.html` that opens the whole album by double-clicking — no server, no npm, no internet.

Three properties make it a real backup: it is **versioned** (git history recovers accidental deletions), **independent** (different vendor from the live data), and **server-free** (it outlives every service in this document).

Media uses **Git LFS** because the archive trends toward ~1.3 GB. It lives in a **separate repository** from the application so either can be deleted or moved without the other.

---

## D11 — Dependencies capped at four

`preact`, `perfect-freehand`, `ulid`, `idb`. All MIT, all small.

A fifth requires asking the owner. The reasoning is longevity: every dependency is a thing that can fail to install in 2036. The archive's `viewer.html` has **zero** dependencies for exactly this reason.

---

## D12 — Design direction: black-leaf photo album

Archival albums use dense black card stock with prints held by gummed photo corners. That material fact supplies the structure, the selection state, and the personality. The reference wireframe's black ground already pointed there.

**Deliberately rejected:** the cream-and-terracotta palette with a high-contrast display serif, which is the AI-generated wedding-site default; and Cormorant/Playfair, which are the wedding typography reflex. Spectral was chosen instead for its italic and its screen-first design.

Full system in `docs/DESIGN.md`.

---

## D13 — No Astro server adapter

**Chosen:** Astro builds a fully static site (`output: 'static'`, no adapter). Cloudflare Pages serves `dist/`, and Pages Functions in `functions/` serve `/api/*`. `npm run preview` runs both through `wrangler pages dev`.

**Rejected — `@astrojs/cloudflare`.** Tested in Phase 0, not assumed. v13+ targets Cloudflare *Workers* only; against a Pages `wrangler.toml` its build fails (`The name 'ASSETS' is reserved in Pages projects`) and it enables KV-session and Images bindings by default. v12 supports Pages but emits `dist/_worker.js`, which switches Pages into "advanced mode" and **silently ignores the `functions/` directory** — the whole API.

**What it costs:** nothing the plan uses. All server logic was already in `functions/` and `lib-server/`. `/ipad1` and `/ipad2` are static pages with the device id fixed at build time, which is correct — the route is identity, not authorization.

**Do not "fix" this by adding the adapter back.** If server-rendered Astro pages are ever needed, raise it with the owner first.

---

## D14 — Branch flow through `dev-acceptance`

**Chosen:** each phase branch merges into `dev-acceptance`; `dev-acceptance` is promoted to `main` (production) at milestones.

**Why:** `main` stays identical to production; `dev-acceptance` has a stable HTTPS preview URL for iPad testing; preview deployments can use separate test storage so test entries never reach the real album; migrations run on test data before production.

**Rule:** each phase still gets its own PR and report — phases are never batched into one merge.

---

## Still open

Nothing architectural. Outstanding items are content — names, date, hero photograph, domain — tracked in `docs/PHASES.md` under Phase 1.
