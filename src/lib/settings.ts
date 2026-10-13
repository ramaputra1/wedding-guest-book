/**
 * The album's look (owner request after Phase 5): its colour, the photo
 * frame, the writing paper, a watermark on every page, and a theme. One look
 * for the whole album — both iPads and the public site — chosen in Settings
 * on a signed-in iPad (docs/ARCHITECTURE.md, "The album's look").
 *
 * Shared by the island and the server, so it holds no DOM and no secrets.
 * Every value is one of a fixed list, so nothing a request sends can become
 * CSS, markup or a file name; the watermark text is only ever shown as text.
 */

export const LEAVES = ['midnight', 'charcoal', 'forest', 'wine', 'walnut', 'navy'] as const;
export const FRAMES = ['corners', 'plain', 'polaroid', 'borderless'] as const;
export const PAPERS = ['ruled', 'plain', 'white', 'dotted'] as const;
export const THEMES = ['none', 'botanical', 'confetti', 'starlight'] as const;
export const WATERMARK_POSITIONS = ['top-start', 'top', 'top-end', 'center', 'bottom-start', 'bottom', 'bottom-end'] as const;
/** In characters as a person counts them (emoji and accents count once). */
export const WATERMARK_MAX = 24;

export type Leaf = (typeof LEAVES)[number];
export type Frame = (typeof FRAMES)[number];
export type Paper = (typeof PAPERS)[number];
export type Theme = (typeof THEMES)[number];
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export interface AlbumLook {
  leaf: Leaf;
  frame: Frame;
  paper: Paper;
  theme: Theme;
  /** Empty text: no watermark. */
  watermark: { text: string; position: WatermarkPosition };
}

/** The album as it was designed: every choice the first in its list. */
export const DEFAULT_LOOK: AlbumLook = {
  leaf: 'midnight',
  frame: 'corners',
  paper: 'ruled',
  theme: 'none',
  watermark: { text: '', position: 'bottom-end' },
};

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

/** Characters, not UTF-16 units: "é" or an emoji is one. */
export function watermarkLength(text: string): number {
  return [...text].length;
}

// Line breaks, tabs and other control characters have no place on a page.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** Reads a look sent by an iPad, or returns null if any part is not allowed. */
export function parseLook(value: unknown): AlbumLook | null {
  if (typeof value !== 'object' || value === null) return null;
  const look = value as Record<string, unknown>;
  const mark = look.watermark as Record<string, unknown> | null | undefined;
  if (!oneOf(LEAVES, look.leaf) || !oneOf(FRAMES, look.frame) || !oneOf(PAPERS, look.paper) || !oneOf(THEMES, look.theme)) return null;
  if (typeof mark !== 'object' || mark === null || typeof mark.text !== 'string' || !oneOf(WATERMARK_POSITIONS, mark.position)) return null;
  const text = mark.text.trim();
  if (watermarkLength(text) > WATERMARK_MAX || CONTROL.test(text)) return null;
  return { leaf: look.leaf, frame: look.frame, paper: look.paper, theme: look.theme, watermark: { text, position: mark.position } };
}
