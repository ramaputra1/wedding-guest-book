# Design System

The authority for every visual decision in this project. Use only what is defined here. If something is missing, propose adding it to this file rather than hard-coding a one-off.

---

## The idea: a black-leaf photo album

Archival photo albums use dense black card stock, and prints are mounted on them with gummed photo corners. That single material fact supplies the structure, the selection state, and the personality of this interface. The reference wireframe's black ground was already pointing there.

Two deliberate rejections, so nobody reintroduces them later:

- **Not cream-and-terracotta with a high-contrast display serif.** That is what a wedding site defaults to, and it would make this look like every other one.
- **Not a centred serif monogram over a hero image as the only idea.** The names *are* centred, as the owner asked — but the design has to carry more than that.

Everything below exists to make a screen feel like an object you could hold.

---

## Color

```css
:root {
  --leaf:          #12151C;  /* the album page — deep ink blue-black, not neutral */
  --leaf-raised:   #1C2029;  /* gutter seam, camera rail, elevated surfaces */
  --leaf-edge:     #0C0E13;  /* recesses, the gutter's deepest point */

  --photo-paper:   #FBFAF7;  /* media mounts — cool white, as photographic paper is */
  --writing-paper: #EFE8DA;  /* handwriting pages — warm, as writing paper is */

  --ink:           #1A2238;  /* handwriting + text on paper — fountain-pen blue-black */
  --ink-soft:      #4A5268;  /* secondary text on paper */

  --brass:         #A08A52;  /* STATE ONLY — selected, active, confirmed */
  --brass-dim:     #6B5C38;  /* brass at rest, e.g. an inactive corner hint */

  --on-leaf:       #E8E4DC;  /* text directly on the leaf */
  --on-leaf-soft:  #8A8E98;  /* secondary text on the leaf */

  --warn:          #B4654A;  /* unsaved / retry states — used sparingly */

  --writing-rule:  rgba(26, 34, 56, 0.08);  /* faint ruled lines on writing paper — --ink at 8% */
}
```

**The quiet idea is the two paper temperatures.** A media page is cool white and a writing page is warm — so you can tell them apart by material alone, before reading a word, exactly as you could in a real album. Never use one where the other belongs.

**`--brass` is state, never decoration.** It marks the selected mount, the active rule, and save confirmation. The moment it appears as an accent on something that isn't a state, the system is broken. There are no other accent colors; do not add one.

Never use pure `#000` or pure `#FFF`. The leaf is ink, the paper is paper.

---

## Typography

Two families, clearly distinct, **both self-hosted**. A font CDN is a dependency on someone else's uptime in 2036 — put the files in `public/fonts/` and declare them with `@font-face` and `font-display: swap`.

| Family | Role |
|---|---|
| **Spectral** | Everything editorial — names, dates, entry titles, captions, body |
| **Public Sans** | Functional controls only — buttons, tool labels, status, counters |

Spectral is chosen over Cormorant and Playfair, which are the wedding-site reflex. It has a more characterful italic and was drawn for screens rather than adapted to them. The names on the landing page are set in its **italic**, and that type treatment is the hero — not a label resting on a photograph.

Public Sans stays small and quiet. It never competes, and it never appears in editorial content.

**`Spectral Fallback`** is the system's Georgia, resized with `size-adjust` and `ascent-override`/`descent-override` to Spectral's measurements (declared in `base.css`). While Spectral is still downloading, text is set in it, so when Spectral arrives the names do not jump. It is a loading aid, not a third typeface — never name it directly.

```css
:root {
  --font-display: 'Spectral', 'Spectral Fallback', Georgia, 'Times New Roman', serif;
  --font-ui:      'Public Sans', system-ui, -apple-system, sans-serif;

  /* Modular scale, 1.25 (major third), 16px base */
  --step--1: 0.8rem;
  --step-0:  1rem;
  --step-1:  1.25rem;
  --step-2:  1.563rem;
  --step-3:  1.953rem;
  --step-4:  2.441rem;
  --step-5:  3.052rem;
  --step-hero: clamp(2.75rem, 11vw, 8rem);

  --leading-tight: 1.15;
  --leading-body:  1.6;   /* serif body wants more than a sans would */
  --leading-ui:    1.4;
}
```

**Rules:**

- Line length under 70 characters for serif body text.
- No ALL-CAPS labels. No tracked-out eyebrow text above headings.
- Do not accent a single word in a headline with italic, bold, or color.
- Dates are set in Spectral, not Public Sans — they are editorial content, not UI.
- Numerals in UI contexts (counters, durations, storage) use `font-variant-numeric: tabular-nums`.

---

## Spacing, radii, elevation

```css
:root {
  --space-1:  0.25rem;   --space-2:  0.5rem;    --space-3:  0.75rem;
  --space-4:  1rem;      --space-5:  1.5rem;    --space-6:  2rem;
  --space-7:  3rem;      --space-8:  4rem;      --space-9:  6rem;
  --space-10: 8rem;

  --gutter-width: clamp(1.5rem, 4vw, 4rem);
  --page-margin:  clamp(1rem, 4vw, 4rem);

  /* Radii differ on purpose — do not give everything the same one */
  --radius-mount:  2px;     /* prints are square; this is just anti-aliasing */
  --radius-paper:  3px;
  --radius-button: 4px;
  --radius-pill:   999px;   /* the shutter, and only the shutter */

  --rule-width:  1px;      /* hairlines: the selection rule, seams, dot rings */
  --focus-width: 2px;      /* the brass keyboard focus ring */
  --album-max:   80rem;    /* the book never grows wider than this on large screens */
}
```

**Elevation on a dark ground does not work like elevation on white.** A mounted print reads as mounted because of a fine light edge catching along its top, not because of a grey blur beneath it.

```css
--mount-lift:
  inset 0 1px 0 rgba(255, 255, 255, 0.07),
  0 1px 2px rgba(0, 0, 0, 0.55),
  0 10px 28px rgba(0, 0, 0, 0.38);
```

Do not use the generic `0 4px 6px rgba(0,0,0,.1)` soft-grey card shadow anywhere.

---

## Components

### Media mount

A photo or video mounted on the album leaf, with **real photo corners** — small triangles at each of the four corners, drawn in CSS or inline SVG.

- **Empty mount:** four bare corners on the leaf, nothing else. This is a visible invitation and needs no "Add a photo" instruction text.
- **Filled mount:** the media sits under the corners, which overlap its edges as gummed corners would.
- **At rest:** corners are `--on-leaf-soft`. (`--brass-dim` was the first idea, but at 2.8:1 on the leaf it fails WCAG's 3:1 minimum for UI graphics; `--on-leaf-soft` is 5.6:1.)
- **Selected:** the four corners turn `--brass` and a hairline brass rule appears beneath the mount. No glow, no outline, no scale transform.
- **Carousel:** when a mount holds several items, dots sit beneath it. The active dot is a filled `--brass` disc; the rest are `--on-leaf-soft` rings at full strength. (Low-opacity dots would fall below 3:1; ring-versus-disc also means the active dot is never told apart by colour alone.)
- **Video items** carry a small duration badge (`0:15`) on one corner in Public Sans. Nothing else distinguishes them — a video is a memory, not a media type.
- **Shape:** the mount is a fixed 4:3 space, so spreads line up; the print inside keeps its own shape. A landscape photo spans the width, a portrait one stands upright at full height, and the corners hug the print. Nothing is cropped — a guest's face is never cut off to fit a frame.
- **Viewfinder:** while the camera is on, the live picture appears in the mount where the next capture will land — the destination is shown, not described. The front camera is mirrored, as people expect; the photo taken is not.
- **Landing:** after a capture, the new item shows in its mount for about two and a half seconds before the viewfinder returns, so the guest sees what they made.
- **Open (public album):** tapping a print opens it full size in a viewer — a plain `--leaf-edge` ground, the photo or a playing video, and one "Close" button. Escape closes it.

### Writing page

Warm `--writing-paper`, `--radius-paper`, with a very faint baseline rule to suggest ruled paper. Ink defaults to `--ink`. The surface must read as paper before it reads as a canvas — no toolbar chrome crowding its edges, no visible border box.

### Camera rail

Flush to the right edge, flat, `--leaf-raised`. It is a camera body, not a floating glass panel — no blur, no transparency, no rounded floating card.

- Collapses to a thin strip with a single affordance to reopen.
- Contains: the Photo/Video mode toggle, the photo self-timer choice (3 s / 5 s), the shutter, and the destination indicator ("→ Spread 3").
- **Photo self-timer (owner request):** a photo is always taken on a timer, 3 s by default or 5 s, so a guest can set the iPad down and pose. The seconds count down large on the viewfinder (Public Sans, tabular, on a `--leaf` plate) and on the shutter's ring; a second tap cancels. Unlike video, a visible number helps here: the guest needs to know when to smile.
- **Shutter:** a circle, `--radius-pill`, `--photo-paper` fill. In video mode it grows a progress ring that depletes over 15 seconds. At 15 seconds the ring matters more than it would at 30 — people need to *feel* the clock, and a numeric countdown would make guests perform to it. While recording, the face becomes a rounded square (`--radius-button`) — the familiar "stop" — so the state is never carried by the ring alone. The ring is drawn from elapsed time, not a CSS animation: it is a clock, and the reduced-motion override must not freeze it.
- **Status line:** short facts only — "3 waiting to save", "1.2 of 10 GB used" — in Public Sans, `--on-leaf-soft`. Longer warnings (storage piling up, camera blocked) appear as a notice above the album, where there is room to read them.

### Status

States appear on the mount itself, not as toasts:

| State | Treatment |
|---|---|
| Saving… | `--on-leaf-soft`, Public Sans, no spinner |
| Saved | Brief `--brass` confirmation on the corners, then it settles |
| Not saved | A tap target to retry ("That photo didn't save. Tap to try again.") with a `--warn` edge — persistent, never auto-dismissed |

A failed save must never be something the user can miss.

**`--warn` marks, it does not write.** As small text on the leaf it is 4.3:1, short of AA, so every warning — not saved, sign-in error, notices — pairs a `--warn` edge bar with words in `--on-leaf`. Colour and text together; neither alone.

---

## Layout

```
┌───────────────────────────────────────────────────────────┐
│                                                           │
│            [ full-bleed wedding photograph ]              │
│                                                           │
│                    Name & Name                            │
│                    the date                               │
│                                                           │
└───────────────────────────────────────────────────────────┘
                     ↓  the cover lifts
┌─────────────────────┬─┬─────────────────────────────┬─────┐
│  ⌐              ¬   │ │                             │     │
│    media mount      │g│      writing page           │  ◯  │
│  ∟              ⌟   │u│                             │     │
│       ● ● ● ●       │t├─────────────────────────────┤ cam │
├─────────────────────┤t│                             │rail │
│    media mount      │e│      writing page           │     │
└─────────────────────┴─┴─────────────────────────────┴─────┘
```

The **gutter** is a genuine vertical seam with an inner shadow toward `--leaf-edge`, so each row reads as an open spread rather than two unrelated cards. It is the structural device that makes this a book.

**Breakpoints**

| Context | Layout |
|---|---|
| iPad landscape (primary) | Side-by-side spread, rail expanded |
| iPad portrait | Spread folds — media above, writing below, still visibly one unit; rail becomes a bottom bar |
| Phone | Single column, generous margins; shutter thumb-reachable at the bottom |
| Desktop | Same as iPad landscape, content capped at a comfortable measure |

Design iPad-first. The owner uses this on an iPad; everyone else is a visitor.

**The one breakpoint:** the spread opens side by side when `(orientation: landscape) and (min-width: 48rem)`; otherwise it folds. Orientation, not width alone, because a tall iPad and a phone fold the same way, and a wide-but-short phone in landscape still opens like a book.

---

## Motion

**One orchestrated moment:** scrolling from the hero to the album lifts the cover — the photograph recedes slightly as the first spread rises over it. This is the only non-user-triggered motion in the entire site.

Everything else only ever **confirms an action**: a mount settling when media lands, the rail sliding open, the record ring depleting, a save resolving.

Forbidden: fade-and-slide-up on every section, hover transitions on every card, parallax beyond the single cover lift, anything looping, any spinner that outlives its operation.

**Nothing animates within 200px of the canvas while a pointer is down.** Writing must never compete for frames.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Durations: 120ms for state changes, 240ms for the rail, 600ms for the cover lift. Easing `cubic-bezier(0.22, 0.61, 0.36, 1)` — never `linear`, never a bounce.

```css
:root {
  --duration-state: 120ms;
  --duration-rail:  240ms;
  --duration-lift:  600ms;
  --ease:           cubic-bezier(0.22, 0.61, 0.36, 1);
  --lift-scale:     0.96;   /* how far the cover recedes during the lift */
}
```

---

## Words

Sentence case. Active voice. No filler, no apologies, no exclamation marks.

The guest book gets **one** line of introduction and then gets out of the way — something like *"Every page here was written by hand on the day."* Do not add a second.

| Context | Write | Not |
|---|---|---|
| Save action | "Save" → "Saved" | "Submit" → "Success!" |
| Upload failed | "That video didn't save. Tap to try again." | "Oops! Something went wrong." |
| Empty album | "Nothing here yet." | "No entries found" |
| Sign-in | "Enter the passphrase" | "Login to continue" |

An action keeps its name through the whole flow: the button that says "Save" produces a state that says "Saved".

Errors explain what happened and what to do. They do not apologise and they are never vague.

---

## Accessibility floor

Non-negotiable, and checked in every phase report:

- Visible keyboard focus on every interactive element — `outline: var(--focus-width) solid var(--brass)` with `outline-offset: var(--space-1)`, never `outline: none`.
- Touch targets at least 44×44 CSS px. The shutter is far larger.
- Every control has an accessible name. Icon-only buttons carry `aria-label`.
- Contrast at AA: paper on leaf is far above it; `--brass` is for UI and large elements only — never small body text on the leaf.
- `prefers-reduced-motion` honoured throughout.
- The canvas has a text alternative describing the entry, and the album is navigable without a pointer.
- Color never carries meaning alone — selection shows as brass corners *and* a rule; a failed save shows color *and* text.
