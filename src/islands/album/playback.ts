/**
 * Videos in their mounts, with sound, looping (owner requests). On the writer
 * iPads they play by themselves; on the public album a tap plays them. The
 * rules that keep that bearable:
 *
 * - **One voice at a time.** Only one video plays; the one that most recently
 *   came into view (or was asked to play) wins, and the rest pause.
 * - **Only in view.** A video plays while at least 60% of it is on screen.
 * - **Held while it would get in the way.** While a video is being recorded
 *   (its sound would end up in the new recording) and while the pen is on a
 *   page (nothing moves near the canvas), every video pauses.
 * - **Reduced motion** turns autoplay off; a tap still plays.
 * - **Sound, always (owner request).** A video is never played muted. If the
 *   browser refuses to start sound without a tap — iOS Safari may — the video
 *   stays paused on its poster, and a tap on it starts it, with sound.
 *
 * One module for the page, because there is one album island.
 */

const VISIBLE_SHARE = 0.6;

interface Player {
  video: HTMLVideoElement;
  visible: boolean;
  /** When it last came into view or was asked to play: the newest wins. */
  wantedAt: number;
  /** The guest paused it: it stays paused until they play it again. */
  pausedByGuest: boolean;
}

const players = new Set<Player>();
const holds = new Set<string>();
let observer: IntersectionObserver | null = null;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function startWithSound(video: HTMLVideoElement) {
  video.muted = false;
  video.volume = 1;
  // Refused (no tap yet): it stays paused, never silent. A tap plays it.
  void video.play().catch(() => undefined);
}

function settle() {
  let chosen: Player | null = null;
  if (holds.size === 0) {
    for (const player of players) {
      if (!player.visible || player.pausedByGuest) continue;
      if (!chosen || player.wantedAt > chosen.wantedAt) chosen = player;
    }
  }
  for (const player of players) {
    if (player === chosen) {
      if (player.video.paused) startWithSound(player.video);
    } else if (!player.video.paused) {
      player.video.pause();
    }
  }
}

function playerOf(video: HTMLVideoElement): Player | undefined {
  for (const player of players) if (player.video === video) return player;
  return undefined;
}

function observe(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (records) => {
      for (const record of records) {
        const player = playerOf(record.target as HTMLVideoElement);
        if (!player) continue;
        const visible = record.intersectionRatio >= VISIBLE_SHARE;
        if (visible && !player.visible) player.wantedAt = performance.now();
        player.visible = visible;
      }
      settle();
    },
    { threshold: [0, VISIBLE_SHARE, 1] },
  );
  return observer;
}

/**
 * Starts managing a mount's video; returns the function that stops it.
 * `autoplay: false` (the public album) waits for a tap.
 */
export function registerVideo(video: HTMLVideoElement, { autoplay = true }: { autoplay?: boolean } = {}): () => void {
  // Reduced motion: nothing starts by itself, but the guest can still play it.
  const player: Player = { video, visible: false, wantedAt: 0, pausedByGuest: !autoplay || reducedMotion() };
  players.add(player);
  observe().observe(video);
  return () => {
    observer?.unobserve(video);
    players.delete(player);
    video.pause();
    settle();
  };
}

/** The guest's own play or pause, from a tap: always honoured. */
export function toggleByGuest(video: HTMLVideoElement) {
  const player = playerOf(video);
  if (!player) return;
  if (!video.paused) {
    player.pausedByGuest = true;
    video.pause();
    return;
  }
  // Not while a video is being recorded: its sound would be in the recording.
  if (holds.has('recording')) return;
  player.pausedByGuest = false;
  player.wantedAt = performance.now();
  for (const other of players) if (other !== player && !other.video.paused) other.video.pause();
  // Called inside the tap: this is the moment sound is always allowed.
  video.muted = false;
  video.volume = 1;
  void video.play().catch(() => undefined);
}

/** Pauses every video while `reason` holds (recording, pen down); resumes after. */
export function holdPlayback(reason: string, held: boolean) {
  if (held) holds.add(reason);
  else holds.delete(reason);
  settle();
}
