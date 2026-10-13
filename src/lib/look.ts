/**
 * Puts the album's look on the page: one data attribute per choice on <html>,
 * which the stylesheets read (components.css, "The album's look"). Also kept
 * on the device, so the next visit starts in the right colours before the
 * look has been fetched (the inline script in layouts/Base.astro).
 */
import { DEFAULT_LOOK, parseLook, type AlbumLook } from './settings';

/** Read by layouts/Base.astro's inline script too: keep the two in step. */
export const LOOK_STORAGE_KEY = 'guestbook-look';

export function applyLook(look: AlbumLook) {
  const root = document.documentElement;
  root.dataset.leaf = look.leaf;
  root.dataset.frame = look.frame;
  root.dataset.paper = look.paper;
  root.dataset.theme = look.theme;
}

export function rememberLook(look: AlbumLook) {
  try {
    localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(look));
  } catch {
    // Storage full or blocked: the look is still fetched each visit.
  }
}

/** The look this device last saw, or the designed one. */
export function rememberedLook(): AlbumLook {
  try {
    const raw = localStorage.getItem(LOOK_STORAGE_KEY);
    return (raw && parseLook(JSON.parse(raw))) || DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}
