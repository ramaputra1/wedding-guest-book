/**
 * Recording with MediaRecorder: H.264 MP4 at 720p, stopped hard at 15 s.
 * Then a poster frame and a thumbnail are cut from the recording itself.
 */
import { toJpeg, fitWithin, PHOTO_MAX_EDGE, THUMB_MAX_EDGE } from './photo';

export interface Recording {
  blob: Blob;
  durationMs: number;
}

export interface RecordingControl {
  /** Stops early; the recording still completes normally. */
  stop(): void;
  done: Promise<Recording>;
}

/** ≈2.5 Mb/s video + 96 kb/s audio: a 15-second clip lands near 5 MB. */
const VIDEO_BITS_PER_SECOND = 2_500_000;
const AUDIO_BITS_PER_SECOND = 96_000;

export function startRecording(
  stream: MediaStream,
  mimeType: string,
  maxMs: number,
  onProgress: (fraction: number) => void,
): RecordingControl {
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let startedAt = 0;
  let frame = 0;
  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  // The hard stop. Not tied to the progress loop, so a throttled tab cannot run long.
  const cap = setTimeout(stop, maxMs);

  const done = new Promise<Recording>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Recording failed.'));
    recorder.onstop = () => {
      clearTimeout(cap);
      cancelAnimationFrame(frame);
      onProgress(1);
      const durationMs = Math.min(maxMs, Math.round(performance.now() - startedAt));
      resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType }), durationMs });
    };
  });

  const tick = () => {
    onProgress(Math.min(1, (performance.now() - startedAt) / maxMs));
    if (recorder.state === 'recording') frame = requestAnimationFrame(tick);
  };
  recorder.start();
  startedAt = performance.now();
  frame = requestAnimationFrame(tick);

  return { stop, done };
}

export interface VideoStills {
  poster: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** From the file's own metadata, when the browser reports it. */
  durationMs: number | null;
}

function once(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), timeoutMs);
    target.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/** True when a frame is near-black: a camera that had not woken up yet. */
function isMostlyBlack(video: HTMLVideoElement): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(video, 0, 0, 16, 16);
  const { data } = context.getImageData(0, 0, 16, 16);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += data[i] + data[i + 1] + data[i + 2];
  return total / (data.length / 4) / 3 < 10;
}

/**
 * The poster is a real frame, never black: try the first frames, and move a
 * little later if the camera had not exposed the first one yet.
 */
export async function videoStills(blob: Blob): Promise<VideoStills> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    try {
      await once(video, 'loadeddata', 4_000);
    } catch {
      // iOS sometimes decodes nothing until playback is asked for.
      await video.play().catch(() => undefined);
      video.pause();
      await once(video, 'loadeddata', 4_000);
    }
    for (const time of [0.1, 0.5, 1.0, 2.0]) {
      if (Number.isFinite(video.duration) && time > video.duration) break;
      video.currentTime = time;
      await once(video, 'seeked', 4_000);
      if (!isMostlyBlack(video)) break;
    }
    const { videoWidth: width, videoHeight: height } = video;
    const full = fitWithin(width, height, PHOTO_MAX_EDGE);
    const small = fitWithin(width, height, THUMB_MAX_EDGE);
    const [poster, thumb] = await Promise.all([toJpeg(video, full.width, full.height, 0.85), toJpeg(video, small.width, small.height, 0.72)]);
    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null;
    return { poster, thumb, width, height, durationMs };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

