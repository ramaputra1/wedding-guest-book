# Phase 8 — iPad rehearsal checklist

Everything a browser on a laptop cannot prove, from every phase report, in one place, written for the app **as it is now**. Some earlier reports describe things that have since changed: a trash icon, a mirrored preview, "Sound on", carousel dots. This list replaces them.

**How to use it:**
- Work top to bottom on both iPads, at the venue if you can.
- Tick each box.
- For anything that is not right, write what you saw next to it and send the list back. Claude fixes what comes back; that is Phase 8's other half.

**Where:**
- Do the rehearsal on the **real site**, `https://wedding.ramaap.com` (sections A–G).
- Clear the test entries at the end (section H).
- Anything you want to try freely beforehand can go on `https://wedding-dev.ramaap.com`, the test album.

---

## A. Before you start

- [ ] Production is live: `https://wedding.ramaap.com` shows the cover over HTTPS, with no certificate warning (Phase 7 report, "Owner actions").
- [ ] Both iPads on the latest iPadOS, Safari, Apple Pencil paired and charged.
- [ ] **Settings → Safari → Camera** and **Microphone**: **Ask** or **Allow**.
- [ ] **Settings → Display & Brightness → Auto-Lock:** **Never**, for the day. (Or use Guided Access to keep guests in Safari.)
- [ ] One person ready to stand by each iPad. Settings and Delete are open to anyone holding a signed-in iPad.

## B. The cover and the public album — on a phone, as guests will see it

- [ ] The photo fills the screen on load. The names and date are fully visible above Safari's bottom bar. No band of album shows below the photo after the toolbar collapses.
- [ ] The couple is centred and clear in portrait.
- [ ] **The lift:** the first time the album appears it settles once, calmly, and never replays on later scrolls.
- [ ] Names are crisp Spectral italic, with no visible font swap on a first visit.
- [ ] **Reduce Motion on** (Settings → Accessibility → Motion): no lift at all.
- [ ] Spreads read as an album:
  - prints on the leaf, the seam, warm paper
  - the numbers 1 2 3 under a print with several items
  - a swipe left or right changes the item
  - tapping a photo does nothing
- [ ] The **expand icon** (bottom right of a print) opens it full screen. A video there plays with sound and loops. **Close** comes back.
- [ ] Tapping a **video** in the album plays it, with sound and looping; another tap pauses it.

## C. Signing in

- [ ] `/ipad1` says **iPad 1**; `/ipad2` says **iPad 2**.
- [ ] The field asks for the **PIN** and the iPad shows its **number pad**.
- [ ] Wrong PIN: a clear message, and the field keeps focus.
- [ ] Right PIN: the camera rail appears. The keyboard did not cover the field.
- [ ] *(On the test site only:)* 10 wrong PINs → "Too many wrong tries. Try again in … minutes." The other iPad, already signed in, keeps working. RUNBOOK §14 lifts it.
- [ ] **Close Safari completely** (swipe it away), reopen `/ipad1`: still signed in, no prompt.
- [ ] *Before the wedding:* leave both iPads signed in for a week, then open them: still signed in.

## D. Camera, photos and videos — each iPad

- [ ] Nothing films until you tap **+** under a spread, or touch an **empty** box. Then Safari asks for the camera **once**. **Allow**: the live picture appears in that box, facing the guests.
- [ ] Hold up some text: it reads the **same way** in the preview and in the saved photo. Nothing is mirrored.
- [ ] **Cancel** (above the box) turns the camera away. It is not offered during the countdown or while recording.
- [ ] **Photo**, 3 s and 5 s timers:
  - the countdown shows on the picture and the shutter ring
  - a second tap cancels it
  - the photo is sharp, about 1 MB
  - the box stays landscape and filled, also with the iPad held upright
- [ ] **Video:**
  - the shutter turns **red** while recording
  - recording stops by itself at **15 s**
  - the file is about 5 MB
  - it plays back with sound
- [ ] That iPad-recorded video plays on a **computer**, in Chrome **and** Firefox (open the public album there and expand it).
- [ ] The **poster frame** of a video is a real picture, not black.
- [ ] Saved videos in the album **play by themselves with sound**, looping, one at a time. Two videos on screen: only one plays. If Safari will not start sound on its own, the video waits until it is tapped — it is never silent.
- [ ] A playing video **pauses** while another is being recorded, and while the Pencil is on a page.
- [ ] **Permission refused:** in Settings → Safari → Camera choose **Deny**, then reload. A notice explains, and the shutter opens the iPad's own camera instead; the photo still saves. Set it back to **Allow** afterwards.

## E. The grid

- [ ] At **six** items a spread's **+** disappears and the camera turns away.
- [ ] Tapping a number shows that item. In the spread the camera is aimed at, it also turns the camera away.
- [ ] A **swipe** left or right changes the item on a natural flick. Up and down over a print still scrolls the album. A swipe never triggers Safari's back gesture.
- [ ] **Delete (1)** sits just above a print's top right, never over it:
  - tap it → the question with the item shown
  - **No** keeps it
  - **Yes, delete** removes it
  - the other iPad no longer shows it after a reload
- [ ] **Settings** (top right):
  - the sheet scrolls, and the album beside it changes as you choose
  - **Save** applies it everywhere: the other iPad within a minute, the public site within 30 s
  - **Cancel** puts it back
  - try every album colour with every paper: text stays readable, and the inks read well
  - the watermark sits where chosen and never gets in the way of writing
  - the decorations are faint and scrolling stays smooth

## F. Writing — each iPad, with the Pencil

- [ ] A page opens only when you **tap the page itself**, whatever the camera is aimed at.
- [ ] **Pressure:** press harder for a wider line; a light touch gives a fine one.
- [ ] **Smoothness:** fast loops and a signature stay round, not segmented.
- [ ] **Latency:** the ink keeps up with the nib.
- [ ] **Palm rejection:** write with your hand resting on the glass — no stray marks, before or after the Pencil touches.
- [ ] **No scroll, no magnifier:** the page never moves while writing, with the Pencil or a finger. No loupe on a long press.
- [ ] **Line weight:** the pen reads like a fountain pen at arm's length, and the pencil is finer and greyer. If it is too thin or too heavy, say so: it is one number each.
- [ ] **Eraser** removes ink, never paper.
- [ ] **Undo / Redo** icons step back and forward. **Clear** asks first (No / Yes, clear).
- [ ] **Save** (white) → the page closes and shows the writing → reopening shows **Saved** (brass).
- [ ] **Cancel** (red underline): with nothing new it closes at once; with new strokes it asks "Leave without saving?".
- [ ] **Rotate** the iPad mid-page and keep writing: the strokes stay put and sharp.
- [ ] **Save with the wifi off:** "Saving…" shows. Turn the wifi back on and it saves by itself.

## G. Both iPads at once, the network, the numbers

- [ ] Both iPads capture and write **at the same moment**; both entries land in the album, and each iPad shows the other's after a reload.
- [ ] **Airplane mode** mid-capture: "Saving…" stays (never "Saved"). Airplane mode off: it saves by itself.
- [ ] **Close Safari with captures still waiting.** Reopen `/ipad1`: they finish saving.
- [ ] **On the venue wifi:**
  - upload a **15-second video** (~5–10 MB) and time it: ______ seconds
  - the site loads on each iPad
- [ ] **Storage gauge** (bottom of the rail) after ~20 test entries matches **Cloudflare → R2 → wedding-media → Metrics**.

## H. The archive, then clearing the rehearsal

- [ ] The **Archive** workflow ran green last night (RUNBOOK section 2).
- [ ] Clone the archive and run `git lfs pull` (RUNBOOK section 3). **Double-click `viewer.html` in Safari on the Mac**: the album appears, a video plays, the wifi is not needed.
- [ ] **Clear the rehearsal's test entries** (RUNBOOK section 13). Run the export first; the clear refuses without it.
- [ ] Run the export again: the archive's newest commit shows an empty album. The test entries stay in its history.
- [ ] The billing alert is active (Cloudflare → Notifications).

## I. On the day

- [ ] Both iPads charged, Auto-Lock off, Safari's other tabs closed, `/ipad1` and `/ipad2` open and signed in.
- [ ] The site loaded once on each iPad at the venue, on the venue wifi.
- [ ] One person by each iPad.
