# Cloudflare Setup

One-time account and service setup. **The owner does this**, not Claude Code — it involves an account, a payment method, and secrets.

Do this before Phase 3. Phases 0–2 need none of it.

Allow about 30 minutes.

---

## 1. Account

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) if you don't have an account.
2. You do **not** need to transfer a domain. Cloudflare Pages gives you a `*.pages.dev` address that works over HTTPS, which is all the camera and `MediaRecorder` require.

---

## 2. Create the Pages project

1. **Workers & Pages → Create → Pages → Connect to Git.**
2. Authorise GitHub and pick this repository.
3. Build settings:

   | Field | Value |
   |---|---|
   | Framework preset | Astro |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | Set by `.node-version` in the repo (24.x LTS) — leave the dashboard field empty |

4. Save and deploy. The first build may fail if the project is still empty — that's expected before Phase 0 is merged.

Branch pushes automatically get preview URLs with their own HTTPS. Use those for iPad testing — you do not need to merge to `main` to test on a device.

**Production branch is `main`.** `dev-acceptance` gets a stable preview address (`dev-acceptance.<project>.pages.dev`) — bookmark it on both iPads for testing. From Phase 3, preview deployments should use their own test D1 database and R2 bucket so test entries never touch the real album; Phase 3 sets this up.

---

## 3. Create the D1 databases — two of them

**Workers & Pages → D1 → Create database**, twice:

| Name | Used by |
|---|---|
| `wedding-guestbook` | Production — `main`, the real album |
| `wedding-guestbook-test` | Previews — `dev-acceptance` and every phase branch, so test entries never reach the real album (DECISIONS D14) |

After each, copy the **database ID** Cloudflare shows. An ID is not a secret. Put them in `wrangler.toml`, replacing the two placeholders marked `OWNER:` (or send them to Claude and it will).

Free plan: 5 GB storage, 5 million row reads/day, 100,000 row writes/day. This project will use single-digit megabytes.

---

## 4. Create the R2 buckets — two of them

**R2 → Create bucket**, twice: `wedding-media` (production) and `wedding-media-test` (previews). Location: automatic. The names must match `wrangler.toml` exactly.

**This is the step that asks for a payment method.** Cloudflare requires an R2 subscription, completed through a checkout flow, even though usage inside the free allowance bills at $0. You approved this.

What you're exposed to, precisely:

- **Egress is free.** Guest traffic cannot generate a bill no matter how many people browse.
- **Stored bytes are the only meter that moves.** Free allowance is 10 GB across all buckets; the project is projected at ~1.3 GB.
- Overage past 10 GB costs about **$0.015 per GB-month** — you'd need roughly eight times the planned volume before the first cent.

### Set a billing alert — do not skip this

**Manage Account → Billing → Notifications**, and add an alert for R2 storage. Set the threshold well below the free limit (5 GB) so it fires long before anything costs money.

---

## 5. Bindings come from `wrangler.toml`

The repo's `wrangler.toml` declares the bindings — `DB` and `MEDIA` for production at the top level, and their test twins under `[env.preview]` — and the plain settings (`SESSION_TTL_DAYS`, `MAX_*`) under `[vars]`. Cloudflare Pages reads that file on every deploy, so **there is nothing to bind in the dashboard**. If the dashboard shows the bindings as read-only or managed by the file, that is this.

Once the two IDs from §3 are in `wrangler.toml`, the next push deploys with real storage.

---

## 6. Generate and set the two secrets

### The signing key

```bash
openssl rand -base64 32
```

Run it twice: one key for Production, a different one for Preview.

### The passphrase hash

Choose a passphrase you'll type on each iPad once: **at least 16 characters**, ideally four or five ordinary words with spaces — long, strong, and easy on a touch keyboard. Store it in your password manager.

```bash
node scripts/hash-passphrase.mjs
```

It asks for the passphrase twice with the typing hidden, so it never lands in shell history or on screen, and prints only the hash. It refuses a passphrase given on the command line, and anything under 16 characters.

**Only the hash goes into Cloudflare.** Never commit the plaintext, never put it in a file, never send it to Claude.

### Set them

**Workers & Pages → your project → Settings → Variables and Secrets.** Add to **both Production and Preview**, type **Encrypted** (Secret):

| Variable | Value |
|---|---|
| `WRITER_PASSPHRASE_HASH` | output of the hash script (the same hash in both is fine) |
| `SESSION_SIGNING_KEY` | output of `openssl rand` — different for each environment |

Once encrypted you cannot read them back — that's the point. Keep your own copy in your password manager. The plain settings are already in `wrangler.toml`; do not add them here.

Without these two secrets the public album still loads, but signing in answers "Signing in isn't set up yet".

---

## 7. Apply the database schema

Once, from your machine, after `wrangler.toml` has the real IDs:

```bash
npx wrangler login                                                       # opens the browser
npx wrangler d1 migrations apply wedding-guestbook --remote              # production
npx wrangler d1 migrations apply wedding-guestbook-test --remote --env preview
```

Each should end with `0001_init.sql ✅`. Running them again is safe — applied migrations are skipped. Future phases add new numbered files; the same commands apply them.

### Local development

`npm run preview` serves the built site and the API against a local copy of D1 and R2 under `.wrangler/`:

```bash
npx wrangler d1 migrations apply wedding-guestbook --local
npm run build && npm run preview
```

For signing in locally, copy `.env.example` to `.dev.vars` and fill it with **local-only** values — a different signing key and a throwaway passphrase hash, never the production ones. `.dev.vars` is git-ignored, and Claude is blocked from reading it.

`npm test` needs none of this: it starts its own server with throwaway secrets and a fresh database each run.

`npm run dev` runs Astro alone — Functions, D1 and R2 do not exist there. Anything touching the API needs `npm run preview`.

---

## 8. Archive repository — before Phase 6

A **separate private repository**, not this one.

1. Create a private repo, e.g. `wedding-archive`.
2. Enable Git LFS on it.
3. Create a **fine-grained personal access token** scoped to that repository only, with **Contents: read & write**. Nothing else.
4. In *this* repository: **Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   |---|---|
   | `ARCHIVE_REPO` | `your-username/wedding-archive` |
   | `ARCHIVE_TOKEN` | the fine-grained token |

Keeping the archive in its own repository is deliberate: you can delete, move, or hand over either one without touching the other.

---

## Afterwards

| Task | Where |
|---|---|
| Revoke a lost iPad | Rotate `SESSION_SIGNING_KEY` — kills every session instantly |
| Check storage | R2 → bucket → metrics, or the in-app gauge |
| Check billing | Manage Account → Billing |
| Restore something | `docs/RUNBOOK.md`, written in Phase 6 |

---

## If something goes wrong

**Build fails with "binding not found":** the binding is missing from the Preview environment. They're configured separately from Production.

**Camera doesn't work on the iPad:** confirm you're on `https://`. `getUserMedia` requires a secure context; a preview URL qualifies, a raw IP does not.

**Functions return 500 locally:** you're probably on `npm run dev`. Use `npm run preview`.

**Migration says the table already exists:** it was applied before. Check with `npx wrangler d1 execute wedding-guestbook --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`.
