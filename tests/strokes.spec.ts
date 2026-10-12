/**
 * The stroke model: a page is data in page units, and its JSON reads back
 * as the same strokes — so a page can be redrawn decades from now without
 * the app that wrote it.
 */
import { describe, expect, it } from 'vitest';
import { exportStrokes } from '../src/lib/canvas/export';
import { fromDocument, newStroke, pagePoint, PAGE_HEIGHT, PAGE_WIDTH, toDocument, TOOL_OPTIONS } from '../src/lib/canvas/strokes';

describe('strokes', () => {
  it('a page is 1000 × 750 units — the writing page is 4:3', () => {
    expect(PAGE_WIDTH / PAGE_HEIGHT).toBeCloseTo(4 / 3);
  });

  it('points are rounded to a tenth of a unit and pressure to hundredths', () => {
    expect(pagePoint(12.3456, 700.04, 0.12345)).toEqual([12.3, 700, 0.12]);
  });

  it('the pencil is always graphite, whatever ink is chosen', () => {
    expect(newStroke('pencil', 'ink-oxblood', '#4A5268', true).ink).toBe('ink-soft');
    expect(newStroke('pen', 'ink-oxblood', '#6E1E2A', true).ink).toBe('ink-oxblood');
  });

  it('pressure is simulated only when the device has none', () => {
    expect(newStroke('pen', 'ink', '#1A2238', true).options.simulatePressure).toBe(false);
    expect(newStroke('pen', 'ink', '#1A2238', false).options).toEqual({ ...TOOL_OPTIONS.pen, simulatePressure: true });
  });

  it('the saved JSON reads back as exactly the same strokes', () => {
    const pen = newStroke('pen', 'ink-sepia', '#5B3A1E', true);
    pen.points.push(pagePoint(1, 2, 0.4), pagePoint(300.25, 400.75, 0.9));
    const eraser = newStroke('eraser', 'ink', '#1A2238', false);
    eraser.points.push(pagePoint(5, 5, 0.5));
    const json = exportStrokes([pen, eraser]);
    expect(JSON.parse(json)).toEqual(toDocument([pen, eraser]));
    expect(fromDocument(JSON.parse(json))).toEqual([pen, eraser]);
  });

  it('anything that is not a stroke document is refused', () => {
    expect(fromDocument(null)).toBeNull();
    expect(fromDocument([])).toBeNull();
    expect(fromDocument({ format: 'guestbook-strokes', version: 2, strokes: [] })).toBeNull();
  });
});
