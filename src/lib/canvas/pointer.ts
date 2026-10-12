/**
 * Turns raw PointerEvents on a canvas into stroke points, the way a pen on
 * paper should feel (CLAUDE.md, "iPad and Safari specifics"):
 *
 * - Coalesced events: Safari delivers pointermove once per frame, but the
 *   Pencil reports up to 240 samples a second. getCoalescedEvents() returns
 *   the ones in between; without them a fast curve comes out as straight
 *   segments. Feature-detected. iOS has returned the wrong pointerId on
 *   coalesced events, so the parent event's id is the only one trusted.
 * - Palm rejection: once a pen has been seen, touches never draw. A touch
 *   that was already drawing when the pen arrives was a palm: it is dropped.
 * - Pressure: real from a stylus; otherwise perfect-freehand simulates it
 *   from speed, so a finger still writes a living line.
 *
 * The canvas itself must have `touch-action: none`, or the page scrolls
 * under the pen (components.css).
 */
import { PAGE_HEIGHT, PAGE_WIDTH, pagePoint } from './strokes';

export interface PointerSample {
  x: number;
  y: number;
  pressure: number;
}

export interface PageInputHandlers {
  /** A stroke begins. `pressure` says whether this device reports real pressure. */
  start(pressure: boolean): void;
  /** New points for the stroke in progress, plus predicted ones for display only. */
  move(points: [number, number, number][], predicted: [number, number, number][]): void;
  end(): void;
  /** The stroke in progress was a palm and must vanish. */
  cancel(): void;
}

/** Shared by every page on the screen: a pen seen once means palms are about. */
let penSeen = false;

export function hasSeenPen(): boolean {
  return penSeen;
}

/** For tests: forget that a pen was seen. */
export function resetPenSeen(): void {
  penSeen = false;
}

export function attachPageInput(canvas: HTMLCanvasElement, handlers: PageInputHandlers): () => void {
  let active: { id: number; type: string } | null = null;

  const toPage = (event: { clientX: number; clientY: number; pressure: number }, real: boolean) => {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * PAGE_WIDTH;
    const y = ((event.clientY - box.top) / box.height) * PAGE_HEIGHT;
    // A stylus touching down can report 0 for its very first sample.
    const pressure = real ? Math.max(0.05, event.pressure) : 0.5;
    return pagePoint(x, y, pressure);
  };

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'pen') {
      penSeen = true;
      // A palm got there first and has been "drawing": take it back.
      if (active && active.type === 'touch') {
        handlers.cancel();
        active = null;
      }
    }
    if (event.pointerType === 'touch' && penSeen) return;
    if (active) return; // one stroke at a time
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    active = { id: event.pointerId, type: event.pointerType };
    const real = event.pointerType === 'pen';
    handlers.start(real);
    handlers.move([toPage(event, real)], []);
  };

  const onMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) return;
    event.preventDefault();
    const real = active.type === 'pen';
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const points = (samples.length > 0 ? samples : [event]).map((sample) => toPage(sample, real));
    const predicted =
      typeof event.getPredictedEvents === 'function' ? event.getPredictedEvents().map((sample) => toPage(sample, real)) : [];
    handlers.move(points, predicted);
  };

  const onEnd = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    active = null;
    handlers.end();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  // iOS: stop the long-press magnifier and callout from stealing the pen.
  const stopTouchDefault = (event: TouchEvent) => event.preventDefault();
  canvas.addEventListener('touchstart', stopTouchDefault, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    canvas.removeEventListener('touchstart', stopTouchDefault);
  };
}
