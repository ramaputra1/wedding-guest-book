/**
 * The saved page image: every stroke rendered at 2000 × 1500 — twice the
 * page's own coordinates, at least twice any size the page is ever shown at,
 * so it stays crisp on a Retina screen. The background is transparent: the
 * paper and its ruling come from the album, so ink is all the PNG holds.
 */
import { PAGE_HEIGHT, PAGE_WIDTH, renderPage, toDocument, type Stroke } from './strokes';

export const EXPORT_SCALE = 2;
export const EXPORT_WIDTH = PAGE_WIDTH * EXPORT_SCALE;
export const EXPORT_HEIGHT = PAGE_HEIGHT * EXPORT_SCALE;

export function exportPng(strokes: readonly Stroke[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  renderPage(canvas, strokes);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The page could not be saved as an image.'))), 'image/png'),
  );
}

/** The JSON stored beside the PNG, as a string ready for the queue. */
export function exportStrokes(strokes: readonly Stroke[]): string {
  return JSON.stringify(toDocument(strokes));
}
