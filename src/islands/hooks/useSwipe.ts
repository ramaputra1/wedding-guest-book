import { useRef } from 'preact/hooks';

/** How far a finger must travel sideways before it counts as a swipe, in CSS px. */
const SWIPE_MIN_PX = 40;
/** Sideways must clearly win over up-and-down, or it was a scroll. */
const SWIPE_DOMINANCE = 1.5;

/**
 * A horizontal swipe with a finger or the Pencil: -1 for a swipe to the right
 * (back), +1 for a swipe to the left (onward). The element needs
 * `touch-action: pan-y`, so the browser keeps vertical scrolling and leaves
 * sideways movement to us. A mouse is ignored: on a desktop the numbers are
 * the way through, and a drag there selects or drags the image.
 *
 * Returns handlers for the element that holds the carousel. The click that
 * ends a swipe is swallowed, so a swipe on the public album never opens the
 * photo it started on.
 */
export function useSwipe(onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);

  return {
    onPointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      swallowClick.current = false;
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      if (!from || from.id !== event.pointerId) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return;
      swallowClick.current = true;
      onSwipe(dx < 0 ? 1 : -1);
    },
    // The browser took the gesture over (a vertical scroll): not a swipe.
    onPointerCancel() {
      start.current = null;
    },
    onClickCapture(event: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
