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

## 3. Create the D1 database

**Workers & Pages → D1 → Create database.**

- Name: `wedding-guestbook`
- Note the **database ID** shown after creation — it goes in `wrangler.toml`.

Free plan: 5 GB storage, 5 million row reads/day, 100,000 row writes/day. This project will use single-digit megabytes.

---

## 4. Create the R2 bucket

**R2 → Create bucket.**

- Name: `wedding-media`
- Location: automatic

**This is the step that asks for a payment method.** Cloudflare requires an R2 subscription, completed through a checkout flow, even though usage inside the free allowance bills at $0. You approved this.

What you're exposed to, precisely:

- **Egress is free.** Guest traffic cannot generate a bill no matter how many people browse.
- **Stored bytes are the only meter that moves.** Free allowance is 10 GB; the project is projected at ~1.3 GB.
- Overage past 10 GB costs about **$0.015 per GB-month** — you'd need roughly eight times the planned volume before the first cent.

### Set a billing alert — do not skip this

**Manage Account → Billing → Notifications**, and add an alert for R2 storage. Set the threshold well below the free limit (5 GB) so it fires long before anything costs money.

---

## 5. Bind D1 and R2 to the Pages project

**Workers & Pages → your project → Settings → Bindings.**

| Type | Variable name | Target |
|---|---|---|
| D1 database | `DB` | `wedding-guestbook` |
| R2 bucket | `MEDIA` | `wedding-media` |

The names matter — Functions read `env.DB` and `env.MEDIA`. Add the bindings to **both Production and Preview** environments, or preview deployments will fail at runtime in a way that looks like a code bug.

> **To be confirmed in Phase 3.** The repo contains a `wrangler.toml` with `pages_build_output_dir`. Cloudflare documents that such a file becomes the source of truth for bindings, which would make this dashboard step read-only. Phase 3 verifies this against the real account and rewrites this section.

---

## 6. Generate and set secrets

### The signing key

```bash
openssl rand -base64 32
```

### The passphrase hash

Choose a passphrase you'll type on each iPad once. Make it long rather than cryptic — you may need to type it on a touch keyboard under pressure. Store the plaintext in your password manager.

Then, once Phase 3 has produced the script:

```bash
node scripts/hash-passphrase.mjs "your chosen passphrase"
```

**Only the hash goes into Cloudflare.** Never commit the plaintext, never put it in a file, never send it to Claude.

### Set them

**Settings → Environment variables.** Add to **both Production and Preview**:

| Variable | Value | Type |
|---|---|---|
| `WRITER_PASSPHRASE_HASH` | output of the hash script | **Encrypted** |
| `SESSION_SIGNING_KEY` | output of `openssl rand` | **Encrypted** |
| `SESSION_TTL_DAYS` | `180` | Plaintext |
| `MAX_VIDEO_DURATION_MS` | `15000` | Plaintext |
| `MAX_VIDEO_BYTES` | `15000000` | Plaintext |
| `MAX_PHOTO_BYTES` | `8000000` | Plaintext |

Mark the first two **Encrypted**. Once encrypted you cannot read them back — that's the point. Keep your own copy in your password manager.

---

## 7. Local development

Copy `.env.example` to `.dev.vars` and fill in the same values. `.dev.vars` is git-ignored.

```bash
npx wrangler d1 execute wedding-guestbook --local --file=migrations/0001_init.sql
npm run preview
```

`npm run dev` runs Astro alone — Functions, D1 and R2 do not exist there. Anything touching the API needs `npm run preview`.

Apply migrations to production when Phase 3 merges:

```bash
npx wrangler d1 execute wedding-guestbook --remote --file=migrations/0001_init.sql
```

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
