/**
 * Placeholder handwriting for the Phase 2 design review, drawn with
 * perfect-freehand — the same library Phase 5 uses for real ink — so a page
 * shows what a written entry will look like. Served as static SVG files by
 * src/pages/placeholder/[page].svg.ts. Phase 3 deletes both files.
 */
import { getStroke } from 'perfect-freehand';

/** Each page: a seed for its wobble and the length of each written line. */
export const PLACEHOLDER_PAGES: Record<number, { seed: number; lines: number[] }> = {
  1: { seed: 7, lines: [330, 290, 360, 210] },
  2: { seed: 21, lines: [360, 340, 180] },
  3: { seed: 42, lines: [300, 350] },
};

export const placeholderPageUrl = (page: number) => `/placeholder/page-${page}.svg`;

/** A small deterministic random source, so every build draws the same "handwriting". */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** A line of joined loops, roughly the rhythm of cursive, as pressure-varying points. */
function cursiveLine(x0: number, y0: number, length: number, random: () => number): number[][] {
  const points: number[][] = [];
  const loops = Math.max(3, Math.round(length / 22));
  for (let i = 0; i <= loops * 14; i++) {
    const t = (i / 14) * Math.PI * 2;
    const height = 9 + random() * 7;
    points.push([
      x0 + (t / (Math.PI * 2)) * (length / loops) - 7 * Math.sin(t),
      y0 - height * (1 - Math.cos(t)) / 2 + random() * 1.2,
      0.35 + 0.4 * Math.abs(Math.sin(t / 2)),
    ]);
  }
  return points;
}

// The standard perfect-freehand outline → SVG path conversion.
function outlineToPath(outline: number[][]): string {
  if (outline.length === 0) return '';
  const d = outline.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0.toFixed(0), y0.toFixed(0), ((x0 + x1) / 2).toFixed(0), ((y0 + y1) / 2).toFixed(0));
      return acc;
    },
    ['M', ...outline[0].map((n) => n.toFixed(0)), 'Q'],
  );
  return `${d.join(' ')} Z`;
}

/** A 4:3 page of placeholder handwriting as an SVG document. */
export function placeholderPageSvg(seed: number, lines: number[]): string {
  const random = seeded(seed);
  const strokes = lines.map((length, row) => cursiveLine(36, 70 + row * 48, length, random));
  // A short signature stroke, lower right.
  strokes.push(cursiveLine(300 - lines.length * 4, 82 + lines.length * 48, 70, random));
  const paths = strokes
    .map((points) => getStroke(points, { size: 4.2, thinning: 0.6, smoothing: 0.6, streamline: 0.45 }))
    .map(outlineToPath);
  // #1A2238 is --ink; an image cannot read CSS custom properties.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">` +
    `<g fill="#1A2238">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`
  );
}

