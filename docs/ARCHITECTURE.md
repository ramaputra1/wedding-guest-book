# Architecture

The approved system design. `docs/DECISIONS.md` records why these choices were made and what was rejected.

---

## Shape of the thing

One scrolling page. A full-screen landing section, then an album of spreads. Two iPads write to it during the wedding; everyone else reads it forever.

```
                    ┌──────────────────────────┐
   Public  ───────► │   /  (static, cached)    │
   visitors         │   Astro → Cloudflare CDN │
                    └────────────┬─────────────┘
                                 │ reads
                    ┌────────────▼─────────────┐
   iPad 1 ────────► │  Pages Functions (API)   │
   /ipad1           │  session check on write  │
                    └──────┬────────────┬──────┘
   iPad 2 ────────►        │            │
   /ipad2            ┌─────▼─────┐ ┌────▼─────┐
                     │    D1     │ │    R2    │
                     │ metadata  │ │  media   │
                     └─────┬─────┘ └────┬─────┘
                           └──────┬─────┘
                        nightly   │ GitHub Action
                                  ▼
                     ┌────────────────────────┐
                     │  private archive repo  │
                     │  files + viewer.html   │
                     └────────────────────────┘
```

The album is the durable thing. Cloudflare is how it gets delivered this year; the archive is how it survives the decade.

---

## The album spread

The reference wireframe is **not** a photo grid beside a canvas. The cards are in paired rows, and each row is one entry: media on the left, the handwriting belonging to that media on the right, with a gutter between them. It is an open album spread.

```
┌──────────────────────┐  ┌──────────────────────────────┐  ┌───┐
│  media mount    (+)  │  │  handwriting page            │  │ ◯ │
│  ● ● ● ●             │  │                              │  │cam│
└──────────────────────┘  └──────────────────────────────┘  │rail
┌──────────────────────┐  ┌──────────────────────────────┐  │   │
│  media mount    (+)  │  │  handwriting page            │  │   │
└──────────────────────┘  └──────────────────────────────┘  └───┘
```

The numbers are a carousel — one mount holds up to six items; on the writer iPads a "+" after them aims the camera there. The far-right strip is a collapsible camera rail with a shutter.

---

## Routes

| Route | Renders | Access |
|---|---|---|
| `/` | Landing + album, all entries from both devices, chronological. The album is rendered in the browser by the Preact island from `GET /api/entries` (DECISIONS D8, D13) | Public, read-only |
| `/ipad1` | Album + writer controls, device identity `ipad1` | Passphrase |
| `/ipad2` | Album + writer controls, device identity `ipad2` | Passphrase |

`/ipad1` and `/ipad2` are **identity, not authorization**. They are guessable and must be treated as public knowledge. The route decides which device label a write carries; the signed cookie decides whether the write happens at all. A visitor who types `/ipad2` gets a passphrase prompt and nothing else.

---

## Data model

Metadata in D1, bytes in R2.

```sql
CREATE TABLE entries (
  id          TEXT PRIMARY KEY,   -- 'ipad1-01JA2BX7F3K9XYZ'
  device_id   TEXT NOT NULL,      -- 'ipad1' | 'ipad2'
  position    INTEGER,            -- advisory, for manual reordering later
  title       TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL    -- epoch ms
);

CREATE TABLE media (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES entries(id),
  kind        TEXT NOT NULL,      -- 'photo' | 'video'
  r2_key      TEXT NOT NULL,
  poster_key  TEXT,               -- first frame, videos only
  thumb_key   TEXT NOT NULL,
  width       INTEGER,
  height      INTEGER,
  duration_ms INTEGER,            -- videos only
  bytes       INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE canvases (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT NOT NULL REFERENCES entries(id),
  r2_key       TEXT NOT NULL,     -- flattened PNG at 2x DPR
  stroke_data  TEXT NOT NULL,     -- JSON vector strokes
  version      INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_entries_created ON entries(created_at);
CREATE INDEX idx_media_entry     ON media(entry_id, sort_order);
CREATE INDEX idx_canvases_entry  ON canvases(entry_id, version DESC);

-- migrations/0002_media_removals.sql (owner request after Phase 5)
CREATE TABLE media_removals (
  media_id    TEXT PRIMARY KEY REFERENCES media(id),
  device_id   TEXT NOT NULL,      -- which iPad removed it
  removed_at  INTEGER NOT NULL    -- epoch ms, server clock
);
```

### Three properties this model exists to guarantee

**Concurrent writes cannot collide.** Every write is an `INSERT` of a new row with a device-prefixed ULID. Nothing updates a shared counter, index row, or position field. Two iPads writing in the same millisecond touch entirely disjoint rows and R2 keys, so no locking is needed anywhere.

**Nothing is ever overwritten.** Saving a canvas inserts a new `version`, it does not update the previous one. An accidental "clear" is recoverable because the earlier version still exists. Display reads the highest version per entry.

**Deleting hides; it never erases.** Removing a photo or video (see "Removing a photo or video") inserts a row into `media_removals`. The media row and its files stay, so the album simply stops showing it, and the owner can bring it back.

**Drawings outlive their pixels.** `stroke_data` holds the vector strokes, not just the flattened PNG. The PNG is what visitors see; the strokes mean a drawing can be re-rendered at any resolution, edited, or rebuilt if the PNG is ever lost.

### ID format

`{device_id}-{ULID}` — for example `ipad1-01JA2BX7F3K9XYZ`.

Generated **on the device**, never server-side. A ULID carries a millisecond timestamp plus 80 bits of randomness, so IDs sort chronologically as strings. Because the device id is a prefix, cross-device collision is not merely improbable, it is structurally impossible.

### R2 key layout

```
photos/{entry_id}/{media_id}.jpg
videos/{entry_id}/{media_id}.mp4     # .mov only from the native-camera fallback
posters/{entry_id}/{media_id}.jpg
thumbs/{entry_id}/{media_id}.jpg
canvases/{entry_id}/{canvas_id}.png
```

Canvas PNGs are keyed by the canvas id, not `v{version}` as first drawn (DECISIONS D16): the version is assigned by the database at commit, after the PNG is stored, and two iPads saving one page at once would otherwise overwrite each other's file.

Keys are derivable from the database, and the database is reconstructable by listing the bucket. Either half can rebuild most of the other.

---

## API

All endpoints are Cloudflare Pages Functions under `functions/api/`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Passphrase → signed session cookie |
| `POST` | `/api/auth/logout` | session | Clear the cookie |
| `GET` | `/api/auth/session` | session | Whether this browser is signed in, and as which device (the cookie is HttpOnly, so the page cannot read it) |
| `GET` | `/api/entries` | — | List entries with media and latest canvas |
| `POST` | `/api/entries` | **session** | Create an entry |
| `PUT` | `/api/media/{id}/{original\|thumb\|poster}` | **session** | Stream one file of a media item into R2 |
| `POST` | `/api/media` | **session** | Commit a media item whose files are stored: writes its D1 row |
| `PUT` | `/api/canvas/{id}` | **session** | Stream a canvas version's PNG into R2 |
| `POST` | `/api/canvas` | **session** | Commit a canvas version: stroke JSON to D1, version number assigned |
| `GET` | `/api/canvas?entryId=` | **session** | The latest version's stroke JSON, so a writer can carry on writing on that page |
| `DELETE` | `/api/media/{id}` | **session** | Take a photo or video out of the album: a row in `media_removals`; nothing is erased |
| `GET` | `/api/stats` | **session** | Storage used, entry count — feeds the writer's gauge |
| `GET` | `/api/files/{r2 key}` | — | Serve a stored photo, video, poster, thumbnail or page; byte ranges for video |

**Deny by default.** `functions/api/_middleware.ts` refuses any request without a valid session unless it is one of the three public routes above, and refuses any write whose `Origin` is another site. Every write handler checks the session again before touching D1 or R2 — a handler is never the only lock, and the middleware is never the only lock either. The middleware sits in `functions/api/`, not `functions/`, so static pages never invoke a Function.

**Uploads are two steps** (DECISIONS D15): each file streams straight into R2, then a small JSON commit writes the D1 row — only after confirming every file is stored. A saved item's files can never be replaced.

Public reads of `/api/entries` are cached at Cloudflare's edge for 30 seconds (on a custom domain; `*.pages.dev` skips the edge cache), which keeps D1's daily read allowance safe however many guests browse. A signed-in iPad always reads fresh. Stored files are served `immutable`: a key, once committed, never changes.

---

## Authentication

A passphrase exchanged for a signed, HttpOnly session cookie.

1. The passphrase is stored server-side **as a hash** in an encrypted environment variable. The plaintext never exists in the repository or the browser.
2. `POST /api/auth/login` compares in constant time, then issues a cookie containing the device id and an expiry, signed with HMAC-SHA256 via Web Crypto.
3. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`. Page JavaScript cannot read it, so an XSS bug cannot exfiltrate the session.
4. Every mutating request is verified by middleware before reaching a handler.
5. The TTL is long — 180 days by default — so you sign in once per iPad and never during the wedding.

**Revoking a lost iPad:** rotate `SESSION_SIGNING_KEY` in the Cloudflare dashboard. Every session on both devices dies immediately; sign the remaining iPad back in. This is faster and more complete than per-device revocation, and it needs no database change.

**Known limitation, accepted:** anyone holding a signed-in iPad can write. There is no second factor. For a wedding guest book this is the right trade, but it is a trade.

---

## Capture

The rail carries a **Photo / Video mode toggle**; the shutter changes behaviour to match.

| Mode | Shutter | Output |
|---|---|---|
| Photo | Tap → 3 s or 5 s self-timer → shot (tap again to cancel) | JPEG, long edge ≤ 2560px, quality ~0.85, ≈1 MB |
| Video | Tap to start, tap to stop, auto-stops at 15s | H.264 MP4, 720p, ≈5 MB |

**Video records in-page with `MediaRecorder` at 720p.** Handing off to the native iOS camera would produce HEVC, which does not play reliably in Chrome or Firefox on desktop — guests on other browsers would get a blank player. Recording H.264 avoids a post-wedding transcoding chore entirely. Native capture via `<input type="file" accept="video/*" capture>` remains the automatic fallback if `MediaRecorder` is unavailable or permission is denied.

A **poster frame** is extracted client-side from the first frame — or a moment later if the first is black — so the grid shows a real still rather than a black rectangle. A thumbnail (long edge 640 px, ~40–50 KB) is generated for every item; the album grid loads thumbnails only and fetches full media on tap.

**The fallback's video is kept as it comes.** iOS's camera app records QuickTime (`.mov`, often HEVC). It is accepted and stored as `.mov` rather than refused, so a guest's video is never lost when the camera permission was denied — even though desktop Chrome or Firefox may not play HEVC (DECISIONS D17). The in-page recorder always produces H.264 MP4.

**The 15-second cap is checked on the file.** At commit the server reads the duration from the video's own header (`mvhd`, or `mehd` in a fragmented file) with a few small range reads; when the file states one, it overrules what the iPad claimed.

**The viewfinder is the destination mount** (DECISIONS D18). The camera is on only while a spread's "+" is pressed, the rail is open, the iPad is signed in and the page is visible. It is shown unmirrored, as it is saved. The six-item limit per spread is enforced by the writer's interface (no "+" on a full spread), not refused by the server: a capture already on its way is never thrown away.

### Nothing is lost

A capture is not "saved" until storage confirms it. The sequence:

1. Capture → write the blob to **IndexedDB immediately**; the slot shows **"Saving…"**.
2. Upload to R2 through the Function. Large files upload in chunks with resume.
3. On failure: retry with exponential backoff, then mark **"Not saved — tap to retry"**. The blob stays queued.
4. Only when **both** the R2 object and the D1 row are confirmed does the slot read **"Saved"** and the local copy get released.
5. Queued items retry automatically when connectivity returns.

**Queue sizing caveat.** The IndexedDB queue shares the ~1 GB iOS browser budget. At 5 MB a video, a total wifi failure would take roughly 150–200 queued clips to fill it. The writer UI shows queue depth and a storage warning when pending uploads build up, so the problem surfaces during the wedding rather than after it.

---

## Removing a photo or video

Owner request after Phase 5. On a writer iPad every saved photo or video on show has **Delete** just above its top right. It asks "Delete this photo?", and **Yes** takes the item out of the album on both iPads and the public site. The public copy is cached, so it may take up to 30 s to disappear there. Either iPad may delete any item.

**Nothing is erased.** `DELETE /api/media/{id}` (session required) inserts one row into `media_removals`. The `media` row and its files in R2 stay:

- `GET /api/entries` leaves removed items out.
- `/api/stats` counts album items without them, but bytes still include their files.
- The archive (Phase 6) must carry `media_removals` too.

A deleted item's file URL keeps working for anyone who already has it, because the file is kept. The URLs are long random ids, not guessable.

The album query falls back to showing everything if migration 0002 has not been applied yet. Code deployed before the migration therefore never breaks the album; deleting fails until the migration is in, and says so: the server answers `503 migration_missing`, and the iPad shows that message rather than "check the wifi".

**Bringing an item back** (owner, from a terminal):

```bash
# What was deleted, newest first:
npx wrangler d1 execute wedding-guestbook --remote --command \
  "SELECT r.media_id, r.device_id, datetime(r.removed_at/1000,'unixepoch') AS removed, m.kind, m.entry_id,
          '/api/files/' || m.r2_key AS file
   FROM media_removals r JOIN media m ON m.id = r.media_id ORDER BY r.removed_at DESC"

# Bring one back:
npx wrangler d1 execute wedding-guestbook --remote --command \
  "DELETE FROM media_removals WHERE media_id = 'ipad1-01…'"
```

`file` opens the deleted photo or video in a browser (prefix it with the site's address), so you can see which one it is before bringing it back. To bring back **everything** ever deleted: `DELETE FROM media_removals`. The same SQL also works in the Cloudflare dashboard: **D1 → the database → Console**.

A restored item reappears in its spread even if that spread already holds six. The limit only stops new captures (no "+"); it never hides what is saved, so the spread then shows seven.

(For the test database add `--env preview` and use `wedding-guestbook-test`.)

---

## Handwriting canvas

`perfect-freehand` over raw `PointerEvent`s. It converts input points plus pressure into a filled outline, which is what makes a stroke read as ink rather than stacked circles.

Implementation points that decide whether it feels like paper:

- **`touch-action: none`** on the canvas, or the page scrolls while writing.
- **`getCoalescedEvents()`**, feature-detected. Safari dispatches `pointermove` at frame rate and Pencil strokes come out visibly segmented without it. iOS Safari has had a bug returning the wrong `pointerId` on coalesced events — key off the parent event.
- **Palm rejection:** once `pointerType === 'pen'` is seen, ignore `touch` for drawing.
- **Pressure** drives stroke width, with a velocity-based fallback so finger drawing still looks alive.
- **2× DPR backing store**, or saved PNGs are soft.
- **Stroke-level undo**, not pixel snapshots — cheaper, and it survives a resize.

Tools: pen, pencil, eraser, three inks, undo, clear, save.

**How it is built** (`src/lib/canvas/`, `src/islands/album/WritingCanvas.tsx`):

- Strokes are stored in **page units** — a fixed 1000 × 750 space, the page's 4:3 — never screen pixels. Rotation, resize and a different iPad all redraw the same page.
- The stroke JSON (`canvases.stroke_data`) is a self-describing document: `{ format: "guestbook-strokes", version: 1, width: 1000, height: 750, strokes }`. Each stroke carries its tool, ink token, the colour that token had, its points as `[x, y, pressure]`, whether the pressure was real, and the `perfect-freehand` options used — so it can be redrawn without this code. The server refuses anything not in that shape.
- Two stacked canvases: finished strokes below, the stroke being written above, redrawn once per frame. Both are backed at `max(2, devicePixelRatio)` × their CSS size. The eraser removes ink (`destination-out`), never paper: the paper and ruling are not in the canvas.
- The saved PNG is 2000 × 1500 with a **transparent** background — ink only; the album supplies the paper.
- **Save** goes through the same IndexedDB queue as a photo: create the entry if new → PUT the PNG → POST the strokes. Every save is a new version of the **whole page**, never a delta.
- **Drafts.** The page in progress is kept in `localStorage` (`guestbook-page:{entryId}`) after every stroke, so a reload or a crash costs nothing. After Save it is kept, marked saved, until the server confirms that version; then it is removed. `localStorage` rather than IndexedDB because it is synchronous — the stroke is written before the next event can be lost — and a page's strokes are small.
- **Carrying on.** Opening (tapping) a page that already has a saved version fetches that version's strokes and continues from them. Unsaved strokes on this iPad always win; otherwise the newer of this iPad's own last save and the server's latest. If the strokes cannot be fetched and this iPad has no copy, the page is not writable until they can be — a new version without them would hide the saved writing from the album.
- While a pointer is down, the live camera preview beside the page pauses (CLAUDE.md: nothing animates near the canvas while drawing).

`signature_pad` (MIT) is the documented swap-in fallback if the Pencil feel disappoints on real hardware.

---

## Archive, backup, restore

A GitHub Action runs nightly and on demand, writing to a **private repository**:

```
archive/
  manifest.json      every entry, media item and canvas, with timestamps and device
  photos/            original JPEGs
  videos/            original MP4s
  canvases/          PNGs + stroke JSON
  viewer.html        self-contained offline album
```

Three properties make this a real backup rather than a gesture:

- **Versioned.** Git keeps every nightly state, so a deletion is recoverable from history, not just the latest snapshot.
- **Independent.** A different vendor from the live data, so a Cloudflare account problem cannot touch it.
- **Server-free.** `viewer.html` plays the videos and shows the album from a local folder — no build step, no npm, no internet. This is what makes "revisit it in ten years" true rather than aspirational.

Media is stored with **Git LFS** because the archive trends toward ~1.3 GB. The post-wedding step is `git clone` to an external drive; that clone is the local guest book, and it is the moment the Cloudflare account becomes optional.

**Restore paths** (drilled for real in Phase 6, not merely written down):

| Situation | Recovery |
|---|---|
| One file lost | Pull from the archive, re-upload |
| Entry deleted by accident | Restore the row and objects from the previous nightly commit |
| Cloudflare account lost | `viewer.html` still works; a restore script replays `manifest.json` into a fresh account |
| Hosting changed | `npm run build`, deploy the output anywhere |

---

## Capacity

| Content | Count | Each | Total |
|---|---|---|---|
| Photos | ~400 | ~1 MB | ~400 MB |
| Videos (15s, 720p) | ~150 | ~5 MB | ~750 MB |
| Canvases (PNG + strokes) | ~100 | ~1 MB | ~100 MB |
| | | **Total** | **~1.3 GB** |

Against free-tier ceilings: R2 gives 10 GB with free egress (≈7× headroom), D1 gives 5 GB for metadata that will use single-digit MB, Pages serves unlimited static bandwidth, and Functions allow 100,000 requests/day.

A billing alert and an in-app storage gauge are configured in Phase 3 so consumption is visible rather than inferred.
