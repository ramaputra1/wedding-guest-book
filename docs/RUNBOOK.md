# Runbook

What to do when something needs doing — written to be followed step by step, on a bad day, without reading anything else first.

Every command runs in a terminal **in the application folder** (`wedding-guest-book`) unless it says otherwise. Commands that change something say so in **bold**.

| Situation | Go to |
|---|---|
| Setting up the nightly archive (once) | [1](#1-set-up-the-archive-once) |
| "Did last night's archive run?" | [2](#2-check-the-archive-ran) |
| Looking at the album offline | [3](#3-open-the-album-offline) |
| A guest pressed Delete by mistake | [4](#4-bring-back-a-deleted-photo-or-video) |
| One photo, video or page image is gone | [5](#5-a-file-is-missing) |
| A whole spread is gone | [6](#6-a-spread-is-gone) |
| Everything is gone, or a new Cloudflare account | [7](#7-restore-everything) |
| An iPad is lost or stolen | [8](#8-an-ipad-is-lost) |
| Changing the passphrase | [9](#9-change-the-passphrase) |
| A token or key expires, or may have leaked | [10](#10-rotate-a-secret) |
| "Are we about to be charged?" | [11](#11-check-usage-and-billing) |
| Wrangler says error 7403 / not authorized | [12](#12-wrangler-cannot-reach-the-account) |

**Two databases, two buckets.**

| Album | Database | Bucket |
|---|---|---|
| The real one (`main`) | `wedding-guestbook` | `wedding-media` |
| Test (`dev-acceptance` and every other branch) | `wedding-guestbook-test` | `wedding-media-test` |

In the commands below:
- `--target production` means the real album.
- `--target test` means the test album.
- For `wrangler d1 …` commands, the test album also needs `--env preview`.

---

## 1. Set up the archive (once)

The nightly job copies the album into a **private** GitHub repository. It needs four things. Doing this takes about 15 minutes.

**a. Create the archive repository**

1. Open https://github.com/new.
2. Repository name: `wedding-guest-book-archive`. Choose **Private**.
3. Leave "Add a README" **unticked**: the repository must start empty.
4. Click **Create repository**.

Git LFS (large files) is on by default for GitHub repositories. Nothing to switch on.

**b. A token that can write only to that repository**

1. Go to https://github.com/settings/personal-access-tokens/new (GitHub → your picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**).
2. Fill in the form:
   - **Token name:** `guest book archive`
   - **Expiration:** the longest offered. Write the date in your calendar; see [10](#10-rotate-a-secret).
   - **Repository access:** **Only select repositories** → `wedding-guest-book-archive`.
   - **Permissions → Repository permissions → Contents:** **Read and write**. Leave everything else as it is.
3. Click **Generate token** and copy it. You will paste it once, in step d.

**c. A read-only Cloudflare token**

1. Go to https://dash.cloudflare.com/profile/api-tokens and click **Create Token**.
2. Next to **Create Custom Token**, click **Get started**.
3. **Token name:** `guest book archive (read only)`.
4. **Permissions** — add exactly these two rows:
   - **Account** · **D1** · **Read**
   - **Account** · **Workers R2 Storage** · **Read**
5. **Account Resources:** **Include** · your account.
6. Click **Continue to summary**, then **Create Token**, and copy the token.
7. Find your **Account ID**: in the dashboard, open **Workers & Pages**; it is shown on the right. Or run `npx wrangler whoami`.

A read-only token means the nightly job can never change or delete the album, even if the token were stolen.

**d. Give them to the application's repository**

On GitHub, open the **application** repository (`wedding-guest-book`) → **Settings** → **Secrets and variables** → **Actions**.

- **Secrets** tab → **New repository secret**, three times:
  - `ARCHIVE_TOKEN` = the GitHub token from b
  - `CLOUDFLARE_API_TOKEN` = the Cloudflare token from c
  - `CLOUDFLARE_ACCOUNT_ID` = the Account ID from c
- **Variables** tab → **New repository variable**:
  - `ARCHIVE_REPO` = `your-github-name/wedding-guest-book-archive`

**e. First run**

The workflow can only be started by hand once `.github/workflows/archive.yml` is on `main`.

1. Open the application repository → **Actions** → **Archive** (left) → **Run workflow**.
2. Choose **test** for a first try, then click **Run workflow**.
3. Wait for a green tick (a few minutes).
4. Run it again with **production**.
5. Open the archive repository:
   - A `test` branch and a `main` branch now exist.
   - Each holds `viewer.html`, `manifest.json`, `photos/`, `videos/` and the rest.
   - A photo's page on GitHub says **"Stored with Git LFS"**.

From then on it runs **every night at 02:23 (Jakarta time)** on the real album.

---

## 2. Check the archive ran

1. Open the application repository → **Actions** → **Archive**.
2. Last night's run should have a **green tick**.

**If it is red,** open the run and read the step that failed:

| Step | Meaning | Fix |
|---|---|---|
| Check the setup | A secret or the variable is missing | Section 1d |
| Export, with "MISSING from storage" | The database names a file R2 does not have | Run the export by hand (below) to see which, then section 5. The archive keeps every file it already had |
| Export, with "authentication" or "7403" | The Cloudflare token expired or lost a permission | Section 10 |
| Get the archive, with "Authentication failed" | The GitHub token expired | Section 10 |
| Commit and push, with "not in Git LFS" | A media file went into git directly | Tell Claude; do not delete anything |

Running the export by hand, on your machine, writes into a folder and changes nothing in Cloudflare:

```bash
npx wrangler login                                   # once, if asked
node --experimental-strip-types scripts/export-archive.ts --target production --out ../archive-check
```

The last lines say how many files were downloaded, and whether the manifest is valid.

---

## 3. Open the album offline

On a computer with Git:

1. Install Git LFS once: https://git-lfs.com, then run `git lfs install`.
2. Get the archive, in a terminal, in the folder where you want it (an external drive is ideal):
   ```bash
   git clone https://github.com/your-github-name/wedding-guest-book-archive.git
   cd wedding-guest-book-archive
   git lfs pull
   ```
3. Double-click **`viewer.html`**. No internet is needed.

The photos, videos and handwritten pages are ordinary files in the folders beside it. Photos deleted on the day are hidden; a button at the bottom shows them.

To update the copy later: `git pull` then `git lfs pull`, in that folder.

---

## 4. Bring back a deleted photo or video

Delete never erases anything. It only hides the item.

1. Open https://dash.cloudflare.com → **Storage & Databases** → **D1** → **`wedding-guestbook`** → **Console**.
2. Paste this and click **Run**. It lists what was deleted, newest first:
   ```sql
   SELECT r.media_id, datetime(r.removed_at/1000,'unixepoch') AS removed_utc, m.kind, '/api/files/' || m.r2_key AS file
   FROM media_removals r JOIN media m ON m.id = r.media_id ORDER BY r.removed_at DESC
   ```
3. To see an item, open your site's address followed by its `file` value, e.g. `https://your-site/api/files/photos/…`.
4. **To bring one back,** paste this with its `media_id` and click **Run**:
   ```sql
   DELETE FROM media_removals WHERE media_id = 'ipad1-01K…'
   ```

It reappears after the iPad reloads, and online within 30 seconds.

---

## 5. A file is missing

Use this when a photo shows as broken or the export reports "MISSING from storage".

1. Get the archive with its files (section 3; `git lfs pull` is required).
2. Find the item's id: it is the file name without its extension, e.g. `ipad1-01K…`.
3. See what would happen. Nothing changes:
   ```bash
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --media ipad1-01K…
   ```
4. If it lists the file under "files: … to upload", **do it:**
   ```bash
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --media ipad1-01K… --apply --production
   ```

It ends with "Restored. Checked again: nothing in scope is missing."

For a handwritten page's image, use `--entry` with the spread's id instead (the folder name inside `canvases/`).

---

## 6. A spread is gone

1. Get the archive (section 3).
2. Pick a night from **before** it went: in the archive folder,
   ```bash
   git log --oneline              # one line per night, newest first
   git checkout <the commit from the night before>
   git lfs pull
   ```
3. Find the spread's id: open `manifest.json` and search for a date or a file name. The entry `id` looks like `ipad2-01K…`.
4. Dry run, then **do it**:
   ```bash
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --entry ipad2-01K…
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --entry ipad2-01K… --apply --production
   ```
   The spread comes back with every photo, video and every version of its page. Items that were deleted on the day stay deleted.
5. Back in the archive folder, run `git checkout main` so tonight's job sees the normal state.

Restore only ever **adds what is missing**. It never changes or replaces anything that is there, so running it twice is harmless.

---

## 7. Restore everything

Use this when the Cloudflare data is gone, or when moving to a new Cloudflare account.

1. If it is a new account, follow `docs/SETUP-CLOUDFLARE.md` steps 2–7: create the databases and buckets, put their ids in `wrangler.toml`, add the secrets, and apply the migrations.
2. `npx wrangler login` as that account.
3. Get the archive with all its files (section 3).
4. Dry run, then **do it**. This takes a while; large albums can take an hour:
   ```bash
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --all
   node --experimental-strip-types scripts/restore-archive.ts --from ../wedding-guest-book-archive --target production --all --apply --production
   ```
   This brings back every entry, file, page version, deletion and saved look.
5. Open the site and check a few spreads.

**Without Cloudflare at all,** `viewer.html` in the archive is the album (section 3).

---

## 8. An iPad is lost

This signs out **both** iPads at once. Anyone holding the lost one can then do nothing.

1. In a terminal: `openssl rand -base64 32`. Copy the output.
2. Go to https://dash.cloudflare.com → **Workers & Pages** → the project → **Settings** → **Variables and Secrets**.
3. Edit **`SESSION_SIGNING_KEY`** under **Production**, paste the new value, and save.
4. **Deployments** → the latest **Production** deployment → **⋯** → **Retry deployment**. New values apply from the next deployment.
5. Sign the remaining iPad in again with the passphrase.

Also change the passphrase (section 9) if the lost iPad could have it saved.

---

## 9. Change the passphrase

1. In a terminal: `node scripts/hash-passphrase.mjs`. Type the new passphrase twice; it is not shown. Copy the hash it prints.
2. Cloudflare → **Workers & Pages** → the project → **Settings** → **Variables and Secrets** → edit **`WRITER_PASSPHRASE_HASH`**. Do it for **Production**, and for **Preview** if you want the test site changed too.
3. **Retry** the latest deployment, as in 8.4.

iPads that are already signed in **stay signed in**. To make them sign in again with the new passphrase, also do section 8.

Never send the passphrase or its hash to anyone, Claude included.

---

## 10. Rotate a secret

| Secret | Where it lives | Make a new one | Then |
|---|---|---|---|
| `SESSION_SIGNING_KEY` | Cloudflare, Production and Preview | `openssl rand -base64 32` | Retry deployment; iPads sign in again |
| `WRITER_PASSPHRASE_HASH` | Cloudflare | Section 9 | Retry deployment |
| `ARCHIVE_TOKEN` | GitHub → app repo → Settings → Secrets → Actions | Section 1b, or **Regenerate** on the token's page | Update the secret; run the Archive workflow by hand to check |
| `CLOUDFLARE_API_TOKEN` | the same place | Cloudflare → My Profile → API Tokens → the token → **Roll** | Update the secret; run the Archive workflow by hand |

The GitHub token expires on the date you chose in 1b. The night after, the archive run turns red with an authentication error; rotating fixes it.

---

## 11. Check usage and billing

The plan is **$0**. These pages show how close to a limit things are.

| What | Where | Free limit |
|---|---|---|
| Photos and videos stored | Cloudflare → **R2** → the bucket → **Metrics** (the iPads' rail gauge shows the same) | 10 GB |
| Database | Cloudflare → **D1** → the database → **Metrics** | 5 GB, 5 million reads a day |
| Site requests | Cloudflare → **Workers & Pages** → the project → **Metrics** | 100,000 a day |
| Cloudflare alerts | Cloudflare → **Notifications** (set up in Phase 3) | — |
| Archive storage | GitHub → your picture → **Settings** → **Billing and licensing** → **Usage** → Git LFS | 10 GiB stored, 10 GiB downloaded a month |

**GitHub never charges by surprise.** With the default $0 budget for Git LFS it blocks uploads for the rest of the month instead. Check **Settings → Billing and licensing → Budgets and alerts** shows Git LFS at **$0**.

**Cloudflare past 10 GB of R2** costs about $0.015 per GB per month. The album is expected to be about 1.3 GB.

---

## 12. Wrangler cannot reach the account

If a `wrangler` command fails with `7403` or "not authorized", it is signed in as a different account, or with a token that lacks access.

```bash
npx wrangler whoami         # which account it is using
unset CLOUDFLARE_API_TOKEN  # if it says it is using an API token
npx wrangler logout
npx wrangler login          # choose the account the guest book lives in
```

Then run the command again.
