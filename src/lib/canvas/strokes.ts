/**
 * Handwriting as data. A page is a list of strokes in page coordinates — a
 * fixed 1000 × 750 space (the writing page's 4:3) — never screen pixels, so a
 * page re-renders identically at any size, survives rotation, and can be
 * redrawn from its JSON decades from now (docs/ARCHITECTURE.md, "Drawings
 * outlive their pixels").
 *
 * perfect-freehand turns each stroke's points and pressures into a filled
 * outline; that outline is what makes it read as ink rather than stacked dots.
 */
import { getStroke, type StrokeOptions } from 'perfect-freehand';

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 750;

export type Tool = 'pen' | 'pencil' | 'eraser';
/** Design tokens (DESIGN.md, Colour). The pencil is always graphite: --ink-soft. */
export type InkToken = 'ink' | 'ink-sepia' | 'ink-oxblood' | 'ink-soft';

export interface Stroke {
  tool: Tool;
  ink: InkToken;
  /** The token's colour at the time of writing, so the JSON needs no stylesheet to be redrawn. */
  color: string;
  /** Points in page coordinates: [x, y, pressure 0–1]. */
  points: [number, number, number][];
  /** True when pressure came from a stylus; false means it is simulated from speed. */
  pressure: boolean;
  /** The perfect-freehand settings used, stored so a re-render needs no code. */
  options: StrokeOptions;
}

/** What a page's stroke JSON looks like on disk and in D1 (canvases.stroke_data). */
export interface StrokeDocument {
  format: 'guestbook-strokes';
  version: 1;
  width: typeof PAGE_WIDTH;
  height: typeof PAGE_HEIGHT;
  strokes: Stroke[];
}

/** How each tool writes. Sizes are in page units (a page is 1000 wide). */
export const TOOL_OPTIONS: Record<Tool, Omit<StrokeOptions, 'simulatePressure'>> = {
  pen: { size: 8, thinning: 0.6, smoothing: 0.5, streamline: 0.4 },
  pencil: { size: 5, thinning: 0.3, smoothing: 0.45, streamline: 0.35 },
  eraser: { size: 30, thinning: 0, smoothing: 0.5, streamline: 0.3 },
};

/** The pencil is a little translucent, as graphite is. */
export const TOOL_ALPHA: Record<Tool, number> = { pen: 1, pencil: 0.85, eraser: 1 };

export function newStroke(tool: Tool, ink: InkToken, color: string, pressure: boolean): Stroke {
  return {
    tool,
    ink: tool === 'pencil' ? 'ink-soft' : ink,
    color,
    points: [],
    pressure,
    // Without a stylus, perfect-freehand thins the line by speed instead.
    options: { ...TOOL_OPTIONS[tool], simulatePressure: !pressure },
  };
}

/** Rounded to a tenth of a page unit: invisible on screen, and it keeps the JSON small. */
export function pagePoint(x: number, y: number, pressure: number): [number, number, number] {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
}

/** perfect-freehand's outline as a Path2D, in page coordinates. */
export function strokePath(stroke: Stroke, extra: [number, number, number][] = []): Path2D {
  const outline = getStroke([...stroke.points, ...extra], { ...stroke.options, last: extra.length === 0 });
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

// A finished stroke's outline never changes, so it is computed once. Without
// this, every undo or resize would recompute every stroke on the page.
const finishedPaths = new WeakMap<Stroke, Path2D>();

/**
 * Draws one stroke onto a context already scaled to page units. `live` is
 * for the stroke still being written: its outline is not cached, and
 * predicted points may extend it for display.
 */
export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  live?: { predicted: [number, number, number][] },
): void {
  let path: Path2D;
  if (live) {
    path = strokePath(stroke, live.predicted);
  } else {
    path = finishedPaths.get(stroke) ?? strokePath(stroke);
    finishedPaths.set(stroke, path);
  }
  context.save();
  context.globalAlpha = TOOL_ALPHA[stroke.tool];
  // The eraser removes ink, never paper: the ruling and the paper are not in the canvas.
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.fillStyle = stroke.tool === 'eraser' ? '#000' : stroke.color;
  context.fill(path);
  context.restore();
}

/** Clears a canvas and draws every stroke at the canvas's own resolution. */
export function renderPage(canvas: HTMLCanvasElement | OffscreenCanvas, strokes: readonly Stroke[]): void {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(canvas.width / PAGE_WIDTH, 0, 0, canvas.height / PAGE_HEIGHT, 0, 0);
  for (const stroke of strokes) drawStroke(context, stroke);
}

export function toDocument(strokes: readonly Stroke[]): StrokeDocument {
  return { format: 'guestbook-strokes', version: 1, width: PAGE_WIDTH, height: PAGE_HEIGHT, strokes: [...strokes] };
}

/** Reads a stroke document, or returns null for anything that is not one. */
export function fromDocument(value: unknown): Stroke[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Partial<StrokeDocument>;
  if (doc.format !== 'guestbook-strokes' || doc.version !== 1 || !Array.isArray(doc.strokes)) return null;
  return doc.strokes as Stroke[];
}
